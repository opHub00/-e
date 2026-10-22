-- Prepared only. Apply to staging after review; never apply to Production as part of this change.
begin;

create table public.product_v3_analytics_events (
  event_id uuid primary key,
  anonymous_session_id uuid not null,
  notice_id text not null check (notice_id ~ '^[a-z][a-z0-9-]{1,62}$'),
  notice_version text not null check (notice_version ~ '^[A-Za-z0-9._-]{1,32}$'),
  event_type text not null check (event_type in (
    'SESSION_STARTED','ASSESSMENT_STARTED','QUESTION_ANSWERED','FACT_MARKED_UNKNOWN',
    'ASSESSMENT_COMPLETED','RESULT_VIEWED','NOTICE_COMPARED','COPILOT_USED',
    'SIMULATION_RUN','RESULT_SAVED','QR_CREATED','SESSION_COMPLETED')),
  occurred_at timestamptz not null default now(),
  environment text not null check (environment in ('preview','staging','production')),
  traffic_type text not null check (traffic_type in ('qa','internal','beta','real')),
  supply_type text check (supply_type ~ '^[A-Z0-9_]{2,40}$'),
  assessment_status text check (assessment_status in ('COMPLETE','NEEDS_USER_INPUT','INELIGIBLE','UNAVAILABLE')),
  unresolved_category text check (unresolved_category in (
    'residency','subscription_account','income','assets','rewinning_restriction',
    'household','marriage_child','evidence','other')),
  conversation_turn_count integer check (conversation_turn_count between 0 and 100),
  duration_bucket text check (duration_bucket in ('under_1m','1_to_3m','3_to_10m','over_10m')),
  ai_mode text check (ai_mode in ('deterministic','llm','fallback')),
  fallback_reason text check (fallback_reason in ('missing_key','provider_error','timeout','grounding_rejected','parser_failure','unknown')),
  created_at timestamptz not null default now(),
  constraint product_v3_analytics_real_guard check (traffic_type <> 'real' or environment = 'production')
);
create index product_v3_analytics_window_idx on public.product_v3_analytics_events(environment, traffic_type, occurred_at desc);
create index product_v3_analytics_notice_idx on public.product_v3_analytics_events(notice_id, occurred_at desc);
create index product_v3_analytics_session_idx on public.product_v3_analytics_events(anonymous_session_id, event_type);

alter table public.product_v3_analytics_events enable row level security;
revoke all on public.product_v3_analytics_events from public, anon, authenticated, service_role;
grant select, insert on public.product_v3_analytics_events to service_role;
-- No browser or authenticated-user policy. The server validates and writes through its staging-only service role.
-- Retention execution is intentionally separate: policy and restore window must be approved first.
commit;
