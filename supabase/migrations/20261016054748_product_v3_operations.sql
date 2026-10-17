-- Product V3 operational telemetry. Additive only; no notice/rule activation is performed.
begin;

create table public.product_v3_ai_monitoring (
  request_id text primary key check (length(request_id) between 1 and 128),
  created_at timestamptz not null default now(),
  sanitized_question text not null check (length(sanitized_question) <= 500),
  resolver text not null check (length(resolver) between 1 and 64),
  mode text not null check (mode in ('deterministic','llm','fallback')),
  provider text,
  model text,
  rag_evidence_count integer not null default 0 check (rag_evidence_count >= 0),
  grounding_result text not null check (grounding_result in ('PASSED','REJECTED','NOT_RUN')),
  fallback_reason text check (fallback_reason is null or fallback_reason in ('missing_key','provider_error','timeout','grounding_rejected','parser_failure','unknown')),
  latency_ms integer not null check (latency_ms >= 0),
  notice_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(notice_ids) = 'array'),
  check ((mode = 'fallback') = (fallback_reason is not null))
);
create index product_v3_ai_monitoring_created_idx on public.product_v3_ai_monitoring(created_at desc);
create index product_v3_ai_monitoring_mode_idx on public.product_v3_ai_monitoring(mode, created_at desc);

create table public.product_v3_assessment_monitoring (
  id text primary key check (length(id) between 1 and 128),
  created_at timestamptz not null default now(),
  notice_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(notice_ids) = 'array'),
  complete_count integer not null default 0 check (complete_count >= 0),
  needs_user_input_count integer not null default 0 check (needs_user_input_count >= 0),
  ineligible_count integer not null default 0 check (ineligible_count >= 0),
  unavailable_count integer not null default 0 check (unavailable_count >= 0),
  unresolved_labels jsonb not null default '[]'::jsonb check (jsonb_typeof(unresolved_labels) = 'array')
);
create index product_v3_assessment_monitoring_created_idx on public.product_v3_assessment_monitoring(created_at desc);

create table public.product_v3_admin_audit_log (
  id text primary key check (length(id) between 1 and 256),
  actor_id text not null check (length(trim(actor_id)) > 0),
  actor_role text not null check (actor_role in ('reviewer','admin')),
  action text not null check (length(trim(action)) > 0),
  entity text not null check (entity in ('NOTICE','RULE_PACKAGE')),
  entity_id text not null check (length(trim(entity_id)) > 0),
  before_snapshot jsonb,
  after_snapshot jsonb,
  reason text not null check (length(trim(reason)) > 0),
  created_at timestamptz not null default now()
);
create index product_v3_admin_audit_entity_idx on public.product_v3_admin_audit_log(entity, entity_id, created_at desc);

create function public.guard_product_v3_audit_append_only() returns trigger language plpgsql
security invoker set search_path = '' as $$ begin raise exception 'PRODUCT_V3_AUDIT_APPEND_ONLY'; end $$;
create trigger product_v3_admin_audit_immutable before update or delete on public.product_v3_admin_audit_log
for each row execute function public.guard_product_v3_audit_append_only();

alter table public.product_v3_ai_monitoring enable row level security;
alter table public.product_v3_assessment_monitoring enable row level security;
alter table public.product_v3_admin_audit_log enable row level security;

revoke all on public.product_v3_ai_monitoring, public.product_v3_assessment_monitoring, public.product_v3_admin_audit_log from public, anon, authenticated, service_role;
grant select, insert on public.product_v3_ai_monitoring, public.product_v3_assessment_monitoring, public.product_v3_admin_audit_log to service_role;

commit;
