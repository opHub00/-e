-- Production-shaped persistence boundary for the administrator review console.
-- Applying this file is gated by scripts/rule-review-staging.mjs; it contains no seed data.
begin;

create table public.assessment_review_members (
  user_id uuid primary key,
  role text not null check (role in ('reviewer','admin')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.assessment_review_members enable row level security;
revoke all on public.assessment_review_members from public, anon, authenticated;
grant all on public.assessment_review_members to service_role;

create function public.get_assessment_review_access()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('role', (
    select m.role from public.assessment_review_members m
    where m.user_id = auth.uid() and m.enabled
  ));
$$;

create function public.assert_assessment_review_access(p_admin boolean default false)
returns text language plpgsql stable security definer set search_path = '' as $$
declare reviewer_role text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select m.role into reviewer_role from public.assessment_review_members m where m.user_id=auth.uid() and m.enabled;
  if reviewer_role is null or (p_admin and reviewer_role <> 'admin') then raise exception 'FORBIDDEN'; end if;
  return reviewer_role;
end $$;

create function public.load_assessment_rule_review_workspace(p_rule_set_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public.assert_assessment_review_access(false);
  select jsonb_build_object(
    'ruleVersionId', s.id::text,
    'announcement', jsonb_build_object('id',a.id::text,'title',a.title),
    'document', jsonb_build_object('id',d.id::text,'fileName',d.file_name,'sha256',d.sha256,'versionLabel',coalesce(d.version_label,'')),
    'sourceStatus',s.source_status,'version',s.version,
    'lifecycleStatus',v.lifecycle_status,'revision',v.revision,
    'reviewedDocumentHash',v.reviewed_document_sha256,'currentDocumentHash',v.current_document_sha256,
    'rules',coalesce((select jsonb_agg(jsonb_build_object(
      'ruleId',r.candidate_rule_id,'ruleVersionId',r.rule_set_id::text,'required',r.is_required,'critical',r.is_critical,
      'candidateStatus',r.candidate_status,'safetyBlockers',to_jsonb(r.safety_blockers),'originalCandidate',r.original_candidate,
      'reviewStatus',r.review_status,'reviewerId',r.reviewer_id,'reviewedAt',r.reviewed_at,'reviewNote',r.review_note,
      'decisionReason',r.decision_reason,'originalCandidateHash',r.original_candidate_hash,'editedRuleSnapshot',r.edited_rule_snapshot,
      'editDiff',r.edit_diff,'resolvedBlockerCodes',to_jsonb(r.resolved_blockers),
      'evidenceReviews',coalesce((select jsonb_agg(jsonb_build_object('evidenceId',e.evidence_id,'status',e.review_status,
        'reviewerId',e.reviewer_id,'reviewedAt',e.reviewed_at,'note',e.review_note,'replacement',e.replacement_evidence) order by e.evidence_id)
        from public.assessment_rule_evidence_reviews e where e.rule_review_id=r.id),'[]'::jsonb)
    ) order by r.candidate_rule_id) from public.assessment_rule_reviews r where r.rule_set_id=s.id),'[]'::jsonb),
    'conflicts',coalesce((select jsonb_agg(jsonb_build_object('conflictId',c.id::text,'concept',c.concept,
      'candidateRuleIds',coalesce((select jsonb_agg(x->>'candidateId') from jsonb_array_elements(c.candidates) x),'[]'::jsonb),
      'candidates',c.candidates,'resolution',c.resolution,'reviewedBy',c.reviewer_id,'reviewedAt',c.reviewed_at) order by c.id)
      from public.assessment_rule_review_conflicts c where c.rule_set_id=s.id),'[]'::jsonb),
    'unresolvedItems',coalesce((select jsonb_agg(jsonb_build_object('unresolvedId',u.id::text,'type',u.issue_type,'description',u.description,
      'ruleIds',to_jsonb(u.rule_ids),'resolution',u.resolution,'reviewedBy',u.reviewer_id,'reviewedAt',u.reviewed_at) order by u.id)
      from public.assessment_rule_review_unresolved u where u.rule_set_id=s.id),'[]'::jsonb),
    'exceptionReviews',coalesce((select jsonb_agg(jsonb_build_object('exceptionRuleId',e.exception_rule_id,'baseRuleId',e.base_rule_id,
      'relationType',e.relation_type,'status',e.review_status,'reason',e.decision_reason) order by e.exception_rule_id)
      from public.assessment_rule_exception_reviews e where e.rule_set_id=s.id),'[]'::jsonb),
    'requiredCategories',coalesce((select jsonb_agg(distinct jsonb_build_object('supplyType',r.original_candidate->>'supplyType','category',r.original_candidate->>'category'))
      from public.assessment_rule_reviews r where r.rule_set_id=s.id and r.is_required),'[]'::jsonb),
    'auditLog',coalesce((select jsonb_agg(jsonb_build_object('sequence',l.id,'actor',l.actor_id,'at',l.created_at,'action',l.action,
      'targetType',l.target_type,'targetId',l.target_id,'before',l.before_snapshot,'after',l.after_snapshot,'reason',l.reason) order by l.id)
      from public.assessment_rule_review_audit_log l where l.rule_set_id=s.id),'[]'::jsonb)
  ) into result
  from public.assessment_rule_sets s join public.announcements a on a.id=s.announcement_id
  join public.announcement_documents d on d.id=s.document_id
  join public.assessment_rule_review_versions v on v.rule_set_id=s.id where s.id=p_rule_set_id;
  if result is null then raise exception 'RULE_REVIEW_WORKSPACE_NOT_FOUND'; end if;
  return result;
end $$;

create function public.mutate_assessment_rule_review(
  p_rule_set_id uuid, p_expected_revision bigint, p_action text, p_target_id text,
  p_payload jsonb default '{}'::jsonb, p_reason text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.assessment_rule_review_versions; r public.assessment_rule_reviews; before_value jsonb; after_value jsonb;
  actor text := auth.uid()::text; ids text[]; item text; decision jsonb; status text;
begin
  perform public.assert_assessment_review_access(p_action in ('INVALIDATE_DOCUMENT'));
  if length(trim(coalesce(p_reason,'')))=0 then raise exception 'REASON_REQUIRED'; end if;
  select * into v from public.assessment_rule_review_versions where rule_set_id=p_rule_set_id for update;
  if not found then raise exception 'RULE_REVIEW_WORKSPACE_NOT_FOUND'; end if;
  if v.revision <> p_expected_revision then raise exception 'STALE_REVIEW_REVISION'; end if;
  if p_action <> 'START_REVIEW' and p_action <> 'INVALIDATE_DOCUMENT' and v.lifecycle_status <> 'IN_REVIEW' then raise exception 'REVIEW_NOT_IN_PROGRESS'; end if;

  if p_action='START_REVIEW' then
    if v.lifecycle_status <> 'PENDING_REVIEW' then raise exception 'REVIEW_ALREADY_STARTED'; end if;
    before_value:=to_jsonb(v); update public.assessment_rule_review_versions set lifecycle_status='IN_REVIEW',revision=revision+1,updated_at=now() where rule_set_id=p_rule_set_id returning to_jsonb(assessment_rule_review_versions.*) into after_value;
  elsif p_action in ('APPROVE_RULE','HOLD_RULE','REJECT_RULE','APPROVE_RULE_WITH_EDIT') then
    select * into r from public.assessment_rule_reviews where rule_set_id=p_rule_set_id and candidate_rule_id=p_target_id for update;
    if not found then raise exception 'RULE_NOT_FOUND'; end if; before_value:=to_jsonb(r);
    if p_action in ('APPROVE_RULE','APPROVE_RULE_WITH_EDIT') and r.is_critical and not exists(
      select 1 from public.assessment_rule_evidence_reviews e where e.rule_review_id=r.id and e.review_status in ('VALID','REPLACED')) then raise exception 'CRITICAL_RULE_REQUIRES_VALID_EVIDENCE'; end if;
    if p_action='APPROVE_RULE' and not (r.safety_blockers <@ r.resolved_blockers) then raise exception 'RULE_HAS_SAFETY_BLOCKERS'; end if;
    if p_action='APPROVE_RULE_WITH_EDIT' then
      if jsonb_typeof(p_payload->'editedRuleSnapshot') <> 'object' then raise exception 'EDIT_REQUIRED'; end if;
      if p_payload->'editedRuleSnapshot'->>'ruleKey' is distinct from r.original_candidate->>'ruleKey' then raise exception 'EDIT_IDENTITY_OR_DOCUMENT_MISMATCH'; end if;
      if exists(select 1 from jsonb_array_elements(coalesce(p_payload->'editedRuleSnapshot'->'evidence','[]'::jsonb)) e
        where e->>'documentId' is distinct from (select s.document_id::text from public.assessment_rule_sets s where s.id=p_rule_set_id)) then raise exception 'EDIT_IDENTITY_OR_DOCUMENT_MISMATCH'; end if;
      if not (r.safety_blockers <@ array(select jsonb_array_elements_text(coalesce(p_payload->'resolvedBlockers','[]'::jsonb)))) then raise exception 'UNRESOLVED_SAFETY_BLOCKERS'; end if;
      update public.assessment_rule_reviews set review_status='APPROVED_WITH_EDIT',reviewer_id=actor,reviewed_at=now(),decision_reason=p_reason,
        edited_rule_snapshot=p_payload->'editedRuleSnapshot',edit_diff=jsonb_build_array(jsonb_build_object('path','$','before',original_candidate,'after',p_payload->'editedRuleSnapshot')),
        resolved_blockers=array(select jsonb_array_elements_text(coalesce(p_payload->'resolvedBlockers','[]'::jsonb))),revision=revision+1,updated_at=now() where id=r.id returning to_jsonb(assessment_rule_reviews.*) into after_value;
    else
      status:=case p_action when 'APPROVE_RULE' then 'APPROVED' when 'HOLD_RULE' then 'HELD' else 'REJECTED' end;
      update public.assessment_rule_reviews set review_status=status,reviewer_id=actor,reviewed_at=now(),decision_reason=p_reason,
        edited_rule_snapshot=case when status='APPROVED' then null else edited_rule_snapshot end,
        edit_diff=case when status='APPROVED' then '[]'::jsonb else edit_diff end,revision=revision+1,updated_at=now() where id=r.id returning to_jsonb(assessment_rule_reviews.*) into after_value;
    end if;
    update public.assessment_rule_review_versions set revision=revision+1,updated_at=now() where rule_set_id=p_rule_set_id;
  elsif p_action='REVIEW_EVIDENCE' then
    select * into r from public.assessment_rule_reviews where rule_set_id=p_rule_set_id and candidate_rule_id=p_target_id for update;
    status:=p_payload->>'status'; if status not in ('VALID','INVALID','REPLACED','NEEDS_REVIEW') then raise exception 'INVALID_EVIDENCE_STATUS'; end if;
    if status='REPLACED' and jsonb_typeof(p_payload->'replacement') <> 'object' then raise exception 'VALID_REPLACEMENT_EVIDENCE_REQUIRED'; end if;
    if status='REPLACED' and p_payload->'replacement'->>'documentId' is distinct from (select s.document_id::text from public.assessment_rule_sets s where s.id=p_rule_set_id) then raise exception 'VALID_REPLACEMENT_EVIDENCE_REQUIRED'; end if;
    select to_jsonb(e) into before_value from public.assessment_rule_evidence_reviews e where e.rule_review_id=r.id and e.evidence_id=p_payload->>'evidenceId';
    update public.assessment_rule_evidence_reviews set review_status=status,reviewer_id=actor,reviewed_at=now(),review_note=p_reason,
      replacement_evidence=case when status='REPLACED' then p_payload->'replacement' else null end,updated_at=now()
      where rule_review_id=r.id and evidence_id=p_payload->>'evidenceId' returning to_jsonb(assessment_rule_evidence_reviews.*) into after_value;
    if after_value is null then raise exception 'EVIDENCE_NOT_FOUND'; end if;
    update public.assessment_rule_review_versions set revision=revision+1,updated_at=now() where rule_set_id=p_rule_set_id;
  elsif p_action='RESOLVE_CONFLICT' then
    decision:=p_payload->'resolution'; if jsonb_typeof(decision)<>'object' then raise exception 'RESOLUTION_REQUIRED'; end if;
    if decision->>'type'='CUSTOM' and (jsonb_array_length(coalesce(decision->'evidenceIds','[]'::jsonb))=0 or exists(
      select 1 from jsonb_array_elements_text(decision->'evidenceIds') wanted where not exists(
        select 1 from public.assessment_rule_reviews rr, jsonb_array_elements(coalesce(rr.original_candidate->'evidence','[]'::jsonb)) ev
        where rr.rule_set_id=p_rule_set_id and ev->>'id'=wanted
      ))) then raise exception 'CUSTOM_RESOLUTION_REQUIRES_VALID_EVIDENCE'; end if;
    select to_jsonb(c) into before_value from public.assessment_rule_review_conflicts c where c.id=p_target_id::uuid and c.rule_set_id=p_rule_set_id;
    update public.assessment_rule_review_conflicts set resolution=decision,resolution_status=case when decision->>'type'='HELD' then 'HELD' else 'RESOLVED' end,
      reviewer_id=actor,reviewed_at=now(),updated_at=now() where id=p_target_id::uuid and rule_set_id=p_rule_set_id returning to_jsonb(assessment_rule_review_conflicts.*) into after_value;
    if after_value is null then raise exception 'CONFLICT_NOT_FOUND'; end if; update public.assessment_rule_review_versions set revision=revision+1,updated_at=now() where rule_set_id=p_rule_set_id;
  elsif p_action='RESOLVE_UNRESOLVED' then
    if length(trim(coalesce(p_payload->>'resolution','')))=0 then raise exception 'RESOLUTION_REQUIRED'; end if;
    select to_jsonb(u) into before_value from public.assessment_rule_review_unresolved u where u.id=p_target_id::uuid and u.rule_set_id=p_rule_set_id;
    update public.assessment_rule_review_unresolved set resolution=p_payload->>'resolution',reviewer_id=actor,reviewed_at=now()
      where id=p_target_id::uuid and rule_set_id=p_rule_set_id returning to_jsonb(assessment_rule_review_unresolved.*) into after_value;
    if after_value is null then raise exception 'UNRESOLVED_NOT_FOUND'; end if; update public.assessment_rule_review_versions set revision=revision+1,updated_at=now() where rule_set_id=p_rule_set_id;
  elsif p_action='REVIEW_EXCEPTION' then
    decision:=p_payload->'decision'; status:=decision->>'status'; if status not in ('LINKED','INDEPENDENT','EXCLUDED','HELD') then raise exception 'INVALID_EXCEPTION_DECISION'; end if;
    if status='LINKED' and (decision->>'baseRuleId' is null or decision->>'relationType' not in ('LIMITED_BY','EXEMPTED_BY','OVERRIDDEN_BY','QUALIFIED_BY','APPLIES_ONLY_IF')) then raise exception 'VALID_EXCEPTION_RELATION_REQUIRED'; end if;
    select to_jsonb(e) into before_value from public.assessment_rule_exception_reviews e where e.rule_set_id=p_rule_set_id and e.exception_rule_id=p_target_id;
    update public.assessment_rule_exception_reviews set review_status=status,base_rule_id=case when status='LINKED' then decision->>'baseRuleId' else null end,
      relation_type=case when status='LINKED' then decision->>'relationType' else null end,decision_reason=p_reason,reviewer_id=actor,reviewed_at=now(),updated_at=now()
      where rule_set_id=p_rule_set_id and exception_rule_id=p_target_id returning to_jsonb(assessment_rule_exception_reviews.*) into after_value;
    if after_value is null then raise exception 'EXCEPTION_NOT_FOUND'; end if; update public.assessment_rule_review_versions set revision=revision+1,updated_at=now() where rule_set_id=p_rule_set_id;
  elsif p_action='BULK_APPROVE_SAFE' then
    ids:=array(select jsonb_array_elements_text(coalesce(p_payload->'ruleIds','[]'::jsonb))); if coalesce(array_length(ids,1),0)=0 then raise exception 'BULK_RULES_REQUIRED'; end if;
    if (select count(*) from public.assessment_rule_reviews r where r.rule_set_id=p_rule_set_id and r.candidate_rule_id=any(ids)) <> cardinality(ids) then raise exception 'RULE_NOT_FOUND'; end if;
    if exists(select 1 from public.assessment_rule_reviews r where r.rule_set_id=p_rule_set_id and r.candidate_rule_id=any(ids)
      and (r.is_critical or r.is_required or r.candidate_status<>'AUTO_SAFE_CANDIDATE' or cardinality(r.safety_blockers)>0 or r.original_candidate->>'category'='EXCEPTION'
        or not exists(select 1 from public.assessment_rule_evidence_reviews e where e.rule_review_id=r.id and e.review_status in ('VALID','REPLACED'))
        or exists(select 1 from public.assessment_rule_review_conflicts c, jsonb_array_elements(c.candidates) x where c.rule_set_id=p_rule_set_id and c.resolution_status<>'RESOLVED' and x->>'candidateId'=r.candidate_rule_id)
        or exists(select 1 from public.assessment_rule_review_unresolved u where u.rule_set_id=p_rule_set_id and u.resolution is null and r.candidate_rule_id=any(u.rule_ids)))) then raise exception 'BULK_APPROVAL_UNSAFE'; end if;
    before_value:=to_jsonb(ids); foreach item in array ids loop
      update public.assessment_rule_reviews set review_status='APPROVED',reviewer_id=actor,reviewed_at=now(),decision_reason=p_reason,revision=revision+1,updated_at=now()
      where rule_set_id=p_rule_set_id and candidate_rule_id=item;
    end loop; after_value:=to_jsonb(ids); update public.assessment_rule_review_versions set revision=revision+1,updated_at=now() where rule_set_id=p_rule_set_id;
  elsif p_action='INVALIDATE_DOCUMENT' then
    if coalesce(p_payload->>'hash','') !~ '^[0-9a-f]{64}$' or p_payload->>'hash'=v.current_document_sha256 then raise exception 'NEW_DOCUMENT_HASH_REQUIRED'; end if;
    if not exists(select 1 from public.announcement_documents d join public.assessment_rule_sets s on s.announcement_id=d.announcement_id
      where s.id=p_rule_set_id and d.sha256=p_payload->>'hash') then raise exception 'DOCUMENT_HASH_NOT_REGISTERED'; end if;
    before_value:=to_jsonb(v); update public.assessment_rule_review_versions set current_document_sha256=p_payload->>'hash',lifecycle_status='REVALIDATION_REQUIRED',revision=revision+1,updated_at=now()
      where rule_set_id=p_rule_set_id returning to_jsonb(assessment_rule_review_versions.*) into after_value;
  else raise exception 'UNKNOWN_REVIEW_ACTION'; end if;

  insert into public.assessment_rule_review_audit_log(rule_set_id,actor_id,action,target_type,target_id,before_snapshot,after_snapshot,reason)
    values(p_rule_set_id,actor,p_action,case when p_action like '%RULE%' then 'RULE' else 'REVIEW' end,coalesce(p_target_id,p_rule_set_id::text),before_value,after_value,p_reason);
  return public.load_assessment_rule_review_workspace(p_rule_set_id);
end $$;

create function public.activate_reviewed_assessment_rule_set(p_rule_set_id uuid,p_expected_revision bigint,p_expected_active_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actual_revision bigint; gate jsonb;
begin
  perform public.assert_assessment_review_access(true);
  select revision into actual_revision from public.assessment_rule_review_versions where rule_set_id=p_rule_set_id for update;
  if actual_revision is distinct from p_expected_revision then raise exception 'STALE_REVIEW_REVISION'; end if;
  gate:=public.can_activate_assessment_rule_version(p_rule_set_id); if not (gate->>'canActivate')::boolean then raise exception 'ACTIVATION_BLOCKED'; end if;
  return public.activate_assessment_rule_set(p_rule_set_id,p_expected_active_id);
end $$;

-- Trusted staging/bootstrap entrypoint. Candidate source stays immutable after this transaction.
create function public.seed_assessment_rule_review(p_rule_set_id uuid,p_seed jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare source_hash text; item jsonb; review_id uuid; materialized uuid; conflict jsonb; unresolved jsonb;
begin
  select d.sha256 into source_hash from public.assessment_rule_sets s join public.announcement_documents d on d.id=s.document_id where s.id=p_rule_set_id;
  if source_hash is null then raise exception 'RULE_SET_DOCUMENT_REQUIRED'; end if;
  if exists(select 1 from public.assessment_rule_review_versions where rule_set_id=p_rule_set_id) then raise exception 'REVIEW_SEED_ALREADY_EXISTS'; end if;
  insert into public.assessment_rule_review_versions(rule_set_id,reviewed_document_sha256,current_document_sha256) values(p_rule_set_id,source_hash,source_hash);
  for item in select * from jsonb_array_elements(coalesce(p_seed->'rules','[]'::jsonb)) loop
    select r.id into materialized from public.assessment_rules r where r.rule_set_id=p_rule_set_id and r.rule_key=item->'originalCandidate'->>'ruleKey';
    if materialized is null then raise exception 'MATERIALIZED_RULE_NOT_FOUND: %',item->'originalCandidate'->>'ruleKey'; end if;
    insert into public.assessment_rule_reviews(rule_set_id,candidate_rule_id,materialized_rule_id,original_candidate_hash,original_candidate,
      critical_category,is_critical,is_required,candidate_status,safety_blockers)
      values(p_rule_set_id,item->>'ruleId',materialized,item->>'originalCandidateHash',item->'originalCandidate',item->'originalCandidate'->>'category',
        coalesce((item->>'critical')::boolean,false),coalesce((item->>'required')::boolean,false),item->>'candidateStatus',
        array(select jsonb_array_elements_text(coalesce(item->'safetyBlockers','[]'::jsonb)))) returning id into review_id;
    insert into public.assessment_rule_evidence_reviews(rule_review_id,evidence_id)
      select review_id,e->>'id' from jsonb_array_elements(coalesce(item->'originalCandidate'->'evidence','[]'::jsonb)) e;
    if item->'originalCandidate'->>'category'='EXCEPTION' then
      insert into public.assessment_rule_exception_reviews(rule_set_id,exception_rule_id) values(p_rule_set_id,item->>'ruleId');
    end if;
  end loop;
  for conflict in select * from jsonb_array_elements(coalesce(p_seed->'conflicts','[]'::jsonb)) loop
    insert into public.assessment_rule_review_conflicts(rule_set_id,concept,candidates) values(p_rule_set_id,conflict->>'concept',conflict->'candidates');
  end loop;
  for unresolved in select * from jsonb_array_elements(coalesce(p_seed->'unresolvedItems','[]'::jsonb)) loop
    insert into public.assessment_rule_review_unresolved(rule_set_id,issue_type,description,rule_ids) values(p_rule_set_id,unresolved->>'type',unresolved->>'description',
      array(select jsonb_array_elements_text(coalesce(unresolved->'ruleIds','[]'::jsonb))));
  end loop;
  return jsonb_build_object('ruleSetId',p_rule_set_id,'status','PENDING_REVIEW');
end $$;

revoke all on function public.get_assessment_review_access(), public.assert_assessment_review_access(boolean),
  public.load_assessment_rule_review_workspace(uuid), public.mutate_assessment_rule_review(uuid,bigint,text,text,jsonb,text),
  public.activate_reviewed_assessment_rule_set(uuid,bigint,uuid), public.seed_assessment_rule_review(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.get_assessment_review_access(), public.load_assessment_rule_review_workspace(uuid),
  public.mutate_assessment_rule_review(uuid,bigint,text,text,jsonb,text), public.activate_reviewed_assessment_rule_set(uuid,bigint,uuid) to authenticated;
grant execute on function public.assert_assessment_review_access(boolean) to service_role;
grant execute on function public.get_assessment_review_access(), public.load_assessment_rule_review_workspace(uuid),
  public.mutate_assessment_rule_review(uuid,bigint,text,text,jsonb,text), public.activate_reviewed_assessment_rule_set(uuid,bigint,uuid),
  public.seed_assessment_rule_review(uuid,jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
