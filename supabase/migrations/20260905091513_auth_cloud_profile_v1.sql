create table public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  schema_version integer not null default 2 check (schema_version = 2),
  profile_json jsonb not null check (jsonb_typeof(profile_json) = 'object'),
  updated_at timestamptz not null default now()
);

create table public.saved_listings (
  user_id uuid not null references auth.users (id) on delete cascade,
  listing_id text not null check (char_length(listing_id) between 1 and 256),
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

alter table public.user_profiles enable row level security;
alter table public.saved_listings enable row level security;

revoke all on table public.user_profiles from anon;
revoke all on table public.saved_listings from anon;
grant select, insert, update, delete on table public.user_profiles to authenticated;
grant select, insert, update, delete on table public.saved_listings to authenticated;

create policy "Users can read their own profile"
on public.user_profiles
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own profile"
on public.user_profiles
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own profile"
on public.user_profiles
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own profile"
on public.user_profiles
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own saved listings"
on public.saved_listings
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own saved listings"
on public.saved_listings
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own saved listings"
on public.saved_listings
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own saved listings"
on public.saved_listings
for delete
to authenticated
using ((select auth.uid()) = user_id);
