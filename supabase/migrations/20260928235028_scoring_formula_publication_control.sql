-- Final production-preflight hardening for scoring operations.
-- This migration is intentionally additive. Both earlier scoring migrations may
-- already exist in a database history and are never rewritten here.
begin;

-- Reviewer/admin audit snapshots receive a stable human-readable label. Public
-- scoring RPCs remove the whole actors/audit payload and never expose this data.
create or replace function public.scoring_formula_actor(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
select case when p_user_id is null then null else jsonb_build_object(
  'userId',p_user_id::text,
  'email',(select u.email from auth.users u where u.id=p_user_id),
  'displayLabel',coalesce(
    (select u.email from auth.users u where u.id=p_user_id),
    nullif((select p.profile_json#>>'{basic,name}' from public.user_profiles p where p.user_id=p_user_id),''),
    '관리자 ' || left(p_user_id::text,8)
  ),
  'role',(select m.role from public.assessment_review_members m where m.user_id=p_user_id and m.enabled)
) end $$;

-- Test inputs are part of the persisted evaluation contract. A stored case must
-- contain every item_key exactly once and no unrelated/fact-name key.
create or replace function public.guard_scoring_test_input_keys()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if jsonb_typeof(new.inputs) <> 'object'
    or exists(
      select 1 from jsonb_object_keys(new.inputs) key
      where not exists(
        select 1 from public.scoring_formula_items i
        where i.formula_id=new.formula_id and i.item_key=key
      )
    )
    or exists(
      select 1 from public.scoring_formula_items i
      where i.formula_id=new.formula_id and not (new.inputs ? i.item_key)
    )
    or exists(select 1 from jsonb_each(new.inputs) value where jsonb_typeof(value.value)<>'number')
  then
    raise exception 'TEST_INPUT_KEYS_MISMATCH';
  end if;
  return new;
end $$;

drop trigger if exists scoring_tests_input_contract on public.scoring_formula_test_cases;
create trigger scoring_tests_input_contract
before insert or update of inputs,formula_id on public.scoring_formula_test_cases
for each row execute function public.guard_scoring_test_input_keys();

-- IN_REVIEW is a frozen review snapshot. Content mutations must first use the
-- explicit IN_REVIEW -> DRAFT transition; the mutation RPC always increments the
-- parent row, so this guard rolls the whole transaction back after any child edit.
create or replace function public.guard_scoring_review_snapshot()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.status='IN_REVIEW' and new.status='IN_REVIEW'
    and coalesce(current_setting('wanpane.scoring_internal',true),'')<>'lifecycle'
  then
    raise exception 'SCORING_STATUS_INVALID';
  end if;
  return new;
end $$;

drop trigger if exists scoring_formula_review_locked on public.scoring_formulas;
create trigger scoring_formula_review_locked
before update on public.scoring_formulas
for each row execute function public.guard_scoring_review_snapshot();

-- ACTIVE content remains immutable. Publication is a separate operational flag
-- changed only through this audited, revision-checked admin RPC.
create or replace function public.set_scoring_formula_publication(
  p_formula_id uuid,
  p_published_to_users boolean,
  p_expected_revision bigint,
  p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid; current public.scoring_formulas%rowtype; before_value jsonb;
begin
  perform public.assert_assessment_review_access(true);
  actor:=auth.uid();
  select * into current from public.scoring_formulas where id=p_formula_id for update;
  if not found then raise exception 'SCORING_FORMULA_NOT_FOUND'; end if;
  if current.revision<>p_expected_revision then raise exception 'SCORING_STALE_REVISION'; end if;
  if current.status<>'ACTIVE' then raise exception 'SCORING_STATUS_INVALID'; end if;
  if length(trim(p_reason))<3 then raise exception 'REASON_REQUIRED'; end if;
  if current.published_to_users=p_published_to_users then return public.scoring_formula_snapshot(p_formula_id); end if;

  before_value:=public.scoring_formula_snapshot(p_formula_id);
  perform set_config('wanpane.scoring_internal','lifecycle',true);
  update public.scoring_formulas
     set published_to_users=p_published_to_users,
         revision=revision+1,
         updated_at=now(),
         updated_by=actor
   where id=p_formula_id;
  insert into public.scoring_formula_audit_logs(
    formula_id,action,actor_user_id,reason,before_snapshot,after_snapshot,formula_revision
  ) values(
    p_formula_id,
    case when p_published_to_users then 'PUBLISH_TO_USERS' else 'HIDE_FROM_USERS' end,
    actor,p_reason,before_value,public.scoring_formula_snapshot(p_formula_id),current.revision+1
  );
  return public.scoring_formula_snapshot(p_formula_id);
end $$;

revoke all on function public.guard_scoring_test_input_keys(),public.guard_scoring_review_snapshot(),
  public.set_scoring_formula_publication(uuid,boolean,bigint,text)
  from public,anon,authenticated;
grant execute on function public.guard_scoring_test_input_keys(),public.guard_scoring_review_snapshot() to service_role;
grant execute on function public.set_scoring_formula_publication(uuid,boolean,bigint,text) to authenticated;

commit;
