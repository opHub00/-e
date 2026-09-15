begin;

-- Each invocation is one transaction. Only trusted service-role callers receive EXECUTE.
create function public.import_assessment_rule_package(p_package jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  a jsonb := p_package->'announcement'; d jsonb := p_package->'document'; s jsonb := p_package->'ruleSet';
  r jsonb; e jsonb; rule_id uuid; stored jsonb; expected jsonb;
begin
  if (p_package->>'schemaVersion')::integer is distinct from 1 or jsonb_typeof(p_package->'rules') is distinct from 'array'
     or jsonb_array_length(p_package->'rules') = 0 or octet_length(p_package::text) > 2000000 then
    raise exception 'Invalid import package';
  end if;
  -- No dynamic SQL; clients cannot set approval, visibility or listing bindings through this API.
  if s ? 'approved_at' or s ? 'is_active' or s ? 'is_public' then raise exception 'Import cannot approve or activate'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'announcement-documents' and name = d->>'storagePath') then
    raise exception 'Upload and verify the private original before importing metadata';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(a->>'id', 0));
  insert into public.announcements(id,source,external_id,housing_management_number,title,publisher,announcement_date,region_code,region_name,source_url)
    values((a->>'id')::uuid,a->>'source',a->>'externalId',a->>'housingManagementNumber',a->>'title',a->>'publisher',
      (a->>'announcementDate')::date,a->>'regionCode',a->>'regionName',a->>'sourceUrl') on conflict(id) do nothing;
  select jsonb_build_object('id',id,'source',source,'externalId',external_id,'housingManagementNumber',housing_management_number,
    'title',title,'publisher',publisher,'announcementDate',announcement_date,'regionCode',region_code,'regionName',region_name,'sourceUrl',source_url)
    into stored from public.announcements where id = (a->>'id')::uuid for update;
  if stored is distinct from a then raise exception 'Canonical announcement conflict; no overwrite'; end if;
  insert into public.announcement_documents(id,announcement_id,document_type,storage_path,source_url,file_name,mime_type,version_label,sha256,is_official,published_at)
    values((d->>'id')::uuid,(a->>'id')::uuid,d->>'documentType',d->>'storagePath',d->>'sourceUrl',d->>'fileName',d->>'mimeType',d->>'versionLabel',
      d->>'sha256',(d->>'isOfficial')::boolean,(d->>'publishedAt')::timestamptz) on conflict(id) do nothing;
  select jsonb_build_object('id',id,'documentType',document_type,'storagePath',storage_path,'sourceUrl',source_url,'fileName',file_name,
    'mimeType',mime_type,'versionLabel',version_label,'sha256',sha256,'isOfficial',is_official,'publishedAt',published_at::date)
    into stored from public.announcement_documents where id=(d->>'id')::uuid and announcement_id=(a->>'id')::uuid;
  if stored is distinct from d then raise exception 'Document identity conflict; no overwrite'; end if;
  insert into public.assessment_rule_sets(id,announcement_id,document_id,version,source_status,schema_version,effective_date,config)
    values((s->>'id')::uuid,(a->>'id')::uuid,(d->>'id')::uuid,s->>'version',s->>'sourceStatus',1,(s->>'effectiveDate')::date,s->'config');
  for r in select value from jsonb_array_elements(p_package->'rules') loop
    e := r->'evidence';
    if jsonb_typeof(e) is distinct from 'object' or e->>'documentId' is distinct from d->>'id'
      or coalesce(length(e->>'id'),0)=0 or coalesce(length(e->>'source'),0)=0 or coalesce(length(e->>'section'),0)=0 or coalesce(length(e->>'label'),0)=0 then
      raise exception 'Rule evidence is incomplete or points to another document';
    end if;
    insert into public.assessment_rules(rule_set_id,supply_type,stage,category,rule_key,config)
      values((s->>'id')::uuid,r->>'supplyType',r->>'stage',r->>'category',r->>'ruleKey',r->'config') returning id into rule_id;
    insert into public.rule_evidence(rule_id,document_id,evidence_key,source,source_url,section,table_label,evidence_label,page_number,text_excerpt,locator)
      values(rule_id,(d->>'id')::uuid,e->>'id',e->>'source',e->>'sourceUrl',e->>'section',e->>'tableLabel',e->>'label',(e->>'pageNumber')::integer,e->>'textExcerpt',e->'locator');
  end loop;
  -- Validate the complete membership/category/stage manifest in SQL as well as in the TS decoder.
  with manifest as (
    select x->>'type' as supply, null::text as stage, 'ELIGIBILITY'::text as category, k as key
      from jsonb_array_elements(s->'config'->'supplies') x cross join lateral jsonb_array_elements_text(x->'eligibility') k
    union all
    select x->>'type', st->>'stage', 'STAGE', k
      from jsonb_array_elements(s->'config'->'supplies') x cross join lateral jsonb_array_elements(x->'stages') st
      cross join lateral jsonb_array_elements_text(st->'conditions') k
    union all
    select x->>'type', st->>'stage', 'SCORE', k
      from jsonb_array_elements(s->'config'->'supplies') x cross join lateral jsonb_array_elements(x->'stages') st
      cross join lateral jsonb_array_elements_text(case when st->'scores' = 'null'::jsonb then '[]'::jsonb else st->'scores' end) k
  ) select jsonb_agg(jsonb_build_array(supply,stage,category,key) order by key) into expected from manifest;
  select jsonb_agg(jsonb_build_array(supply_type,stage,category,rule_key) order by rule_key) into stored
    from public.assessment_rules where rule_set_id=(s->>'id')::uuid;
  if stored is distinct from expected then raise exception 'Rule manifest mismatch'; end if;
  return jsonb_build_object('announcementId',a->>'id','documentId',d->>'id','ruleSetId',s->>'id','status','IMPORTED');
end $$;

create function public.get_assessment_review_snapshot(p_rule_set_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with snapshot as (
    select jsonb_build_object('title',a.title,'listing_id','announcement:' || a.id::text,'announcement',to_jsonb(a),
      'document',to_jsonb(d),'rule_set',to_jsonb(s),'rules',coalesce((
        select jsonb_agg(to_jsonb(r) || jsonb_build_object('evidence',coalesce((
          select jsonb_agg(to_jsonb(e) order by e.id) from public.rule_evidence e where e.rule_id=r.id),'[]'::jsonb)) order by r.rule_key)
        from public.assessment_rules r where r.rule_set_id=s.id),'[]'::jsonb)) as payload
    from public.assessment_rule_sets s join public.announcements a on a.id=s.announcement_id
    left join public.announcement_documents d on d.id=s.document_id where s.id=p_rule_set_id
  ) select jsonb_build_object('snapshot',payload,'fingerprint',md5((payload || jsonb_build_object(
    'rule_set',(payload->'rule_set') - 'approved_at' - 'is_active' - 'is_public',
    'announcement',(payload->'announcement') - 'status' - 'updated_at'))::text)) from snapshot
$$;

create function public.approve_assessment_rule_set(p_rule_set_id uuid, p_fingerprint text, p_reviewer text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare s public.assessment_rule_sets; current_snapshot jsonb;
begin
  perform 1 from public.announcements where id=(select announcement_id from public.assessment_rule_sets where id=p_rule_set_id) for update;
  select * into s from public.assessment_rule_sets where id=p_rule_set_id for update;
  if not found then raise exception 'Rule set not found'; end if;
  current_snapshot := public.get_assessment_review_snapshot(p_rule_set_id);
  if p_fingerprint is null or p_fingerprint is distinct from current_snapshot->>'fingerprint' then raise exception 'Stale review fingerprint'; end if;
  if p_reviewer is null or length(trim(p_reviewer))=0 then raise exception 'Reviewer is required'; end if;
  if s.approved_at is not null then return jsonb_build_object('ruleSetId',s.id,'status','ALREADY_APPROVED'); end if;
  insert into public.assessment_admin_reviews(rule_set_id,decision,reviewer_label,notes)
    values(s.id,'APPROVED',p_reviewer,'Reviewed snapshot fingerprint: ' || p_fingerprint);
  update public.assessment_rule_sets set approved_at=now() where id=s.id;
  return jsonb_build_object('ruleSetId',s.id,'status','APPROVED');
end $$;

create function public.activate_assessment_rule_set(p_rule_set_id uuid, p_expected_active_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare s public.assessment_rule_sets; active_id uuid;
begin
  select * into s from public.assessment_rule_sets where id=p_rule_set_id;
  if not found or s.approved_at is null then raise exception 'An approved rule set is required'; end if;
  -- Serialize competing activations; a stale operator cannot replace a newer version.
  perform 1 from public.announcements where id=s.announcement_id for update;
  select id into active_id from public.assessment_rule_sets where announcement_id=s.announcement_id and is_active;
  if active_id = s.id then return jsonb_build_object('ruleSetId',s.id,'status','ALREADY_ACTIVE'); end if;
  if active_id is distinct from p_expected_active_id then raise exception 'Active version changed; review before retrying'; end if;
  update public.assessment_rule_sets set is_active=false where announcement_id=s.announcement_id and is_active;
  update public.assessment_rule_sets set is_public=true,is_active=true where id=s.id;
  update public.announcements set status='PUBLISHED',updated_at=now() where id=s.announcement_id;
  return jsonb_build_object('ruleSetId',s.id,'previousActiveId',active_id,'status','ACTIVE');
end $$;

revoke all on function public.import_assessment_rule_package(jsonb), public.get_assessment_review_snapshot(uuid),
  public.approve_assessment_rule_set(uuid,text,text), public.activate_assessment_rule_set(uuid,uuid) from public, anon, authenticated;
grant execute on function public.import_assessment_rule_package(jsonb), public.get_assessment_review_snapshot(uuid),
  public.approve_assessment_rule_set(uuid,text,text), public.activate_assessment_rule_set(uuid,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
