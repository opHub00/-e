-- Serialize identical user/listing/supply writes. Concurrent Portfolio refreshes
-- otherwise both miss the reusable row and race on the current-result index.
begin;

revoke all on function public.save_user_assessment_result(jsonb)
  from public, anon, authenticated;
grant execute on function public.save_user_assessment_result(jsonb) to service_role;

create or replace function public.save_user_assessment_result_server(
  p_user_id uuid,
  p_result jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_row public.user_assessment_results;
  inserted_row public.user_assessment_results;
  result_id uuid;
  canonical_result jsonb;
  v_rule_set_id uuid;
  v_source_document_id uuid;
  v_score_total integer;
  v_score_max integer;
  target_set public.assessment_rule_sets;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using message = 'ASSESSMENT_RESULT_SERVER_ROLE_REQUIRED';
  end if;
  if p_user_id is null or jsonb_typeof(p_result) is distinct from 'object' then
    raise exception using message = 'ASSESSMENT_RESULT_INVALID_PAYLOAD';
  end if;

  begin
    v_rule_set_id := nullif(p_result->>'ruleSetId', '')::uuid;
    v_source_document_id := nullif(p_result->>'sourceDocumentId', '')::uuid;
    v_score_total := nullif(p_result#>>'{score,total}', '')::integer;
    v_score_max := nullif(p_result#>>'{score,max}', '')::integer;
  exception when invalid_text_representation then
    raise exception using message = 'ASSESSMENT_RESULT_INVALID_PAYLOAD';
  end;
  if v_rule_set_id is null then
    raise exception using message = 'ASSESSMENT_RESULT_RULE_SET_MISMATCH';
  end if;

  select * into target_set
  from public.assessment_rule_sets
  where id = v_rule_set_id
  for share;
  if not found
     or target_set.version is distinct from p_result->>'ruleSetVersion'
     or target_set.announcement_id is distinct from (p_result->>'announcementId')::uuid
     or not target_set.is_active
     or not target_set.is_public
     or target_set.approved_at is null
     or target_set.source_status is distinct from p_result->>'sourceStatus' then
    raise exception using message = 'ASSESSMENT_RESULT_RULE_SET_MISMATCH';
  end if;

  if not (
    p_result->>'listingId' = 'announcement:' || target_set.announcement_id::text
    or exists (
      select 1 from public.announcement_listing_bindings b
      where b.listing_id = p_result->>'listingId'
        and b.announcement_id = target_set.announcement_id
        and (b.bound_rule_set_id is null or b.bound_rule_set_id = target_set.id)
    )
  ) then
    raise exception using message = 'ASSESSMENT_RESULT_RULE_SET_MISMATCH';
  end if;

  if not exists (
    select 1 from public.applicant_profiles_v3 p
    where p.user_id = p_user_id
      and p.revision = (p_result->>'profileRevision')::bigint
  ) then
    raise exception using message = 'ASSESSMENT_RESULT_PROFILE_REVISION_MISMATCH';
  end if;

  if target_set.document_id is distinct from v_source_document_id then
    raise exception using message = 'ASSESSMENT_RESULT_SOURCE_DOCUMENT_MISMATCH';
  end if;
  if v_source_document_id is not null and not exists (
    select 1 from public.announcement_documents d
    where d.id = v_source_document_id
      and d.announcement_id = target_set.announcement_id
      and d.sha256 = p_result->>'sourceDocumentHash'
  ) then
    raise exception using message = 'ASSESSMENT_RESULT_SOURCE_DOCUMENT_MISMATCH';
  end if;

  canonical_result := jsonb_set(p_result, '{userId}', to_jsonb(p_user_id::text), true);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_user_id::text || ':' || (p_result->>'listingId') || ':' || (p_result->>'supplyType'),
    0
  ));
  select * into existing_row
  from public.user_assessment_results r
  where r.user_id = p_user_id
    and r.listing_id = p_result->>'listingId'
    and r.supply_type = p_result->>'supplyType'
    and r.rule_set_id = v_rule_set_id
    and r.rule_set_version = p_result->>'ruleSetVersion'
    and r.source_document_hash is not distinct from nullif(p_result->>'sourceDocumentHash', '')
    and r.profile_revision = (p_result->>'profileRevision')::bigint
    and r.engine_version = p_result->>'engineVersion'
    and r.input_hash = p_result->>'inputHash'
    and r.superseded_at is null
    and r.stale_at is null
  limit 1;
  if found then return to_jsonb(existing_row); end if;

  update public.user_assessment_results
  set superseded_at = now()
  where user_id = p_user_id
    and listing_id = p_result->>'listingId'
    and supply_type = p_result->>'supplyType'
    and superseded_at is null;

  result_id := coalesce(nullif(p_result->>'id', '')::uuid, gen_random_uuid());
  insert into public.user_assessment_results(
    id, user_id, announcement_id, listing_id, supply_type,
    rule_set_id, rule_set_version, source_status,
    source_document_id, source_document_hash, profile_revision,
    engine_version, input_hash, analysis_status, eligibility_status,
    scoring_status, stage, score_total, score_max,
    missing_user_fields, missing_announcement_fields, blockers,
    warnings, evidence, result_snapshot, calculated_at
  ) values (
    result_id, p_user_id, target_set.announcement_id,
    p_result->>'listingId', p_result->>'supplyType',
    v_rule_set_id, p_result->>'ruleSetVersion', target_set.source_status,
    v_source_document_id, nullif(p_result->>'sourceDocumentHash', ''),
    (p_result->>'profileRevision')::bigint,
    p_result->>'engineVersion', p_result->>'inputHash', p_result->>'portfolioStatus',
    nullif(p_result->>'eligibilityStatus', ''), p_result->>'scoringStatus',
    nullif(p_result->>'stage', ''), v_score_total, v_score_max,
    coalesce(p_result->'missingUserFields', '[]'::jsonb),
    coalesce(p_result->'missingAnnouncementFields', '[]'::jsonb),
    coalesce(p_result->'blockers', '[]'::jsonb),
    coalesce(p_result->'warnings', '[]'::jsonb),
    coalesce(p_result->'evidence', '[]'::jsonb),
    canonical_result,
    coalesce(nullif(p_result->>'calculatedAt', '')::timestamptz, now())
  ) returning * into inserted_row;

  return to_jsonb(inserted_row);
exception
  when invalid_text_representation or check_violation or not_null_violation then
    raise exception using message = 'ASSESSMENT_RESULT_INVALID_PAYLOAD';
end;
$$;

revoke all on function public.save_user_assessment_result_server(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_user_assessment_result_server(uuid, jsonb)
  to service_role;

notify pgrst, 'reload schema';
commit;

