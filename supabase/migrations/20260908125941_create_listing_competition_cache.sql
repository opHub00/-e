create table if not exists public.listing_competition_cache (
  cache_key text primary key,
  source_type text not null,
  house_manage_no text not null,
  pblanc_no text not null,
  payload jsonb not null,
  fetched_at timestamptz not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint listing_competition_cache_key_check check (
    cache_key ~ '^(apt|remnant):[0-9A-Za-z_-]{1,40}:[0-9A-Za-z_-]{1,40}$'
  ),
  constraint listing_competition_cache_source_type_check check (
    source_type in ('apt', 'remnant')
  ),
  constraint listing_competition_cache_identifier_check check (
    house_manage_no ~ '^[0-9A-Za-z_-]{1,40}$'
    and pblanc_no ~ '^[0-9A-Za-z_-]{1,40}$'
  ),
  constraint listing_competition_cache_expiry_check check (expires_at > fetched_at)
);

create index if not exists listing_competition_cache_expires_at_idx
  on public.listing_competition_cache (expires_at);

alter table public.listing_competition_cache enable row level security;
revoke all on table public.listing_competition_cache from anon, authenticated;
grant all on table public.listing_competition_cache to service_role;

comment on table public.listing_competition_cache is
  'Server-only cache for official ApplyHome competition responses. Clients have no grants.';
