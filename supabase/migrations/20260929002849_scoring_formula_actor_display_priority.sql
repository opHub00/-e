-- Preserve the already-applied production-hardening history while making the
-- reviewer-facing label prefer an explicit profile name over an email address.
-- Public scoring snapshots still remove the complete actors/audit payload.
begin;

create or replace function public.scoring_formula_actor(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
select case when p_user_id is null then null else jsonb_build_object(
  'userId',p_user_id::text,
  'email',(select u.email from auth.users u where u.id=p_user_id),
  'displayLabel',coalesce(
    nullif((select p.profile_json#>>'{basic,name}' from public.user_profiles p where p.user_id=p_user_id),''),
    (select u.email from auth.users u where u.id=p_user_id),
    '관리자 ' || left(p_user_id::text,8)
  ),
  'role',(select m.role from public.assessment_review_members m where m.user_id=p_user_id and m.enabled)
) end $$;

commit;
