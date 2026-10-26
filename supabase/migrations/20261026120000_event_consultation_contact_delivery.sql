-- Prepared for staging review only. Never apply to Production as part of this change.
-- Seven days is a provisional event-MVP retention setting, not a legal retention determination.
begin;

create table public.consultation_contacts (
  id uuid primary key default gen_random_uuid(),
  analytics_session_id uuid,
  result_session_hash text not null unique check (result_session_hash ~ '^[a-f0-9]{64}$'),
  notice_id text not null check (notice_id ~ '^[a-z][a-z0-9-]{1,62}$'),
  result_status text not null check (result_status in ('ELIGIBLE','CONDITIONAL','INELIGIBLE','EVIDENCE_REQUIRED','NOT_DETERMINED')),
  result_created_at timestamptz not null,
  name text not null check (char_length(name) between 1 and 80),
  phone_e164 text not null check (phone_e164 ~ '^\+8210[0-9]{8}$'),
  consent_version text not null check (consent_version ~ '^[a-zA-Z0-9._-]{1,40}$'),
  purpose text not null check (purpose = 'RESULT_DELIVERY_AND_CONSULTATION_FOLLOWUP'),
  consented_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > consented_at),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index consultation_contacts_created_idx on public.consultation_contacts(created_at desc);
create index consultation_contacts_expiry_idx on public.consultation_contacts(expires_at);
create index consultation_contacts_session_idx on public.consultation_contacts(analytics_session_id);

create table public.consultation_result_deliveries (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.consultation_contacts(id) on delete cascade,
  result_session_hash text not null check (result_session_hash ~ '^[a-f0-9]{64}$'),
  notice_id text not null check (notice_id ~ '^[a-z][a-z0-9-]{1,62}$'),
  delivery_channel text not null check (delivery_channel = 'SMS'),
  delivery_status text not null check (delivery_status in ('REQUESTED','PROVIDER_UNCONFIGURED','SENDING','SENT','FAILED','EXPIRED')),
  requested_at timestamptz not null default now(),
  sent_at timestamptz,
  provider_message_id text,
  failure_code text,
  constraint consultation_delivery_contact_channel_unique unique (contact_id, delivery_channel),
  constraint consultation_delivery_sent_guard check (delivery_status <> 'SENT' or (sent_at is not null and provider_message_id is not null))
);
create index consultation_deliveries_requested_idx on public.consultation_result_deliveries(requested_at desc);

alter table public.consultation_contacts enable row level security;
alter table public.consultation_result_deliveries enable row level security;
revoke all on public.consultation_contacts, public.consultation_result_deliveries from public, anon, authenticated, service_role;
grant select, delete on public.consultation_contacts to service_role;
grant select, update on public.consultation_result_deliveries to service_role;
-- No anon/authenticated policy. All browser traffic passes through a server endpoint.

create function public.enforce_consultation_delivery_transition() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.delivery_status is distinct from old.delivery_status and not (
    (old.delivery_status = 'REQUESTED' and new.delivery_status in ('PROVIDER_UNCONFIGURED','SENDING','EXPIRED')) or
    (old.delivery_status = 'PROVIDER_UNCONFIGURED' and new.delivery_status in ('SENDING','EXPIRED')) or
    (old.delivery_status = 'SENDING' and new.delivery_status in ('SENT','FAILED')) or
    (old.delivery_status = 'FAILED' and new.delivery_status in ('SENDING','EXPIRED'))
  ) then raise exception 'INVALID_DELIVERY_TRANSITION'; end if;
  return new;
end $$;
revoke all on function public.enforce_consultation_delivery_transition() from public, anon, authenticated, service_role;
create trigger consultation_delivery_transition_guard before update on public.consultation_result_deliveries
for each row execute function public.enforce_consultation_delivery_transition();

create function public.register_consultation_contact(
  p_analytics_session_id uuid, p_result_session_hash text, p_notice_id text,
  p_result_status text, p_result_created_at timestamptz, p_name text,
  p_phone_e164 text, p_consent_version text, p_consented_at timestamptz,
  p_expires_at timestamptz
) returns table(contact_id uuid, delivery_id uuid, delivery_status text, created boolean, retention_until timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_contact public.consultation_contacts%rowtype;
declare v_delivery public.consultation_result_deliveries%rowtype;
declare v_created boolean := false;
begin
  insert into public.consultation_contacts (
    analytics_session_id, result_session_hash, notice_id, result_status, result_created_at,
    name, phone_e164, consent_version, purpose, consented_at, expires_at
  ) values (
    p_analytics_session_id, p_result_session_hash, p_notice_id, p_result_status, p_result_created_at,
    p_name, p_phone_e164, p_consent_version, 'RESULT_DELIVERY_AND_CONSULTATION_FOLLOWUP', p_consented_at, p_expires_at
  ) on conflict (result_session_hash) do nothing returning * into v_contact;
  v_created := v_contact.id is not null;
  if v_contact.id is null then
    select * into v_contact from public.consultation_contacts where result_session_hash = p_result_session_hash;
    if v_contact.name <> p_name or v_contact.phone_e164 <> p_phone_e164 then
      raise exception 'CONTACT_CONFLICT' using errcode = '23505';
    end if;
  end if;
  insert into public.consultation_result_deliveries (
    contact_id, result_session_hash, notice_id, delivery_channel, delivery_status
  ) values (v_contact.id, p_result_session_hash, p_notice_id, 'SMS', 'PROVIDER_UNCONFIGURED')
  on conflict on constraint consultation_delivery_contact_channel_unique do nothing returning * into v_delivery;
  if v_delivery.id is null then
    select * into v_delivery from public.consultation_result_deliveries
      where consultation_result_deliveries.contact_id = v_contact.id and delivery_channel = 'SMS';
  end if;
  return query select v_contact.id, v_delivery.id, v_delivery.delivery_status, v_created, v_contact.expires_at;
end $$;
revoke all on function public.register_consultation_contact(uuid,text,text,text,timestamptz,text,text,text,timestamptz,timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.register_consultation_contact(uuid,text,text,text,timestamptz,text,text,text,timestamptz,timestamptz) to service_role;

commit;
