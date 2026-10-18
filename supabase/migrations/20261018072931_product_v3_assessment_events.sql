-- Staging Product V3 assessment events. The server writes evaluated, non-identifying facts only.
begin;

create table public.product_v3_assessment_events (
  request_id text not null check (request_id ~ '^[0-9a-f-]{36}$'),
  created_at timestamptz not null default now(),
  notice_id text not null check (notice_id ~ '^[a-z][a-z0-9-]{1,62}$'),
  supply_type text not null check (supply_type ~ '^[A-Z0-9_]{2,40}$'),
  status text not null check (status in ('COMPLETE', 'NEEDS_USER_INPUT', 'INELIGIBLE', 'UNAVAILABLE')),
  unresolved_categories jsonb not null default '[]'::jsonb check (jsonb_typeof(unresolved_categories) = 'array'),
  evidence_complete boolean not null,
  rule_package_id text not null check (length(rule_package_id) between 1 and 128),
  rule_package_version text not null check (length(rule_package_version) between 1 and 128),
  source_status text not null check (source_status in ('REFERENCE', 'DRAFT_SOURCE_VERIFIED', 'OFFICIAL_VERIFIED')),
  primary key (request_id, notice_id, supply_type)
);
create index product_v3_assessment_events_created_idx on public.product_v3_assessment_events(created_at desc);
create index product_v3_assessment_events_notice_created_idx on public.product_v3_assessment_events(notice_id, created_at desc);

alter table public.product_v3_assessment_events enable row level security;
revoke all on public.product_v3_assessment_events from public, anon, authenticated, service_role;
grant select, insert on public.product_v3_assessment_events to service_role;

commit;
