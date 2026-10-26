-- Additive support for reusable rental supply categories. No production execution is implied.
begin;

alter table public.user_listing_assessment_inputs
  drop constraint if exists user_listing_assessment_inputs_supply_type_check;
alter table public.user_listing_assessment_inputs
  add constraint user_listing_assessment_inputs_supply_type_check
  check (supply_type in ('youth', 'newlywed', 'firstHome', 'student', 'senior', 'housingBenefit'));
create or replace function public.read_user_listing_assessment_input(
  p_listing_id text,
  p_supply_type text,
  p_rule_set_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  saved public.user_listing_assessment_inputs;
  target public.assessment_rule_sets;
  document_hash text;
  compatibility text := 'CURRENT';
begin
  if actor is null then raise exception using message = 'LISTING_INPUT_AUTH_REQUIRED'; end if;
  if p_listing_id is null or char_length(p_listing_id) not between 1 and 256
      or p_supply_type not in ('youth', 'newlywed', 'firstHome', 'student', 'senior', 'housingBenefit') or p_rule_set_id is null then
    raise exception using message = 'LISTING_INPUT_INVALID_PAYLOAD';
  end if;

  select * into target from public.assessment_rule_sets where id = p_rule_set_id;
  if not found or not target.is_active or not target.is_public or target.approved_at is null
      or not exists (
        select 1 from jsonb_array_elements(coalesce(target.config->'supplies', '[]'::jsonb)) s
        where s->>'type' = p_supply_type
      )
      or not (
        p_listing_id = 'announcement:' || target.announcement_id::text
        or exists (
          select 1 from public.announcement_listing_bindings b
          where b.listing_id = p_listing_id and b.announcement_id = target.announcement_id
            and (b.bound_rule_set_id is null or b.bound_rule_set_id = target.id)
        )
      ) then
    raise exception using message = 'LISTING_INPUT_RULE_SET_MISMATCH';
  end if;

  select * into saved from public.user_listing_assessment_inputs
  where user_id = actor and listing_id = p_listing_id and supply_type = p_supply_type;
  if not found then return null; end if;

  if target.document_id is not null then
    select sha256 into document_hash from public.announcement_documents where id = target.document_id;
  end if;
  if saved.rule_set_id <> target.id or saved.rule_set_version <> target.version then
    compatibility := 'STALE_RULE_SET';
  elsif saved.source_document_id is distinct from target.document_id
      or saved.source_document_hash is distinct from document_hash then
    compatibility := 'STALE_DOCUMENT';
  elsif saved.stale_reason is not null then
    compatibility := saved.stale_reason;
  end if;

  return jsonb_build_object(
    'userId', saved.user_id, 'listingId', saved.listing_id,
    'announcementId', saved.announcement_id, 'supplyType', saved.supply_type,
    'schemaVersion', saved.schema_version, 'revision', saved.revision,
    'answers', saved.answers, 'ruleSetId', saved.rule_set_id,
    'ruleSetVersion', saved.rule_set_version,
    'sourceDocumentId', saved.source_document_id,
    'sourceDocumentHash', saved.source_document_hash,
    'compatibility', compatibility,
    'staleAt', saved.stale_at, 'staleReason', nullif(compatibility, 'CURRENT'),
    'createdAt', saved.created_at, 'updatedAt', saved.updated_at
  );
end;
$$;

create or replace function public.save_user_listing_assessment_input(
  p_listing_id text,
  p_supply_type text,
  p_rule_set_id uuid,
  p_expected_revision bigint,
  p_schema_version integer,
  p_answers jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  current_row public.user_listing_assessment_inputs;
  saved public.user_listing_assessment_inputs;
  target public.assessment_rule_sets;
  document_hash text;
  next_revision bigint;
  allowed_keys constant text[] := array[
    'familyCategory', 'plannedMarriageWithinDeadline', 'singleParentQualified',
    'unmarriedChildInHousehold', 'incomeHouseholdSize', 'noHomeSince',
    'householdNoWinningFiveYears', 'accountKindEligible', 'youthPriorityTarget',
    'newlywedPriorityTarget', 'exceptions',
    'canProveSubscriptionByMoveIn', 'adultOrMinorHouseholdHeadException',
    'applicationResidencyEligible', 'noPublicRentalSubletRestriction',
    'singleHouseholdApplicationClear'
  ];
begin
  if actor is null then raise exception using message = 'LISTING_INPUT_AUTH_REQUIRED'; end if;
  if p_listing_id is null or char_length(p_listing_id) not between 1 and 256
      or p_supply_type not in ('youth', 'newlywed', 'firstHome', 'student', 'senior', 'housingBenefit')
      or p_rule_set_id is null or p_expected_revision is null or p_expected_revision < 0
      or p_schema_version <> 1 or jsonb_typeof(p_answers) is distinct from 'object'
      or pg_column_size(p_answers) > 40000
      or exists (select 1 from jsonb_object_keys(p_answers) k where not (k = any(allowed_keys)))
      or exists (select 1 from jsonb_each(p_answers) e where jsonb_typeof(e.value) <> 'string' or length(e.value#>>'{}') > 2000) then
    raise exception using message = 'LISTING_INPUT_INVALID_PAYLOAD';
  end if;

  select * into target from public.assessment_rule_sets where id = p_rule_set_id for share;
  if not found or not target.is_active or not target.is_public or target.approved_at is null
      or not exists (
        select 1 from jsonb_array_elements(coalesce(target.config->'supplies', '[]'::jsonb)) s
        where s->>'type' = p_supply_type
      )
      or not (
        p_listing_id = 'announcement:' || target.announcement_id::text
        or exists (
          select 1 from public.announcement_listing_bindings b
          where b.listing_id = p_listing_id and b.announcement_id = target.announcement_id
            and (b.bound_rule_set_id is null or b.bound_rule_set_id = target.id)
        )
      ) then
    raise exception using message = 'LISTING_INPUT_RULE_SET_MISMATCH';
  end if;
  if target.document_id is not null then
    select sha256 into document_hash from public.announcement_documents where id = target.document_id;
    if document_hash is null then raise exception using message = 'LISTING_INPUT_RULE_SET_MISMATCH'; end if;
  end if;

  select * into current_row from public.user_listing_assessment_inputs
  where user_id = actor and listing_id = p_listing_id and supply_type = p_supply_type
  for update;
  if not found then
    if p_expected_revision <> 0 then raise exception using message = 'LISTING_INPUT_REVISION_CONFLICT'; end if;
    insert into public.user_listing_assessment_inputs(
      user_id, listing_id, announcement_id, supply_type, schema_version,
      revision, answers, rule_set_id, rule_set_version,
      source_document_id, source_document_hash
    ) values (
      actor, p_listing_id, target.announcement_id, p_supply_type, 1,
      1, p_answers, target.id, target.version, target.document_id, document_hash
    ) returning * into saved;
  else
    if current_row.revision <> p_expected_revision then
      raise exception using message = 'LISTING_INPUT_REVISION_CONFLICT',
        detail = jsonb_build_object('expectedRevision', p_expected_revision, 'actualRevision', current_row.revision)::text;
    end if;
    next_revision := current_row.revision + 1;
    update public.user_listing_assessment_inputs set
      announcement_id = target.announcement_id, schema_version = 1,
      revision = next_revision, answers = p_answers,
      rule_set_id = target.id, rule_set_version = target.version,
      source_document_id = target.document_id, source_document_hash = document_hash,
      stale_at = null, stale_reason = null, updated_at = now()
    where id = current_row.id returning * into saved;
  end if;

  update public.user_assessment_results
  set stale_at = coalesce(stale_at, now()), stale_reason = coalesce(stale_reason, 'LISTING_INPUT_CHANGED')
  where user_id = actor and listing_id = p_listing_id and supply_type = p_supply_type
    and superseded_at is null and stale_at is null;

  return jsonb_build_object(
    'userId', saved.user_id, 'listingId', saved.listing_id,
    'announcementId', saved.announcement_id, 'supplyType', saved.supply_type,
    'schemaVersion', saved.schema_version, 'revision', saved.revision,
    'answers', saved.answers, 'ruleSetId', saved.rule_set_id,
    'ruleSetVersion', saved.rule_set_version,
    'sourceDocumentId', saved.source_document_id,
    'sourceDocumentHash', saved.source_document_hash,
    'compatibility', 'CURRENT', 'staleAt', null, 'staleReason', null,
    'createdAt', saved.created_at, 'updatedAt', saved.updated_at
  );
end;
$$;

revoke all on function public.read_user_listing_assessment_input(text, text, uuid) from public, anon;
revoke all on function public.save_user_listing_assessment_input(text, text, uuid, bigint, integer, jsonb) from public, anon;
grant execute on function public.read_user_listing_assessment_input(text, text, uuid) to authenticated, service_role;
grant execute on function public.save_user_listing_assessment_input(text, text, uuid, bigint, integer, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
