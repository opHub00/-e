-- Listing ↔ announcement binding as an audited, admin-only operation.
--
-- Before: bindings were written by hand (service role / SQL) with no actor, no revision and no
-- history. After: authenticated admins bind, rebind and unbind through RPCs that check the rule set,
-- the listing identity and a revision, and append an audit row for every change.
--
-- The read path is unchanged: read_assessment_rule_set still resolves listing → announcement →
-- that announcement's single active, approved, public rule set.
begin;

alter table public.announcement_listing_bindings
  add column revision bigint not null default 1 check (revision >= 1),
  add column bound_rule_set_id uuid references public.assessment_rule_sets(id),
  add column bound_by uuid,
  add column updated_at timestamptz not null default now();

-- Existing rows were bound by hand. Record which active version they point at today; nothing else changes.
update public.announcement_listing_bindings b
   set bound_rule_set_id = s.id
  from public.assessment_rule_sets s
 where s.announcement_id = b.announcement_id and s.is_active and b.bound_rule_set_id is null;

create table public.announcement_listing_binding_audit_log (
  id bigint generated always as identity primary key,
  action text not null check (action in ('BIND', 'REBIND', 'UNBIND')),
  actor_user_id uuid not null,
  actor_role text not null check (actor_role = 'admin'),
  listing_id text not null,
  previous_announcement_id uuid,
  previous_rule_set_id uuid,
  new_announcement_id uuid,
  new_rule_set_id uuid,
  previous_revision bigint,
  new_revision bigint,
  reason text not null check (length(trim(reason)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index announcement_listing_binding_audit_listing_idx on public.announcement_listing_binding_audit_log(listing_id, id);

create function public.guard_listing_binding_audit_append_only() returns trigger language plpgsql
security invoker set search_path = '' as $$ begin raise exception 'Listing binding audit records are append-only'; end $$;
create trigger announcement_listing_binding_audit_immutable before update or delete on public.announcement_listing_binding_audit_log
for each row execute function public.guard_listing_binding_audit_append_only();

alter table public.announcement_listing_binding_audit_log enable row level security;
revoke all on public.announcement_listing_binding_audit_log from public, anon, authenticated;
grant select, insert on public.announcement_listing_binding_audit_log to service_role;

/*
  Canonical listing ids of an announcement, derived from its recorded source identity — the same
  rule the app uses to build listing ids (features/discovery/data/normalizeListing.ts):
    - 청약홈 APT / 무순위:  <getAPTLttotPblancDetail|getRemndrLttotPblancDetail>:<관리번호>:<공고번호>
                           → apt-<관리번호>-<공고번호> / remndr-<관리번호>-<공고번호>
    - otherwise the external id itself, when it is already a listing-shaped slug.
  A listing that no announcement derives is unknown; binding it is refused.
*/
create function public.assessment_announcement_listing_ids(p_announcement_id uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select array_remove(array[
    case when a.source = 'APT_APPLY' and a.external_id ~ '^getAPTLttotPblancDetail:[0-9]+:[0-9]+$'
      then 'apt-' || split_part(a.external_id, ':', 2) || '-' || split_part(a.external_id, ':', 3) end,
    case when a.source = 'APT_APPLY' and a.external_id ~ '^getRemndrLttotPblancDetail:[0-9]+:[0-9]+$'
      then 'remndr-' || split_part(a.external_id, ':', 2) || '-' || split_part(a.external_id, ':', 3) end,
    case when a.source <> 'APT_APPLY' and a.external_id ~ '^[a-z0-9][a-z0-9.-]{0,71}$' then a.external_id end
  ], null)
  from public.announcements a where a.id = p_announcement_id
$$;

create function public.bind_listing_to_assessment_rule_set(
  p_listing_id text, p_rule_set_id uuid, p_expected_revision bigint, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_role text; target record; owner uuid; next_revision bigint; action_name text;
  prev_announcement uuid; prev_rule_set uuid; prev_revision bigint; has_binding boolean;
begin
  actor_role := public.assert_assessment_review_access(true);
  if p_reason is null or length(trim(p_reason)) = 0 or length(p_reason) > 500 then raise exception 'REASON_REQUIRED'; end if;
  if p_listing_id is null or length(p_listing_id) not between 1 and 256 then raise exception 'UNKNOWN_LISTING'; end if;
  if p_expected_revision is null or p_expected_revision < 0 then raise exception 'EXPECTED_REVISION_REQUIRED'; end if;

  select s.id, s.announcement_id, s.version, s.is_active, s.is_public, s.approved_at, a.status as announcement_status
    into target
    from public.assessment_rule_sets s join public.announcements a on a.id = s.announcement_id
   where s.id = p_rule_set_id for share of s;
  if not found then raise exception 'UNKNOWN_RULE_SET'; end if;
  if not (target.is_active and target.is_public and target.approved_at is not null and target.announcement_status = 'PUBLISHED') then
    raise exception 'RULE_SET_NOT_ACTIVE';
  end if;

  -- The listing must be one of the target announcement's own canonical listings.
  if not (p_listing_id = any(coalesce(public.assessment_announcement_listing_ids(target.announcement_id), array[]::text[]))) then
    select a.id into owner from public.announcements a
     where p_listing_id = any(coalesce(public.assessment_announcement_listing_ids(a.id), array[]::text[])) limit 1;
    if owner is not null then raise exception 'ANNOUNCEMENT_MISMATCH'; end if;
    raise exception 'UNKNOWN_LISTING';
  end if;

  select b.announcement_id, b.bound_rule_set_id, b.revision into prev_announcement, prev_rule_set, prev_revision
    from public.announcement_listing_bindings b where b.listing_id = p_listing_id for update;
  has_binding := found;
  if not has_binding then
    if p_expected_revision <> 0 then raise exception 'STALE_BINDING_REVISION'; end if;
    insert into public.announcement_listing_bindings(listing_id, announcement_id, bound_rule_set_id, bound_by, revision, updated_at)
    values (p_listing_id, target.announcement_id, target.id, auth.uid(), 1, now());
    next_revision := 1; action_name := 'BIND';
  else
    if prev_revision <> p_expected_revision then raise exception 'STALE_BINDING_REVISION'; end if;
    if prev_announcement = target.announcement_id and prev_rule_set is not distinct from target.id then
      -- Same binding requested again: nothing changes, nothing is audited.
      return jsonb_build_object('status', 'NO_CHANGE', 'listingId', p_listing_id, 'announcementId', target.announcement_id,
        'ruleSetId', target.id, 'revision', prev_revision);
    end if;
    next_revision := prev_revision + 1; action_name := 'REBIND';
    update public.announcement_listing_bindings
       set announcement_id = target.announcement_id, bound_rule_set_id = target.id, bound_by = auth.uid(),
           revision = next_revision, updated_at = now()
     where listing_id = p_listing_id;
  end if;

  insert into public.announcement_listing_binding_audit_log(action, actor_user_id, actor_role, listing_id,
    previous_announcement_id, previous_rule_set_id, new_announcement_id, new_rule_set_id, previous_revision, new_revision, reason)
  values (action_name, auth.uid(), actor_role, p_listing_id,
    prev_announcement, prev_rule_set, target.announcement_id, target.id,
    prev_revision, next_revision, trim(p_reason));

  return jsonb_build_object('status', action_name, 'listingId', p_listing_id, 'announcementId', target.announcement_id,
    'ruleSetId', target.id, 'revision', next_revision);
end $$;

create function public.unbind_listing_from_assessment_rule_set(p_listing_id text, p_expected_revision bigint, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_role text; current_row record;
begin
  actor_role := public.assert_assessment_review_access(true);
  if p_reason is null or length(trim(p_reason)) = 0 or length(p_reason) > 500 then raise exception 'REASON_REQUIRED'; end if;
  select * into current_row from public.announcement_listing_bindings where listing_id = p_listing_id for update;
  if not found then raise exception 'UNKNOWN_BINDING'; end if;
  if p_expected_revision is null or current_row.revision <> p_expected_revision then raise exception 'STALE_BINDING_REVISION'; end if;
  delete from public.announcement_listing_bindings where listing_id = p_listing_id;
  insert into public.announcement_listing_binding_audit_log(action, actor_user_id, actor_role, listing_id,
    previous_announcement_id, previous_rule_set_id, new_announcement_id, new_rule_set_id, previous_revision, new_revision, reason)
  values ('UNBIND', auth.uid(), actor_role, p_listing_id, current_row.announcement_id, current_row.bound_rule_set_id,
    null, null, current_row.revision, null, trim(p_reason));
  return jsonb_build_object('status', 'UNBIND', 'listingId', p_listing_id, 'previousAnnouncementId', current_row.announcement_id,
    'previousRevision', current_row.revision);
end $$;

-- Read model for the admin screen: every announcement with an active rule set, its canonical
-- listings, their current binding and the recent audit trail. Reviewers may read; only admins mutate.
create function public.load_assessment_listing_bindings()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor_role text;
begin
  actor_role := public.assert_assessment_review_access(false);
  return jsonb_build_object(
    'role', actor_role,
    'announcements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'announcementId', a.id, 'title', a.title,
        'activeRuleSetId', s.id, 'activeVersion', s.version, 'sourceStatus', s.source_status,
        'listingIds', to_jsonb(coalesce(public.assessment_announcement_listing_ids(a.id), array[]::text[]))
      ) order by a.title)
      from public.announcements a join public.assessment_rule_sets s on s.announcement_id = a.id
      where s.is_active and s.is_public and s.approved_at is not null and a.status = 'PUBLISHED'), '[]'::jsonb),
    'bindings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'listingId', b.listing_id, 'announcementId', b.announcement_id, 'announcementTitle', a.title,
        'boundRuleSetId', b.bound_rule_set_id,
        'activeRuleSetId', (select s.id from public.assessment_rule_sets s where s.announcement_id = b.announcement_id and s.is_active),
        'revision', b.revision, 'updatedAt', b.updated_at
      ) order by b.listing_id)
      from public.announcement_listing_bindings b join public.announcements a on a.id = b.announcement_id), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb order by x.id desc) from (
        select id, action, actor_role, listing_id, previous_announcement_id, previous_rule_set_id,
               new_announcement_id, new_rule_set_id, previous_revision, new_revision, reason, created_at
          from public.announcement_listing_binding_audit_log order by id desc limit 50) x), '[]'::jsonb));
end $$;

revoke all on function public.guard_listing_binding_audit_append_only() from public, anon, authenticated;
revoke all on function public.assessment_announcement_listing_ids(uuid),
  public.bind_listing_to_assessment_rule_set(text, uuid, bigint, text),
  public.unbind_listing_from_assessment_rule_set(text, bigint, text),
  public.load_assessment_listing_bindings() from public, anon, authenticated;
-- Authorization happens inside each function (assert_assessment_review_access); anon has no execute right.
grant execute on function public.bind_listing_to_assessment_rule_set(text, uuid, bigint, text),
  public.unbind_listing_from_assessment_rule_set(text, bigint, text),
  public.load_assessment_listing_bindings() to authenticated;
grant execute on function public.assessment_announcement_listing_ids(uuid) to service_role;

notify pgrst, 'reload schema';
commit;
