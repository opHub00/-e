-- Additive foundation; no production data or automatic approval.
begin;

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  source text not null check (length(source) between 1 and 80),
  external_id text,
  housing_management_number text,
  title text not null check (length(title) between 1 and 500),
  publisher text,
  announcement_date date,
  region_code text,
  region_name text,
  source_url text,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id)
);

-- An explicit reviewed binding, never a title match or guessed management number.
create table public.announcement_listing_bindings (
  listing_id text primary key check (length(listing_id) between 1 and 256),
  announcement_id uuid not null references public.announcements(id),
  created_at timestamptz not null default now()
);
create index announcement_listing_bindings_announcement_idx on public.announcement_listing_bindings(announcement_id);

create table public.announcement_documents (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id),
  document_type text not null check (document_type in ('DRAFT', 'OFFICIAL', 'CORRECTION', 'ATTACHMENT')),
  storage_path text not null unique,
  source_url text,
  file_name text not null,
  mime_type text not null,
  version_label text,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  is_official boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique(id, announcement_id),
  check (storage_path ~ ('^[0-9]{4}/' || announcement_id::text || '/' || id::text || '/[^/]+$'))
);
create index announcement_documents_announcement_idx on public.announcement_documents(announcement_id);

create table public.assessment_rule_sets (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id),
  document_id uuid,
  version text not null check (length(version) between 1 and 80),
  source_status text not null default 'REFERENCE' check (source_status in ('REFERENCE', 'DRAFT_SOURCE_VERIFIED', 'OFFICIAL_VERIFIED')),
  schema_version integer not null default 1 check (schema_version > 0),
  effective_date date,
  is_active boolean not null default false,
  is_public boolean not null default false,
  -- Parameters and ordered rule-key manifest only. Individual rules are separate rows.
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  foreign key(document_id, announcement_id) references public.announcement_documents(id, announcement_id),
  unique(announcement_id, version),
  check (not is_active or approved_at is not null),
  check (source_status = 'REFERENCE' or (document_id is not null and effective_date is not null))
);
create unique index assessment_rule_sets_one_active_idx on public.assessment_rule_sets(announcement_id) where is_active;
create index assessment_rule_sets_document_idx on public.assessment_rule_sets(document_id);

create table public.assessment_rules (
  id uuid primary key default gen_random_uuid(),
  rule_set_id uuid not null references public.assessment_rule_sets(id),
  -- Extensible supply key; schema-version decoder fails closed for unknown engine capabilities.
  supply_type text not null check (supply_type ~ '^[a-zA-Z][a-zA-Z0-9_]{0,63}$'),
  stage text check (stage in ('PRIORITY', 'GENERAL', 'LOTTERY')),
  category text not null check (category in ('ELIGIBILITY', 'STAGE', 'SCORE')),
  rule_key text not null check (length(rule_key) between 1 and 256),
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  created_at timestamptz not null default now(),
  unique(rule_set_id, rule_key),
  check ((category = 'ELIGIBILITY' and stage is null) or (category <> 'ELIGIBILITY' and stage is not null))
);

create table public.rule_evidence (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.assessment_rules(id),
  document_id uuid references public.announcement_documents(id),
  evidence_key text not null,
  source text not null,
  source_url text,
  section text not null,
  table_label text,
  evidence_label text not null,
  page_number integer check (page_number > 0),
  text_excerpt text,
  locator jsonb not null default '{}' check (jsonb_typeof(locator) = 'object'),
  created_at timestamptz not null default now(),
  unique(rule_id, evidence_key)
);
create index rule_evidence_document_idx on public.rule_evidence(document_id);

create table public.rule_extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id),
  document_id uuid not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'NEEDS_REVIEW', 'APPROVED', 'FAILED')),
  model text,
  prompt_version text,
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  foreign key(document_id, announcement_id) references public.announcement_documents(id, announcement_id)
);
create index rule_extraction_jobs_document_idx on public.rule_extraction_jobs(document_id);
create index rule_extraction_jobs_announcement_idx on public.rule_extraction_jobs(announcement_id);

create table public.assessment_admin_reviews (
  id uuid primary key default gen_random_uuid(),
  rule_set_id uuid not null references public.assessment_rule_sets(id),
  decision text not null check (decision in ('NEEDS_REVIEW', 'APPROVED', 'REJECTED')),
  reviewer_label text not null check (length(reviewer_label) > 0),
  notes text,
  created_at timestamptz not null default now()
);
create index assessment_admin_reviews_set_idx on public.assessment_admin_reviews(rule_set_id);

-- Service-side integrity guards. No SECURITY DEFINER privileges.
create function public.guard_assessment_version() returns trigger language plpgsql
set search_path = '' as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'Rule versions are retained; deactivate instead';
  end if;
  if TG_OP = 'UPDATE' and OLD.approved_at is not null and
    (to_jsonb(NEW) - 'is_active' - 'is_public') is distinct from (to_jsonb(OLD) - 'is_active' - 'is_public') then
    raise exception 'Approved rule content is immutable; create a new version';
  end if;
  if NEW.approved_at is not null and not exists (
    select 1 from public.assessment_admin_reviews r where r.rule_set_id = NEW.id and r.decision = 'APPROVED'
  ) then raise exception 'Approval requires an explicit review record'; end if;
  if NEW.source_status = 'OFFICIAL_VERIFIED' and not exists (
    select 1 from public.announcement_documents d where d.id = NEW.document_id and d.is_official
  ) then raise exception 'Official verification requires an official document'; end if;
  return NEW;
end $$;
create trigger assessment_version_guard before insert or update or delete on public.assessment_rule_sets
for each row execute function public.guard_assessment_version();

create function public.guard_assessment_content() returns trigger language plpgsql
set search_path = '' as $$
declare set_id uuid; parent_doc uuid; approved timestamptz; old_set_id uuid;
begin
  if TG_TABLE_NAME = 'assessment_rules' then
    if TG_OP = 'UPDATE' and NEW.rule_set_id <> OLD.rule_set_id then raise exception 'Rule parent is immutable'; end if;
    set_id := case when TG_OP = 'DELETE' then OLD.rule_set_id else NEW.rule_set_id end;
    if TG_OP = 'UPDATE' then old_set_id := OLD.rule_set_id; end if;
  else
    if TG_OP = 'UPDATE' and NEW.rule_id <> OLD.rule_id then raise exception 'Evidence parent is immutable'; end if;
    select r.rule_set_id into set_id from public.assessment_rules r
      where r.id = case when TG_OP = 'DELETE' then OLD.rule_id else NEW.rule_id end;
    if TG_OP = 'UPDATE' then select r.rule_set_id into old_set_id from public.assessment_rules r where r.id = OLD.rule_id; end if;
  end if;
  -- Serialize imports and approval against the same parent row.
  select s.approved_at, s.document_id into approved, parent_doc from public.assessment_rule_sets s where s.id = set_id for update;
  if approved is not null or exists (select 1 from public.assessment_rule_sets s where s.id = old_set_id and s.approved_at is not null) then
    raise exception 'Approved rules and evidence are immutable';
  end if;
  if TG_TABLE_NAME = 'rule_evidence' and TG_OP <> 'DELETE' then
    if NEW.document_id is distinct from parent_doc then raise exception 'Evidence must reference the rule set document'; end if;
  end if;
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end $$;
create trigger assessment_rules_guard before insert or update or delete on public.assessment_rules for each row execute function public.guard_assessment_content();
create trigger rule_evidence_guard before insert or update or delete on public.rule_evidence for each row execute function public.guard_assessment_content();

create function public.guard_assessment_append_only() returns trigger language plpgsql
set search_path = '' as $$ begin raise exception 'Append-only record; create a new version'; end $$;
create trigger announcement_documents_immutable before update or delete on public.announcement_documents for each row execute function public.guard_assessment_append_only();
create trigger assessment_reviews_immutable before update or delete on public.assessment_admin_reviews for each row execute function public.guard_assessment_append_only();

alter table public.announcements enable row level security;
alter table public.announcement_listing_bindings enable row level security;
alter table public.announcement_documents enable row level security;
alter table public.assessment_rule_sets enable row level security;
alter table public.assessment_rules enable row level security;
alter table public.rule_evidence enable row level security;
alter table public.rule_extraction_jobs enable row level security;
alter table public.assessment_admin_reviews enable row level security;
revoke all on public.announcements, public.announcement_listing_bindings, public.announcement_documents,
  public.assessment_rule_sets, public.assessment_rules, public.rule_evidence, public.rule_extraction_jobs, public.assessment_admin_reviews from public, anon, authenticated;
grant all on public.announcements, public.announcement_listing_bindings, public.announcement_documents,
  public.assessment_rule_sets, public.assessment_rules, public.rule_evidence, public.rule_extraction_jobs, public.assessment_admin_reviews to service_role;
grant select on public.announcements, public.announcement_listing_bindings, public.announcement_documents,
  public.assessment_rule_sets, public.assessment_rules, public.rule_evidence to anon, authenticated;

-- Acyclic policies: set -> announcement, child -> set. Unpublished documents/jobs/reviews stay private.
create policy announcement_read on public.announcements for select to anon, authenticated using (status = 'PUBLISHED');
create policy assessment_set_read on public.assessment_rule_sets for select to anon, authenticated using (
  is_active and is_public and approved_at is not null and exists (select 1 from public.announcements a where a.id = announcement_id and a.status = 'PUBLISHED')
);
create policy assessment_binding_read on public.announcement_listing_bindings for select to anon, authenticated using (
  exists (select 1 from public.assessment_rule_sets s where s.announcement_id = announcement_listing_bindings.announcement_id)
);
create policy assessment_document_read on public.announcement_documents for select to anon, authenticated using (
  exists (select 1 from public.assessment_rule_sets s where s.document_id = announcement_documents.id)
);
create policy assessment_rule_read on public.assessment_rules for select to anon, authenticated using (
  exists (select 1 from public.assessment_rule_sets s where s.id = rule_set_id)
);
create policy assessment_evidence_read on public.rule_evidence for select to anon, authenticated using (
  exists (select 1 from public.assessment_rules r where r.id = rule_id)
);

-- Single SQL statement/MVCC snapshot avoids mixing versions during activation.
create function public.read_assessment_rule_set(p_announcement_id uuid default null, p_listing_id text default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('title', a.title, 'listing_id', coalesce(p_listing_id, 'announcement:' || a.id::text),
    'rule_set', to_jsonb(s), 'rules', coalesce((select jsonb_agg(to_jsonb(r) || jsonb_build_object('evidence',
      coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from public.rule_evidence e where e.rule_id = r.id), '[]'::jsonb)) order by r.rule_key)
      from public.assessment_rules r where r.rule_set_id = s.id), '[]'::jsonb))
  from public.assessment_rule_sets s join public.announcements a on a.id = s.announcement_id
  where s.is_active and s.is_public and s.approved_at is not null and a.status = 'PUBLISHED'
    and ((p_announcement_id is not null and p_listing_id is null and a.id = p_announcement_id)
      or (p_announcement_id is null and p_listing_id is not null and exists (
        select 1 from public.announcement_listing_bindings b where b.listing_id = p_listing_id and b.announcement_id = a.id)))
$$;

-- Metadata only, keyset pagination. Never downloads the Rule DB for the picker.
create function public.list_assessment_announcements(p_after uuid default null)
returns table(id uuid, title text, source_status text) language sql stable security invoker set search_path = '' as $$
  select a.id, a.title, s.source_status from public.announcements a join public.assessment_rule_sets s on s.announcement_id = a.id
  where a.status = 'PUBLISHED' and s.is_active and s.is_public and s.approved_at is not null
    and (p_after is null or a.id > p_after) order by a.id limit 51
$$;
revoke all on function public.guard_assessment_version(), public.guard_assessment_content(), public.guard_assessment_append_only() from public, anon, authenticated;
revoke all on function public.read_assessment_rule_set(uuid, text), public.list_assessment_announcements(uuid) from public;
grant execute on function public.read_assessment_rule_set(uuid, text), public.list_assessment_announcements(uuid) to anon, authenticated, service_role;

insert into storage.buckets (id, name, public) values ('announcement-documents', 'announcement-documents', false);
-- No client policies for this bucket. Trusted server uploads only, unique paths, upsert:false.
-- Defense against unrelated permissive Storage policies added in the future.
create policy announcement_originals_private on storage.objects as restrictive for all to anon, authenticated
using (bucket_id <> 'announcement-documents') with check (bucket_id <> 'announcement-documents');

commit;
