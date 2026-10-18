-- Additive user-centric assessment persistence. V2 remains untouched during the
-- parallel-read period; production rollout is a separate, explicitly approved phase.
begin;

create table public.applicant_profiles_v3 (
  user_id uuid primary key references auth.users(id) on delete cascade,
  schema_version integer not null default 3 check (schema_version = 3),
  revision bigint not null default 1 check (revision > 0),
  profile_json jsonb not null,
  provenance jsonb not null default '{}'::jsonb,
  consent_version text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(profile_json) = 'object'),
  check (profile_json->>'version' = '3'),
  check (profile_json->>'revision' ~ '^[0-9]+$'),
  check ((profile_json->>'revision')::bigint = revision),
  check (jsonb_typeof(provenance) = 'object')
);

comment on table public.applicant_profiles_v3 is
  'ApplicantProfileV3 source of truth during V2/V3 parallel operation. Direct client writes are intentionally disabled.';

create table public.user_assessment_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  announcement_id uuid not null references public.announcements(id),
  listing_id text not null check (char_length(listing_id) between 1 and 256),
  supply_type text not null check (supply_type ~ '^[a-zA-Z][a-zA-Z0-9_]{0,63}$'),
  rule_set_id uuid references public.assessment_rule_sets(id),
  rule_set_version text,
  source_status text not null check (source_status in ('REFERENCE', 'DRAFT_SOURCE_VERIFIED', 'OFFICIAL_VERIFIED')),
  source_document_id uuid references public.announcement_documents(id),
  source_document_hash text check (source_document_hash is null or source_document_hash ~ '^[a-f0-9]{64}$'),
  profile_revision bigint not null check (profile_revision > 0),
  engine_version text not null check (char_length(engine_version) between 1 and 120),
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  analysis_status text not null check (analysis_status in ('COMPLETE', 'NEEDS_USER_INPUT', 'INELIGIBLE', 'UNAVAILABLE')),
  eligibility_status text check (eligibility_status in ('ELIGIBLE', 'INELIGIBLE', 'NEEDS_MORE_INFORMATION')),
  scoring_status text not null check (scoring_status in ('SCORED', 'PENDING', 'NOT_APPLICABLE', 'UNAVAILABLE')),
  stage text check (stage in ('PRIORITY', 'GENERAL', 'LOTTERY')),
  score_total integer,
  score_max integer,
  missing_user_fields jsonb not null default '[]'::jsonb check (jsonb_typeof(missing_user_fields) = 'array'),
  missing_announcement_fields jsonb not null default '[]'::jsonb check (jsonb_typeof(missing_announcement_fields) = 'array'),
  blockers jsonb not null default '[]'::jsonb check (jsonb_typeof(blockers) = 'array'),
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  result_snapshot jsonb not null check (jsonb_typeof(result_snapshot) = 'object'),
  calculated_at timestamptz not null default now(),
  stale_at timestamptz,
  stale_reason text check (stale_reason in ('PROFILE_CHANGED', 'RULE_SET_CHANGED', 'SOURCE_DOCUMENT_CHANGED', 'ENGINE_CHANGED')),
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  check ((score_total is null and score_max is null) or
         (score_total is not null and score_max is not null and score_total >= 0 and score_max >= score_total)),
  check ((stale_at is null and stale_reason is null) or (stale_at is not null and stale_reason is not null)),
  check ((rule_set_id is null and rule_set_version is null) or
         (rule_set_id is not null and rule_set_version is not null)),
  check ((source_document_id is null and source_document_hash is null) or
         (source_document_id is not null and source_document_hash is not null))
);

create index applicant_profiles_v3_updated_idx on public.applicant_profiles_v3(updated_at desc);
create index user_assessment_results_user_listing_idx
  on public.user_assessment_results(user_id, listing_id, supply_type, calculated_at desc);
create index user_assessment_results_stale_idx
  on public.user_assessment_results(user_id, stale_at desc)
  where stale_at is not null and superseded_at is null;
create index user_assessment_results_rule_set_idx on public.user_assessment_results(rule_set_id);
create unique index user_assessment_results_calculation_unique_idx
  on public.user_assessment_results(
    user_id, listing_id, supply_type, rule_set_id, rule_set_version,
    source_document_hash, profile_revision, engine_version, input_hash
  ) nulls not distinct
  where superseded_at is null;

alter table public.applicant_profiles_v3 enable row level security;
alter table public.user_assessment_results enable row level security;

revoke all on table public.applicant_profiles_v3 from public, anon, authenticated;
revoke all on table public.user_assessment_results from public, anon, authenticated;
grant all on table public.applicant_profiles_v3 to service_role;
grant all on table public.user_assessment_results to service_role;
grant select on table public.applicant_profiles_v3 to authenticated;
grant select on table public.user_assessment_results to authenticated;

create policy applicant_profiles_v3_owner_read
on public.applicant_profiles_v3 for select to authenticated
using ((select auth.uid()) = user_id);

create policy user_assessment_results_owner_read
on public.user_assessment_results for select to authenticated
using ((select auth.uid()) = user_id);

-- The user id is always derived from auth.uid(). expected_revision=0 means
-- create-only; an existing row must match its current revision.
create function public.save_applicant_profile_v3(
  p_expected_revision bigint,
  p_profile jsonb,
  p_completed_at timestamptz default null,
  p_consent_version text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  current_row public.applicant_profiles_v3;
  next_revision bigint;
  next_profile jsonb;
begin
  if actor is null then
    raise exception using message = 'PROFILE_V3_AUTH_REQUIRED';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception using message = 'PROFILE_V3_EXPECTED_REVISION_REQUIRED';
  end if;
  if jsonb_typeof(p_profile) is distinct from 'object' or p_profile->>'version' is distinct from '3' then
    raise exception using message = 'PROFILE_V3_INVALID_PAYLOAD';
  end if;

  select * into current_row
  from public.applicant_profiles_v3
  where user_id = actor
  for update;

  if not found then
    if p_expected_revision <> 0 then
      raise exception using message = 'PROFILE_V3_REVISION_CONFLICT',
        detail = jsonb_build_object('expectedRevision', p_expected_revision, 'actualRevision', 0)::text;
    end if;
    next_revision := 1;
    next_profile := jsonb_set(p_profile, '{revision}', to_jsonb(next_revision), true);
    insert into public.applicant_profiles_v3(
      user_id, schema_version, revision, profile_json, provenance,
      completed_at, consent_version
    ) values (
      actor, 3, next_revision, next_profile,
      jsonb_build_object('kind', 'USER_AUTHORED'), p_completed_at, p_consent_version
    ) returning * into current_row;
  else
    if current_row.revision <> p_expected_revision then
      raise exception using message = 'PROFILE_V3_REVISION_CONFLICT',
        detail = jsonb_build_object('expectedRevision', p_expected_revision, 'actualRevision', current_row.revision)::text;
    end if;
    next_revision := current_row.revision + 1;
    next_profile := jsonb_set(p_profile, '{revision}', to_jsonb(next_revision), true);
    update public.applicant_profiles_v3
    set revision = next_revision,
        profile_json = next_profile,
        completed_at = p_completed_at,
        consent_version = p_consent_version,
        updated_at = now()
    where user_id = actor
    returning * into current_row;
  end if;

  update public.user_assessment_results
  set stale_at = coalesce(stale_at, now()),
      stale_reason = coalesce(stale_reason, 'PROFILE_CHANGED')
  where user_id = actor
    and superseded_at is null
    and stale_at is null
    and profile_revision <> current_row.revision;

  return jsonb_build_object(
    'userId', current_row.user_id,
    'schemaVersion', current_row.schema_version,
    'revision', current_row.revision,
    'profile', current_row.profile_json,
    'provenance', current_row.provenance,
    'consentVersion', current_row.consent_version,
    'completedAt', current_row.completed_at,
    'createdAt', current_row.created_at,
    'updatedAt', current_row.updated_at
  );
end;
$$;

-- Backfill accepts only a reviewed, canonical V3 payload. The staging script
-- requires an explicit user allow-list and uses the Phase 2 deterministic
-- converter. It never derives exact dates or amounts in SQL.
create function public.backfill_applicant_profile_v3(
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
  if current_user <> 'service_role' and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
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

create function public.save_user_assessment_result(p_result jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  existing_row public.user_assessment_results;
  inserted_row public.user_assessment_results;
  result_id uuid;
  canonical_result jsonb;
  v_rule_set_id uuid := nullif(p_result->>'ruleSetId', '')::uuid;
  v_source_document_id uuid := nullif(p_result->>'sourceDocumentId', '')::uuid;
  v_score_total integer := nullif(p_result#>>'{score,total}', '')::integer;
  v_score_max integer := nullif(p_result#>>'{score,max}', '')::integer;
begin
  if actor is null then
    raise exception using message = 'ASSESSMENT_RESULT_AUTH_REQUIRED';
  end if;
  if jsonb_typeof(p_result) is distinct from 'object' then
    raise exception using message = 'ASSESSMENT_RESULT_INVALID_PAYLOAD';
  end if;
  canonical_result := jsonb_set(p_result, '{userId}', to_jsonb(actor::text), true);
  if not exists (
    select 1 from public.applicant_profiles_v3 p
    where p.user_id = actor and p.revision = (p_result->>'profileRevision')::bigint
  ) then
    raise exception using message = 'ASSESSMENT_RESULT_PROFILE_REVISION_MISMATCH';
  end if;
  if v_rule_set_id is not null and not exists (
    select 1 from public.assessment_rule_sets s
    where s.id = v_rule_set_id and s.version = p_result->>'ruleSetVersion'
      and s.announcement_id = (p_result->>'announcementId')::uuid
  ) then
    raise exception using message = 'ASSESSMENT_RESULT_RULE_SET_MISMATCH';
  end if;
  if v_source_document_id is not null and not exists (
    select 1 from public.announcement_documents d
    where d.id = v_source_document_id
      and d.announcement_id = (p_result->>'announcementId')::uuid
      and d.sha256 = p_result->>'sourceDocumentHash'
  ) then
    raise exception using message = 'ASSESSMENT_RESULT_SOURCE_DOCUMENT_MISMATCH';
  end if;

  select * into existing_row
  from public.user_assessment_results r
  where r.user_id = actor
    and r.listing_id = p_result->>'listingId'
    and r.supply_type = p_result->>'supplyType'
    and r.rule_set_id is not distinct from v_rule_set_id
    and r.rule_set_version is not distinct from nullif(p_result->>'ruleSetVersion', '')
    and r.source_document_hash is not distinct from nullif(p_result->>'sourceDocumentHash', '')
    and r.profile_revision = (p_result->>'profileRevision')::bigint
    and r.engine_version = p_result->>'engineVersion'
    and r.input_hash = p_result->>'inputHash'
    and r.superseded_at is null
  limit 1;
  if found then
    return to_jsonb(existing_row);
  end if;

  update public.user_assessment_results
  set superseded_at = now()
  where user_id = actor
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
    result_id, actor, (p_result->>'announcementId')::uuid,
    p_result->>'listingId', p_result->>'supplyType',
    v_rule_set_id, nullif(p_result->>'ruleSetVersion', ''), p_result->>'sourceStatus',
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

-- Server-side lifecycle hooks can mark rows stale without deleting history.
-- At least one selector is required to avoid accidental global invalidation.
create function public.mark_user_assessment_results_stale(
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
  if current_user <> 'service_role' and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
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

revoke all on function public.save_applicant_profile_v3(bigint, jsonb, timestamptz, text) from public, anon;
revoke all on function public.backfill_applicant_profile_v3(uuid, jsonb, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.save_user_assessment_result(jsonb) from public, anon;
revoke all on function public.mark_user_assessment_results_stale(text, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.save_applicant_profile_v3(bigint, jsonb, timestamptz, text) to authenticated, service_role;
grant execute on function public.backfill_applicant_profile_v3(uuid, jsonb, timestamptz, text, text) to service_role;
grant execute on function public.save_user_assessment_result(jsonb) to authenticated, service_role;
grant execute on function public.mark_user_assessment_results_stale(text, uuid, uuid, uuid, text) to service_role;

commit;
