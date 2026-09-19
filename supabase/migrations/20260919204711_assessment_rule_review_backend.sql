-- Additive administrator review workflow. This migration does not approve or activate data.
begin;

create table public.assessment_rule_review_versions (
  rule_set_id uuid primary key references public.assessment_rule_sets(id),
  lifecycle_status text not null default 'PENDING_REVIEW'
    check (lifecycle_status in ('PENDING_REVIEW', 'IN_REVIEW', 'REVALIDATION_REQUIRED')),
  reviewed_document_sha256 text not null check (reviewed_document_sha256 ~ '^[0-9a-f]{64}$'),
  current_document_sha256 text not null check (current_document_sha256 ~ '^[0-9a-f]{64}$'),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((lifecycle_status = 'REVALIDATION_REQUIRED') = (reviewed_document_sha256 <> current_document_sha256))
);

create unique index assessment_rules_id_set_unique on public.assessment_rules(id, rule_set_id);

create table public.assessment_rule_reviews (
  id uuid primary key default gen_random_uuid(),
  rule_set_id uuid not null references public.assessment_rule_sets(id),
  candidate_rule_id text not null check (length(candidate_rule_id) between 1 and 256),
  materialized_rule_id uuid,
  review_status text not null default 'PENDING_REVIEW'
    check (review_status in ('PENDING_REVIEW', 'IN_REVIEW', 'APPROVED', 'APPROVED_WITH_EDIT', 'HELD', 'REJECTED')),
  reviewer_id text,
  reviewed_at timestamptz,
  review_note text,
  decision_reason text,
  original_candidate_hash text not null check (original_candidate_hash ~ '^[0-9a-f]{64}$'),
  original_candidate jsonb not null check (jsonb_typeof(original_candidate) = 'object'),
  edited_rule_snapshot jsonb check (edited_rule_snapshot is null or jsonb_typeof(edited_rule_snapshot) = 'object'),
  edit_diff jsonb not null default '[]'::jsonb check (jsonb_typeof(edit_diff) = 'array'),
  safety_blockers text[] not null default '{}',
  resolved_blockers text[] not null default '{}',
  critical_category text check (critical_category in ('AGE','HOUSING','SUBSCRIPTION','INCOME','ASSET','TAX','SAVINGS','STAGE','SCORE','SCOPE','EXCEPTION')),
  is_critical boolean not null default false,
  is_required boolean not null default false,
  candidate_status text not null check (candidate_status in ('AUTO_SAFE_CANDIDATE','REVIEW_REQUIRED','UNRESOLVED')),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(materialized_rule_id, rule_set_id) references public.assessment_rules(id, rule_set_id),
  unique(rule_set_id, candidate_rule_id),
  check ((review_status = 'APPROVED_WITH_EDIT') = (edited_rule_snapshot is not null)),
  check (resolved_blockers <@ safety_blockers),
  check ((review_status in ('APPROVED','APPROVED_WITH_EDIT','HELD','REJECTED')) = (reviewed_at is not null and reviewer_id is not null and decision_reason is not null))
);
create index assessment_rule_reviews_queue_idx on public.assessment_rule_reviews(rule_set_id, is_critical desc, review_status);
create unique index assessment_rule_reviews_materialized_unique on public.assessment_rule_reviews(rule_set_id, materialized_rule_id) where materialized_rule_id is not null;

create table public.assessment_rule_evidence_reviews (
  id uuid primary key default gen_random_uuid(),
  rule_review_id uuid not null references public.assessment_rule_reviews(id),
  evidence_id text not null check (length(evidence_id) between 1 and 256),
  review_status text not null default 'NEEDS_REVIEW' check (review_status in ('VALID','INVALID','REPLACED','NEEDS_REVIEW')),
  reviewer_id text,
  reviewed_at timestamptz,
  review_note text,
  replacement_evidence jsonb check (replacement_evidence is null or jsonb_typeof(replacement_evidence) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(rule_review_id, evidence_id),
  check ((review_status = 'REPLACED') = (replacement_evidence is not null)),
  check ((review_status = 'NEEDS_REVIEW') or (reviewer_id is not null and reviewed_at is not null))
);

create table public.assessment_rule_review_conflicts (
  id uuid primary key default gen_random_uuid(),
  rule_set_id uuid not null references public.assessment_rule_sets(id),
  concept text not null check (length(trim(concept)) > 0),
  candidates jsonb not null check (jsonb_typeof(candidates) = 'array' and jsonb_array_length(candidates) >= 2),
  resolution jsonb check (resolution is null or jsonb_typeof(resolution) = 'object'),
  resolution_status text not null default 'PENDING' check (resolution_status in ('PENDING','RESOLVED','HELD')),
  reviewer_id text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((resolution_status = 'PENDING') = (resolution is null)),
  check (resolution_status = 'PENDING' or (reviewer_id is not null and reviewed_at is not null))
);
create index assessment_rule_review_conflicts_set_idx on public.assessment_rule_review_conflicts(rule_set_id, resolution_status);

create table public.assessment_rule_review_unresolved (
  id uuid primary key default gen_random_uuid(),
  rule_set_id uuid not null references public.assessment_rule_sets(id),
  issue_type text not null,
  description text not null,
  rule_ids text[] not null default '{}',
  resolution text,
  reviewer_id text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((resolution is null and reviewer_id is null and reviewed_at is null)
    or (resolution is not null and reviewer_id is not null and reviewed_at is not null))
);
create index assessment_rule_review_unresolved_set_idx on public.assessment_rule_review_unresolved(rule_set_id) where resolution is null;

create table public.assessment_rule_exception_reviews (
  id uuid primary key default gen_random_uuid(),
  rule_set_id uuid not null references public.assessment_rule_sets(id),
  exception_rule_id text not null,
  base_rule_id text,
  relation_type text check (relation_type in ('LIMITED_BY','EXEMPTED_BY','OVERRIDDEN_BY','QUALIFIED_BY','APPLIES_ONLY_IF')),
  review_status text not null default 'ORPHAN_EXCEPTION'
    check (review_status in ('LINKED','INDEPENDENT','EXCLUDED','HELD','ORPHAN_EXCEPTION','WRONG_RELATION')),
  decision_reason text,
  reviewer_id text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(rule_set_id, exception_rule_id),
  check ((review_status = 'LINKED') = (base_rule_id is not null and relation_type is not null)),
  check (review_status in ('ORPHAN_EXCEPTION','WRONG_RELATION') or (reviewer_id is not null and reviewed_at is not null and decision_reason is not null))
);
create index assessment_rule_exception_reviews_set_idx on public.assessment_rule_exception_reviews(rule_set_id, review_status);

create table public.assessment_rule_review_audit_log (
  id bigint generated always as identity primary key,
  rule_set_id uuid not null references public.assessment_rule_sets(id),
  actor_id text not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  before_snapshot jsonb,
  after_snapshot jsonb,
  reason text not null check (length(trim(reason)) > 0),
  created_at timestamptz not null default now()
);
create index assessment_rule_review_audit_set_idx on public.assessment_rule_review_audit_log(rule_set_id, id);

-- Candidate source and audit history are append-only. Reviewed fields remain mutable only to trusted callers.
create function public.guard_assessment_rule_review_original() returns trigger language plpgsql
security invoker set search_path = '' as $$
begin
  if new.rule_set_id is distinct from old.rule_set_id or new.candidate_rule_id is distinct from old.candidate_rule_id
    or new.original_candidate_hash is distinct from old.original_candidate_hash
    or new.original_candidate is distinct from old.original_candidate then
    raise exception 'AI original candidate identity and content are immutable';
  end if;
  if new.revision <> old.revision + 1 then raise exception 'Stale rule review revision'; end if;
  return new;
end $$;
create trigger assessment_rule_review_original_guard before update on public.assessment_rule_reviews
for each row execute function public.guard_assessment_rule_review_original();

create function public.guard_assessment_review_audit_append_only() returns trigger language plpgsql
security invoker set search_path = '' as $$ begin raise exception 'Review audit records are append-only'; end $$;
create trigger assessment_rule_review_audit_immutable before update or delete on public.assessment_rule_review_audit_log
for each row execute function public.guard_assessment_review_audit_append_only();

create function public.guard_assessment_review_document_hash() returns trigger language plpgsql
security invoker set search_path = '' as $$
declare expected_hash text;
begin
  select d.sha256 into expected_hash from public.assessment_rule_sets s
    join public.announcement_documents d on d.id = s.document_id where s.id = new.rule_set_id;
  if expected_hash is null or new.reviewed_document_sha256 is distinct from expected_hash then
    raise exception 'Review source hash must match the immutable rule set document';
  end if;
  return new;
end $$;
create trigger assessment_rule_review_document_hash_guard before insert on public.assessment_rule_review_versions
for each row execute function public.guard_assessment_review_document_hash();

create function public.guard_assessment_review_relationships() returns trigger language plpgsql
security invoker set search_path = '' as $$
declare candidate jsonb; exception_set uuid; base_set uuid;
begin
  if tg_table_name = 'assessment_rule_evidence_reviews' then
    select r.original_candidate into candidate from public.assessment_rule_reviews r where r.id = new.rule_review_id;
    if candidate is null or not exists (select 1 from jsonb_array_elements(coalesce(candidate->'evidence','[]'::jsonb)) e where e->>'id' = new.evidence_id) then
      raise exception 'Evidence review must reference evidence owned by the immutable candidate';
    end if;
  else
    select r.rule_set_id into exception_set from public.assessment_rule_reviews r where r.candidate_rule_id = new.exception_rule_id and r.rule_set_id = new.rule_set_id;
    if exception_set is distinct from new.rule_set_id then raise exception 'Exception rule must belong to the reviewed rule set'; end if;
    if new.base_rule_id is not null then
      select r.rule_set_id into base_set from public.assessment_rule_reviews r where r.candidate_rule_id = new.base_rule_id and r.rule_set_id = new.rule_set_id;
      if base_set is distinct from new.rule_set_id then raise exception 'Exception base must belong to the reviewed rule set'; end if;
    end if;
  end if;
  return new;
end $$;
create trigger assessment_rule_evidence_review_relationship_guard before insert or update on public.assessment_rule_evidence_reviews
for each row execute function public.guard_assessment_review_relationships();
create trigger assessment_rule_exception_review_relationship_guard before insert or update on public.assessment_rule_exception_reviews
for each row execute function public.guard_assessment_review_relationships();

-- Defense in depth: activation rechecks persisted review state inside the same database transaction.
create function public.can_activate_assessment_rule_version(p_rule_set_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  lifecycle text; reviewed_hash text; current_hash text; source_rules integer; review_rules integer; materialized_rules integer; unmaterialized integer;
  pending integer; held integer; rejected_critical integer; safety integer; invalid_evidence integer;
  conflicts integer; unresolved integer; exceptions integer; blockers jsonb := '[]'::jsonb;
begin
  select v.lifecycle_status, v.reviewed_document_sha256, v.current_document_sha256
    into lifecycle, reviewed_hash, current_hash from public.assessment_rule_review_versions v where v.rule_set_id = p_rule_set_id;
  select count(*)::integer into source_rules from public.assessment_rules r where r.rule_set_id = p_rule_set_id;
  select count(*)::integer,
    count(*) filter (where review_status in ('APPROVED','APPROVED_WITH_EDIT') and materialized_rule_id is not null)::integer,
    count(*) filter (where review_status in ('APPROVED','APPROVED_WITH_EDIT') and materialized_rule_id is null)::integer,
    count(*) filter (where review_status in ('PENDING_REVIEW','IN_REVIEW'))::integer,
    count(*) filter (where review_status = 'HELD')::integer,
    count(*) filter (where review_status = 'REJECTED' and (is_critical or is_required))::integer,
    count(*) filter (where not (safety_blockers <@ resolved_blockers))::integer
    into review_rules, materialized_rules, unmaterialized, pending, held, rejected_critical, safety
    from public.assessment_rule_reviews r where r.rule_set_id = p_rule_set_id;
  select count(*)::integer into invalid_evidence from public.assessment_rule_reviews r
    where r.rule_set_id = p_rule_set_id and r.is_critical and r.review_status in ('APPROVED','APPROVED_WITH_EDIT')
      and not exists (select 1 from public.assessment_rule_evidence_reviews e where e.rule_review_id = r.id and e.review_status in ('VALID','REPLACED'));
  select count(*)::integer into conflicts from public.assessment_rule_review_conflicts c where c.rule_set_id = p_rule_set_id and c.resolution_status <> 'RESOLVED';
  select count(*)::integer into unresolved from public.assessment_rule_review_unresolved u where u.rule_set_id = p_rule_set_id and u.resolution is null;
  select count(*)::integer into exceptions from public.assessment_rule_exception_reviews e where e.rule_set_id = p_rule_set_id and e.review_status in ('HELD','ORPHAN_EXCEPTION','WRONG_RELATION');
  if lifecycle is null then blockers := blockers || '"REVIEW_NOT_STARTED"'::jsonb;
  elsif lifecycle <> 'IN_REVIEW' or reviewed_hash is distinct from current_hash then blockers := blockers || '"DOCUMENT_REVALIDATION_REQUIRED"'::jsonb; end if;
  if source_rules = 0 or materialized_rules <> source_rules or unmaterialized > 0 then blockers := blockers || '"MISSING_CRITICAL_RULE"'::jsonb; end if;
  if pending > 0 then blockers := blockers || '"PENDING_CRITICAL_REVIEW"'::jsonb; end if;
  if held > 0 then blockers := blockers || '"HELD_RULE"'::jsonb; end if;
  if rejected_critical > 0 then blockers := blockers || '"MISSING_CRITICAL_RULE"'::jsonb; end if;
  if safety > 0 then blockers := blockers || '"HIGH_CRITICAL_ERROR"'::jsonb; end if;
  if invalid_evidence > 0 then blockers := blockers || '"EVIDENCE_NOT_VALID"'::jsonb; end if;
  if conflicts > 0 then blockers := blockers || '"CONFLICT"'::jsonb; end if;
  if unresolved > 0 then blockers := blockers || '"UNRESOLVED"'::jsonb; end if;
  if exceptions > 0 then blockers := blockers || '"ORPHAN_EXCEPTION"'::jsonb; end if;
  return jsonb_build_object('canActivate', jsonb_array_length(blockers) = 0, 'blockers', blockers,
    'sourceRuleCount', source_rules, 'reviewRuleCount', review_rules, 'materializedRuleCount', materialized_rules, 'unmaterializedApprovedCount', unmaterialized, 'pendingCount', pending,
    'heldCount', held, 'rejectedCriticalCount', rejected_critical, 'unresolvedSafetyCount', safety,
    'invalidEvidenceCount', invalid_evidence, 'conflictsCount', conflicts, 'unresolvedCount', unresolved, 'exceptionBlockerCount', exceptions);
end $$;

create or replace function public.activate_assessment_rule_set(p_rule_set_id uuid, p_expected_active_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare s public.assessment_rule_sets; active_id uuid; review_gate jsonb;
begin
  select * into s from public.assessment_rule_sets where id=p_rule_set_id;
  if not found or s.approved_at is null then raise exception 'An approved rule set is required'; end if;
  perform 1 from public.announcements where id=s.announcement_id for update;
  review_gate := public.can_activate_assessment_rule_version(p_rule_set_id);
  if not (review_gate->>'canActivate')::boolean then raise exception 'Rule review activation blockers remain: %', review_gate->'blockers'; end if;
  select id into active_id from public.assessment_rule_sets where announcement_id=s.announcement_id and is_active;
  if active_id = s.id then return jsonb_build_object('ruleSetId',s.id,'status','ALREADY_ACTIVE'); end if;
  if active_id is distinct from p_expected_active_id then raise exception 'Active version changed; review before retrying'; end if;
  update public.assessment_rule_sets set is_active=false where announcement_id=s.announcement_id and is_active;
  update public.assessment_rule_sets set is_public=true,is_active=true where id=s.id;
  update public.announcements set status='PUBLISHED',updated_at=now() where id=s.announcement_id;
  return jsonb_build_object('ruleSetId',s.id,'previousActiveId',active_id,'status','ACTIVE');
end $$;

alter table public.assessment_rule_review_versions enable row level security;
alter table public.assessment_rule_reviews enable row level security;
alter table public.assessment_rule_evidence_reviews enable row level security;
alter table public.assessment_rule_review_conflicts enable row level security;
alter table public.assessment_rule_review_unresolved enable row level security;
alter table public.assessment_rule_exception_reviews enable row level security;
alter table public.assessment_rule_review_audit_log enable row level security;

revoke all on public.assessment_rule_review_versions, public.assessment_rule_reviews, public.assessment_rule_evidence_reviews,
  public.assessment_rule_review_conflicts, public.assessment_rule_review_unresolved, public.assessment_rule_exception_reviews,
  public.assessment_rule_review_audit_log from public, anon, authenticated;
grant all on public.assessment_rule_review_versions, public.assessment_rule_reviews, public.assessment_rule_evidence_reviews,
  public.assessment_rule_review_conflicts, public.assessment_rule_review_unresolved, public.assessment_rule_exception_reviews,
  public.assessment_rule_review_audit_log to service_role;
grant usage, select on sequence public.assessment_rule_review_audit_log_id_seq to service_role;

revoke all on function public.guard_assessment_rule_review_original(), public.guard_assessment_review_audit_append_only(),
  public.guard_assessment_review_document_hash(), public.guard_assessment_review_relationships(),
  public.can_activate_assessment_rule_version(uuid) from public, anon, authenticated;
revoke all on function public.activate_assessment_rule_set(uuid,uuid) from public, anon, authenticated;
grant execute on function public.can_activate_assessment_rule_version(uuid), public.activate_assessment_rule_set(uuid,uuid) to service_role;

notify pgrst, 'reload schema';
commit;
