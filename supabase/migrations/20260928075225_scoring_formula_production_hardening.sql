-- Production-preflight corrections for the versioned scoring-formula backend.
--
-- This is deliberately a follow-up migration. The original timestamped migration
-- has existed on multiple remote branches and its database application history
-- cannot be disproved from the repository alone, so changing it would make an
-- already-applied database diverge from a clean database.
begin;

-- Reviewer/admin snapshots may identify the actor. Public active snapshots remove
-- the entire actors object and direct table reads are revoked below.
create or replace function public.scoring_formula_actor(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
select case when p_user_id is null then null else jsonb_build_object(
  'userId',p_user_id::text,
  'email',(select u.email from auth.users u where u.id=p_user_id),
  'displayLabel',coalesce((select u.email from auth.users u where u.id=p_user_id),p_user_id::text),
  'role',(select m.role from public.assessment_review_members m where m.user_id=p_user_id and m.enabled)
) end $$;

create or replace function public.get_scoring_formula_audit(p_formula_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform public.assert_assessment_review_access(false);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',l.id,
    'action',l.action,
    'actorUserId',l.actor_user_id,
    'actor',public.scoring_formula_actor(l.actor_user_id),
    'reason',l.reason,
    'before',l.before_snapshot,
    'after',l.after_snapshot,
    'revision',l.formula_revision,
    'createdAt',l.created_at
  ) order by l.id) from public.scoring_formula_audit_logs l where l.formula_id=p_formula_id),'[]'::jsonb);
end $$;

-- A duplicate slug/version is a normal domain conflict, not a raw unique-index
-- failure. Only safe version metadata is included in the error detail.
create or replace function public.raise_scoring_version_conflict(p_slug text,p_version text)
returns void language plpgsql stable security definer set search_path='' as $$
declare existing public.scoring_formulas%rowtype; safe_detail jsonb;
begin
  select * into existing from public.scoring_formulas
   where slug=p_slug and version=p_version
   order by created_at desc limit 1;
  safe_detail:=jsonb_build_object(
    'code','SCORING_VERSION_CONFLICT',
    'existingVersion',case when existing.id is null then null else jsonb_build_object(
      'id',existing.id::text,'version',existing.version,'status',existing.status,'updatedAt',existing.updated_at) end,
    'existingDraft',case when existing.status in ('DRAFT','IN_REVIEW') then jsonb_build_object(
      'id',existing.id::text,'version',existing.version,'status',existing.status,'updatedAt',existing.updated_at) else null end
  );
  raise exception using message='SCORING_VERSION_CONFLICT',detail=safe_detail::text,errcode='P0001';
end $$;

create or replace function public.create_scoring_formula_draft(p_input jsonb,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; result uuid;
begin
  perform public.assert_assessment_review_access(true); actor:=auth.uid();
  if length(trim(p_reason))<3 then raise exception 'REASON_REQUIRED'; end if;
  begin
    insert into public.scoring_formulas(slug,version,name,description,target,scope_key,applicable_scope,status,published_to_users,legal_basis,interpretations,created_by,updated_by)
    values(p_input->>'slug',p_input->>'version',p_input->>'name',coalesce(p_input->>'description',''),p_input->>'target',p_input->>'scopeKey',
      coalesce(p_input->'applicableScope','{}'), 'DRAFT',false,p_input->>'legalBasis',coalesce(p_input->'interpretations','[]'),actor,actor)
    returning id into result;
  exception when unique_violation then
    perform public.raise_scoring_version_conflict(p_input->>'slug',p_input->>'version');
  end;
  insert into public.scoring_formula_audit_logs(formula_id,action,actor_user_id,reason,after_snapshot,formula_revision)
  values(result,'CREATE',actor,p_reason,public.scoring_formula_snapshot(result),0);
  return public.scoring_formula_snapshot(result);
end $$;

create or replace function public.clone_scoring_formula_version(p_formula_id uuid,p_version text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; source public.scoring_formulas%rowtype; result uuid;
begin
  perform public.assert_assessment_review_access(true); actor:=auth.uid();
  select * into source from public.scoring_formulas where id=p_formula_id;
  if not found then raise exception 'SCORING_FORMULA_NOT_FOUND'; end if;
  if length(trim(p_reason))<3 then raise exception 'REASON_REQUIRED'; end if;
  begin
    insert into public.scoring_formulas(slug,version,name,description,target,scope_key,applicable_scope,status,published_to_users,legal_basis,interpretations,created_by,updated_by)
    values(source.slug,p_version,source.name,source.description,source.target,source.scope_key,source.applicable_scope,'DRAFT',false,source.legal_basis,source.interpretations,actor,actor)
    returning id into result;
  exception when unique_violation then
    perform public.raise_scoring_version_conflict(source.slug,p_version);
  end;
  insert into public.scoring_formula_items(id,formula_id,item_key,label,description,unit,fact,display_order,declared_max_score)
  select gen_random_uuid(),result,item_key,label,description,unit,fact,display_order,declared_max_score
    from public.scoring_formula_items where formula_id=p_formula_id;
  insert into public.scoring_formula_bands(item_id,display_order,min_value,max_value,points,label,note)
  select ni.id,b.display_order,b.min_value,b.max_value,b.points,b.label,b.note
    from public.scoring_formula_bands b
    join public.scoring_formula_items oi on oi.id=b.item_id
    join public.scoring_formula_items ni on ni.formula_id=result and ni.item_key=oi.item_key;
  insert into public.scoring_formula_test_cases(formula_id,case_key,label,inputs,expected_total,expected_breakdown,display_order)
  select result,case_key,label,inputs,expected_total,expected_breakdown,display_order
    from public.scoring_formula_test_cases where formula_id=p_formula_id;
  insert into public.scoring_formula_audit_logs(formula_id,action,actor_user_id,reason,before_snapshot,after_snapshot,formula_revision)
  values(result,'CLONE',actor,p_reason,public.scoring_formula_snapshot(p_formula_id),public.scoring_formula_snapshot(result),0);
  return public.scoring_formula_snapshot(result);
end $$;

-- Operational correction path. Returning an IN_REVIEW version to DRAFT does not
-- modify a published snapshot and preserves revision/audit history.
create or replace function public.return_scoring_formula_to_draft(
  p_formula_id uuid,p_expected_revision bigint,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; current public.scoring_formulas%rowtype; before_value jsonb;
begin
  perform public.assert_assessment_review_access(true); actor:=auth.uid();
  select * into current from public.scoring_formulas where id=p_formula_id for update;
  if not found then raise exception 'SCORING_FORMULA_NOT_FOUND'; end if;
  if current.revision<>p_expected_revision then raise exception 'SCORING_STALE_REVISION'; end if;
  if current.status<>'IN_REVIEW' then raise exception 'SCORING_STATUS_INVALID'; end if;
  if length(trim(p_reason))<3 then raise exception 'REASON_REQUIRED'; end if;
  before_value:=public.scoring_formula_snapshot(p_formula_id);
  update public.scoring_formulas set status='DRAFT',revision=revision+1,updated_at=now(),updated_by=actor
   where id=p_formula_id;
  insert into public.scoring_formula_audit_logs(formula_id,action,actor_user_id,reason,before_snapshot,after_snapshot,formula_revision)
  values(p_formula_id,'RETURN_TO_DRAFT',actor,p_reason,before_value,public.scoring_formula_snapshot(p_formula_id),current.revision+1);
  return public.scoring_formula_snapshot(p_formula_id);
end $$;

-- Activation is a reviewed transition only. ACTIVE and RETIRED versions remain
-- immutable; the only route back to an editable lifecycle is clone -> DRAFT.
create or replace function public.activate_scoring_formula(p_formula_id uuid,p_expected_revision bigint,p_publish_to_users boolean,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; current public.scoring_formulas%rowtype; test record; evaluated jsonb; prior record; before_value jsonb; prior_before jsonb;
begin
  perform public.assert_assessment_review_access(true); actor:=auth.uid();
  select * into current from public.scoring_formulas where id=p_formula_id for update;
  if not found then raise exception 'SCORING_FORMULA_NOT_FOUND'; end if;
  if current.revision<>p_expected_revision then raise exception 'SCORING_STALE_REVISION'; end if;
  if current.status<>'IN_REVIEW' then raise exception 'SCORING_STATUS_INVALID'; end if;
  if length(trim(p_reason))<3 then raise exception 'REASON_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtext('scoring:'||current.scope_key));
  if jsonb_array_length(public.validate_scoring_formula(p_formula_id))>0 then raise exception 'SCORING_VALIDATION_FAILED'; end if;
  if not exists(select 1 from public.scoring_formula_test_cases where formula_id=p_formula_id) then raise exception 'SCORING_TEST_CASE_FAILED'; end if;
  for test in select * from public.scoring_formula_test_cases where formula_id=p_formula_id loop
    evaluated:=public.evaluate_scoring_formula_snapshot(p_formula_id,test.inputs);
    if evaluated->>'total' is null or (evaluated->>'total')::int<>test.expected_total then raise exception 'SCORING_TEST_CASE_FAILED'; end if;
  end loop;
  before_value:=public.scoring_formula_snapshot(p_formula_id);
  perform set_config('wanpane.scoring_internal','lifecycle',true);
  for prior in select * from public.scoring_formulas where scope_key=current.scope_key and status='ACTIVE' and id<>p_formula_id for update loop
    prior_before:=public.scoring_formula_snapshot(prior.id);
    update public.scoring_formulas set status='RETIRED',published_to_users=false,retired_at=now(),revision=revision+1,updated_at=now(),updated_by=actor where id=prior.id;
    insert into public.scoring_formula_audit_logs(formula_id,action,actor_user_id,reason,before_snapshot,after_snapshot,formula_revision)
    values(prior.id,'AUTO_RETIRE_FOR_REPLACEMENT',actor,p_reason,prior_before,public.scoring_formula_snapshot(prior.id),prior.revision+1);
  end loop;
  update public.scoring_formulas set status='ACTIVE',published_to_users=p_publish_to_users,activated_at=now(),activated_by=actor,retired_at=null,revision=revision+1,updated_at=now(),updated_by=actor where id=p_formula_id;
  insert into public.scoring_formula_audit_logs(formula_id,action,actor_user_id,reason,before_snapshot,after_snapshot,formula_revision)
  values(p_formula_id,'ACTIVATE',actor,p_reason,before_value,public.scoring_formula_snapshot(p_formula_id),current.revision+1);
  return public.scoring_formula_snapshot(p_formula_id);
exception when unique_violation then raise exception 'SCORING_SCOPE_ALREADY_ACTIVE';
end $$;

-- Public consumers use the sanitized active RPCs. Direct table access would expose
-- reviewer metadata such as created_by/updated_by even with a row-filtering policy.
revoke select on public.scoring_formulas,public.scoring_formula_items,public.scoring_formula_bands from anon,authenticated;

revoke all on function public.raise_scoring_version_conflict(text,text),
  public.return_scoring_formula_to_draft(uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.return_scoring_formula_to_draft(uuid,bigint,text) to authenticated;
grant execute on function public.raise_scoring_version_conflict(text,text) to service_role;

commit;
