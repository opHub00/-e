-- PostgREST executes SECURITY DEFINER functions as their owner, so current_user
-- is not the caller role. Use Supabase's request-JWT helper instead.
begin;

create or replace function public.backfill_applicant_profile_v3(
  p_user_id uuid,
  p_profile jsonb,
  p_source_updated_at timestamptz,
  p_source_fingerprint text,
  p_migration_version text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_row public.user_profiles;
  target_row public.applicant_profiles_v3;
  canonical_profile jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using message = 'PROFILE_V3_BACKFILL_SERVICE_ROLE_REQUIRED';
  end if;
  if p_user_id is null or p_source_fingerprint !~ '^[a-f0-9]{64}$' or
     coalesce(p_migration_version, '') = '' or
     jsonb_typeof(p_profile) is distinct from 'object' or p_profile->>'version' is distinct from '3' then
    raise exception using message = 'PROFILE_V3_BACKFILL_INVALID_PAYLOAD';
  end if;

  select * into source_row from public.user_profiles where user_id = p_user_id;
  if not found or source_row.schema_version <> 2 or source_row.updated_at is distinct from p_source_updated_at then
    raise exception using message = 'PROFILE_V3_BACKFILL_SOURCE_CHANGED';
  end if;

  select * into target_row from public.applicant_profiles_v3 where user_id = p_user_id;
  if found then
    return jsonb_build_object('status', 'NO_CHANGE', 'userId', target_row.user_id, 'revision', target_row.revision);
  end if;

  canonical_profile := jsonb_set(p_profile, '{revision}', '1'::jsonb, true);
  insert into public.applicant_profiles_v3(
    user_id, schema_version, revision, profile_json, provenance, created_at, updated_at
  ) values (
    p_user_id, 3, 1, canonical_profile,
    jsonb_build_object(
      'kind', 'V2_BACKFILL',
      'sourceSchemaVersion', 2,
      'sourceUpdatedAt', p_source_updated_at,
      'sourceFingerprint', p_source_fingerprint,
      'migrationVersion', p_migration_version
    ), now(), now()
  ) returning * into target_row;

  return jsonb_build_object('status', 'MIGRATED', 'userId', target_row.user_id, 'revision', target_row.revision);
end;
$$;

create or replace function public.mark_user_assessment_results_stale(
  p_reason text,
  p_user_id uuid default null,
  p_rule_set_id uuid default null,
  p_source_document_id uuid default null,
  p_engine_version text default null
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare affected bigint;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using message = 'ASSESSMENT_RESULT_STALE_SERVICE_ROLE_REQUIRED';
  end if;
  if p_reason not in ('PROFILE_CHANGED', 'RULE_SET_CHANGED', 'SOURCE_DOCUMENT_CHANGED', 'ENGINE_CHANGED') then
    raise exception using message = 'ASSESSMENT_RESULT_STALE_REASON_INVALID';
  end if;
  if p_user_id is null and p_rule_set_id is null and p_source_document_id is null and p_engine_version is null then
    raise exception using message = 'ASSESSMENT_RESULT_STALE_SELECTOR_REQUIRED';
  end if;
  update public.user_assessment_results
  set stale_at = coalesce(stale_at, now()), stale_reason = coalesce(stale_reason, p_reason)
  where superseded_at is null and stale_at is null
    and (p_user_id is null or user_id = p_user_id)
    and (p_rule_set_id is null or rule_set_id = p_rule_set_id)
    and (p_source_document_id is null or source_document_id = p_source_document_id)
    and (p_engine_version is null or engine_version <> p_engine_version);
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.backfill_applicant_profile_v3(uuid, jsonb, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.mark_user_assessment_results_stale(text, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.backfill_applicant_profile_v3(uuid, jsonb, timestamptz, text, text) to service_role;
grant execute on function public.mark_user_assessment_results_stale(text, uuid, uuid, uuid, text) to service_role;

commit;
