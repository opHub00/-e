-- Reviewer/admin membership as an audited, admin-only operation.
--
-- Before: members were inserted into assessment_review_members by hand with the service role, with no
-- actor and no history. After: an enabled admin grants, changes and revokes roles through RPCs that
-- append an audit row in the same transaction. The first admin of an empty project is created once by
-- a service-role-only bootstrap that refuses to run while any enabled admin exists.
--
-- Access checks are unchanged: get/assert_assessment_review_access still read (role, enabled).
begin;

create table public.assessment_review_membership_audit_log (
  id bigint generated always as identity primary key,
  action text not null check (action in ('BASELINE', 'BOOTSTRAP_ADMIN', 'GRANT', 'CHANGE_ROLE', 'REVOKE')),
  actor_user_id uuid,
  actor_role text not null check (actor_role in ('admin', 'service_role', 'migration')),
  target_user_id uuid not null,
  previous_role text check (previous_role in ('reviewer', 'admin')),
  new_role text check (new_role in ('reviewer', 'admin')),
  reason text not null check (length(trim(reason)) between 3 and 500),
  created_at timestamptz not null default now(),
  check ((actor_role = 'admin') = (actor_user_id is not null))
);
create index assessment_review_membership_audit_target_idx on public.assessment_review_membership_audit_log(target_user_id, id);

create function public.guard_review_membership_audit_append_only() returns trigger language plpgsql
security invoker set search_path = '' as $$ begin raise exception 'Review membership audit records are append-only'; end $$;
create trigger assessment_review_membership_audit_immutable before update or delete on public.assessment_review_membership_audit_log
for each row execute function public.guard_review_membership_audit_append_only();

alter table public.assessment_review_membership_audit_log enable row level security;
revoke all on public.assessment_review_membership_audit_log from public, anon, authenticated;
grant select on public.assessment_review_membership_audit_log to service_role;

-- Members that exist today were added by hand. Record them once so the history starts complete.
insert into public.assessment_review_membership_audit_log(action, actor_role, target_user_id, new_role, reason)
select 'BASELINE', 'migration', m.user_id, m.role, 'Existing member when membership auditing started'
  from public.assessment_review_members m where m.enabled order by m.created_at;

-- The service role reads members; changes go through the functions below.
revoke insert, update, delete, truncate on public.assessment_review_members from service_role;

create function public.assessment_review_user_id(p_email text)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare found uuid; matches integer;
begin
  select count(*)::integer, min(u.id::text)::uuid into matches, found from auth.users u where lower(u.email) = lower(trim(p_email));
  if matches <> 1 then raise exception 'USER_NOT_FOUND'; end if;
  return found;
end $$;

create function public.list_assessment_review_members()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_assessment_review_access(true);
  return jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('userId', m.user_id, 'email', u.email, 'role', m.role, 'enabled', m.enabled,
        'updatedAt', m.updated_at) order by m.role, u.email)
      from public.assessment_review_members m left join auth.users u on u.id = m.user_id), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb order by x.id desc) from (
        select id, action, actor_user_id, actor_role, target_user_id, previous_role, new_role, reason, created_at
          from public.assessment_review_membership_audit_log order by id desc limit 50) x), '[]'::jsonb));
end $$;

/* Grant a role, or change an existing member's role. An admin cannot change their own membership. */
create function public.set_assessment_review_member(p_email text, p_role text, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target uuid; current_row public.assessment_review_members; action_name text;
begin
  perform public.assert_assessment_review_access(true);
  if p_role not in ('reviewer', 'admin') then raise exception 'INVALID_REVIEW_ROLE'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'REASON_REQUIRED'; end if;
  target := public.assessment_review_user_id(p_email);
  if target = auth.uid() then raise exception 'SELF_MEMBERSHIP_CHANGE_FORBIDDEN'; end if;
  select * into current_row from public.assessment_review_members where user_id = target for update;
  if found and current_row.enabled and current_row.role = p_role then
    return jsonb_build_object('status', 'NO_CHANGE', 'userId', target, 'role', p_role);
  end if;
  action_name := case when found and current_row.enabled then 'CHANGE_ROLE' else 'GRANT' end;
  insert into public.assessment_review_members(user_id, role, enabled) values (target, p_role, true)
    on conflict (user_id) do update set role = excluded.role, enabled = true, updated_at = now();
  insert into public.assessment_review_membership_audit_log(action, actor_user_id, actor_role, target_user_id, previous_role, new_role, reason)
    values (action_name, auth.uid(), 'admin', target, case when found and current_row.enabled then current_row.role end, p_role, trim(p_reason));
  return jsonb_build_object('status', action_name, 'userId', target, 'role', p_role);
end $$;

/* Revoke access. The row is disabled, not deleted, so the audit trail keeps pointing at it. */
create function public.revoke_assessment_review_member(p_email text, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target uuid; current_row public.assessment_review_members;
begin
  perform public.assert_assessment_review_access(true);
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'REASON_REQUIRED'; end if;
  target := public.assessment_review_user_id(p_email);
  if target = auth.uid() then raise exception 'SELF_MEMBERSHIP_CHANGE_FORBIDDEN'; end if;
  select * into current_row from public.assessment_review_members where user_id = target for update;
  if not found or not current_row.enabled then return jsonb_build_object('status', 'NO_CHANGE', 'userId', target); end if;
  update public.assessment_review_members set enabled = false, updated_at = now() where user_id = target;
  insert into public.assessment_review_membership_audit_log(action, actor_user_id, actor_role, target_user_id, previous_role, reason)
    values ('REVOKE', auth.uid(), 'admin', target, current_row.role, trim(p_reason));
  return jsonb_build_object('status', 'REVOKE', 'userId', target, 'previousRole', current_row.role);
end $$;

/* The first admin of a project. Service role only, and only while no enabled admin exists. */
create function public.bootstrap_assessment_review_admin(p_email text, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'REASON_REQUIRED'; end if;
  lock table public.assessment_review_members in share row exclusive mode;
  if exists (select 1 from public.assessment_review_members where role = 'admin' and enabled) then raise exception 'ADMIN_ALREADY_EXISTS'; end if;
  target := public.assessment_review_user_id(p_email);
  insert into public.assessment_review_members(user_id, role, enabled) values (target, 'admin', true)
    on conflict (user_id) do update set role = 'admin', enabled = true, updated_at = now();
  insert into public.assessment_review_membership_audit_log(action, actor_role, target_user_id, new_role, reason)
    values ('BOOTSTRAP_ADMIN', 'service_role', target, 'admin', trim(p_reason));
  return jsonb_build_object('status', 'BOOTSTRAP_ADMIN', 'userId', target);
end $$;

revoke all on function public.guard_review_membership_audit_append_only() from public, anon, authenticated;
revoke all on function public.assessment_review_user_id(text), public.list_assessment_review_members(),
  public.set_assessment_review_member(text, text, text), public.revoke_assessment_review_member(text, text),
  public.bootstrap_assessment_review_admin(text, text) from public, anon, authenticated, service_role;
-- Admin checks happen inside each function; anon has no execute right. Bootstrap is service-role only.
grant execute on function public.list_assessment_review_members(), public.set_assessment_review_member(text, text, text),
  public.revoke_assessment_review_member(text, text) to authenticated;
grant execute on function public.bootstrap_assessment_review_admin(text, text) to service_role;

notify pgrst, 'reload schema';
commit;
