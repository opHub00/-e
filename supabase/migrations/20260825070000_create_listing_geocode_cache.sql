create table if not exists public.listing_geocode_cache (
  address_key text primary key,
  original_address text not null,
  normalized_address text not null,
  lat double precision,
  lng double precision,
  matched_address text,
  status text not null,
  provider text not null default 'kakao',
  method text,
  updated_at timestamptz not null default now(),
  constraint listing_geocode_cache_address_key_check check (address_key ~ '^[0-9a-f]{64}$'),
  constraint listing_geocode_cache_lat_check check (lat is null or lat between -90 and 90),
  constraint listing_geocode_cache_lng_check check (lng is null or lng between -180 and 180),
  constraint listing_geocode_cache_status_check check (
    status in ('resolved', 'not_found', 'ambiguous')
  ),
  constraint listing_geocode_cache_provider_check check (provider = 'kakao'),
  constraint listing_geocode_cache_method_check check (
    method is null or method in ('address', 'cleaned-address')
  ),
  constraint listing_geocode_cache_resolved_coordinates_check check (
    status <> 'resolved' or (lat is not null and lng is not null)
  )
);

create index if not exists listing_geocode_cache_updated_at_idx
  on public.listing_geocode_cache (updated_at);

alter table public.listing_geocode_cache enable row level security;
revoke all on table public.listing_geocode_cache from anon, authenticated;
grant all on table public.listing_geocode_cache to service_role;
