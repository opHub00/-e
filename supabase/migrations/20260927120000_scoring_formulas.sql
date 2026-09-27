-- Versioned scoring-formula operations. This migration is prepared for staging;
-- it has not been applied to production. Existing assessment-rule tables are untouched.
begin;

create table public.scoring_formulas (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (length(trim(slug)) between 2 and 80),
  version text not null check (length(trim(version)) between 1 and 40),
  name text not null check (length(trim(name)) between 2 and 120),
  description text not null default '',
  target text not null check (target in ('generalPrivate','generalPublic','youth','newlywed','firstHome')),
  -- The key is explicit so future qualifiers can participate in active uniqueness.
  scope_key text not null check (length(trim(scope_key)) between 2 and 160),
  applicable_scope jsonb not null default '{}'::jsonb check (jsonb_typeof(applicable_scope) = 'object'),
  status text not null default 'DRAFT' check (status in ('DRAFT','IN_REVIEW','ACTIVE','RETIRED')),
  published_to_users boolean not null default false,
  legal_basis text not null check (length(trim(legal_basis)) between 3 and 500),
  interpretations jsonb not null default '[]'::jsonb check (jsonb_typeof(interpretations) = 'array'),
  revision bigint not null default 0 check (revision >= 0),
  source_package_hash text check (source_package_hash is null or source_package_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  activated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz,
  retired_at timestamptz,
  unique (slug, version),
  check (not published_to_users or status = 'ACTIVE'),
  check ((status = 'ACTIVE') = (activated_at is not null and retired_at is null)),
  check ((status = 'RETIRED') = (retired_at is not null))
);
-- This index, not a race-prone SELECT trigger, is the final concurrent guard.
create unique index scoring_one_active_scope_idx on public.scoring_formulas(scope_key) where status = 'ACTIVE';
create index scoring_formula_target_idx on public.scoring_formulas(target, status);

create table public.scoring_formula_items (
  id uuid primary key default gen_random_uuid(),
  formula_id uuid not null references public.scoring_formulas(id) on delete cascade,
  item_key text not null check (length(trim(item_key)) between 2 and 60),
  label text not null check (length(trim(label)) between 1 and 60),
  description text not null default '',
  unit text not null check (length(trim(unit)) between 1 and 20),
  fact text not null check (length(trim(fact)) between 2 and 60),
  display_order integer not null check (display_order >= 0),
  declared_max_score integer not null check (declared_max_score >= 0),
  unique (formula_id, item_key),
  unique (formula_id, display_order)
);

create table public.scoring_formula_bands (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.scoring_formula_items(id) on delete cascade,
  display_order integer not null check (display_order >= 0),
  min_value numeric,
  max_value numeric,
  points integer not null check (points >= 0),
  label text not null check (length(trim(label)) between 1 and 80),
  note text,
  unique (item_id, display_order),
  check (min_value is null or max_value is null or min_value <= max_value)
);
create index scoring_formula_bands_item_idx on public.scoring_formula_bands(item_id, display_order);

create table public.scoring_formula_test_cases (
  id uuid primary key default gen_random_uuid(),
  formula_id uuid not null references public.scoring_formulas(id) on delete cascade,
  case_key text not null check (length(trim(case_key)) between 1 and 80),
  label text not null check (length(trim(label)) between 1 and 120),
  inputs jsonb not null check (jsonb_typeof(inputs) = 'object'),
  expected_total integer not null check (expected_total >= 0),
  expected_breakdown jsonb,
  display_order integer not null check (display_order >= 0),
  created_at timestamptz not null default now(),
  unique (formula_id, case_key),
  unique (formula_id, display_order)
);

create table public.scoring_formula_audit_logs (
  id bigint generated always as identity primary key,
  formula_id uuid not null references public.scoring_formulas(id) on delete restrict,
  action text not null check (length(trim(action)) between 2 and 60),
  actor_user_id uuid references auth.users(id),
  reason text not null check (length(trim(reason)) between 3 and 500),
  before_snapshot jsonb,
  after_snapshot jsonb,
  formula_revision bigint not null check (formula_revision >= 0),
  created_at timestamptz not null default now()
);
create index scoring_formula_audit_formula_idx on public.scoring_formula_audit_logs(formula_id, id);

create function public.guard_scoring_audit_append_only() returns trigger language plpgsql
security invoker set search_path = '' as $$ begin raise exception 'SCORING_AUDIT_APPEND_ONLY'; end $$;
create trigger scoring_formula_audit_immutable before update or delete on public.scoring_formula_audit_logs
for each row execute function public.guard_scoring_audit_append_only();

-- ACTIVE/RETIRED snapshots and their children are immutable. Only trusted lifecycle
-- RPCs set the transaction-local internal flag used to retire an ACTIVE row.
create function public.guard_scoring_version_immutable() returns trigger language plpgsql
security invoker set search_path = '' as $$
declare formula_id uuid; locked_status text;
begin
  if tg_table_name = 'scoring_formulas' then
    formula_id := old.id;
    locked_status := old.status;
  elsif tg_table_name = 'scoring_formula_items' then
    formula_id := coalesce(new.formula_id, old.formula_id);
    select status into locked_status from public.scoring_formulas where id=formula_id;
  elsif tg_table_name = 'scoring_formula_bands' then
    select i.formula_id, f.status into formula_id, locked_status
      from public.scoring_formula_items i join public.scoring_formulas f on f.id=i.formula_id
     where i.id=coalesce(new.item_id,old.item_id);
  else
    formula_id := coalesce(new.formula_id, old.formula_id);
    select status into locked_status from public.scoring_formulas where id=formula_id;
  end if;
  if locked_status in ('ACTIVE','RETIRED') and coalesce(current_setting('wanpane.scoring_internal', true),'') <> 'lifecycle' then
    raise exception 'SCORING_VERSION_IMMUTABLE';
  end if;
  return coalesce(new, old);
end $$;
create trigger scoring_formula_locked before update or delete on public.scoring_formulas for each row execute function public.guard_scoring_version_immutable();
create trigger scoring_items_locked before insert or update or delete on public.scoring_formula_items for each row execute function public.guard_scoring_version_immutable();
create trigger scoring_bands_locked before insert or update or delete on public.scoring_formula_bands for each row execute function public.guard_scoring_version_immutable();
create trigger scoring_tests_locked before insert or update or delete on public.scoring_formula_test_cases for each row execute function public.guard_scoring_version_immutable();

alter table public.scoring_formulas enable row level security;
alter table public.scoring_formula_items enable row level security;
alter table public.scoring_formula_bands enable row level security;
alter table public.scoring_formula_test_cases enable row level security;
alter table public.scoring_formula_audit_logs enable row level security;
revoke all on public.scoring_formulas, public.scoring_formula_items, public.scoring_formula_bands,
  public.scoring_formula_test_cases, public.scoring_formula_audit_logs from public, anon, authenticated;
grant all on public.scoring_formulas, public.scoring_formula_items, public.scoring_formula_bands,
  public.scoring_formula_test_cases, public.scoring_formula_audit_logs to service_role;

create policy scoring_public_read on public.scoring_formulas for select to anon, authenticated
  using (status = 'ACTIVE' and published_to_users);
create policy scoring_items_public_read on public.scoring_formula_items for select to anon, authenticated
  using (exists (select 1 from public.scoring_formulas f where f.id=formula_id and f.status='ACTIVE' and f.published_to_users));
create policy scoring_bands_public_read on public.scoring_formula_bands for select to anon, authenticated
  using (exists (select 1 from public.scoring_formula_items i join public.scoring_formulas f on f.id=i.formula_id
    where i.id=item_id and f.status='ACTIVE' and f.published_to_users));
grant select on public.scoring_formulas, public.scoring_formula_items, public.scoring_formula_bands to anon, authenticated;

create function public.scoring_formula_snapshot(p_formula_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
select jsonb_build_object(
  'id',f.id::text,'slug',f.slug,'version',f.version,'name',f.name,'description',f.description,
  'target',f.target,'targets',jsonb_build_array(f.target),'scopeKey',f.scope_key,'applicableScope',f.applicable_scope,
  'status',f.status,'publishedToUsers',f.published_to_users,'legalBasis',f.legal_basis,
  'interpretations',f.interpretations,'revision',f.revision,'updatedAt',f.updated_at,
  'components',coalesce((select jsonb_agg(jsonb_build_object(
    'id',i.item_key,'recordId',i.id::text,'label',i.label,'description',i.description,'unit',i.unit,
    'fact',i.fact,'order',i.display_order,'declaredMaxScore',i.declared_max_score,
    'bands',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id',b.id::text,'order',b.display_order,'min',b.min_value,'max',b.max_value,'points',b.points,
      'label',b.label,'note',b.note)) order by b.display_order)
      from public.scoring_formula_bands b where b.item_id=i.id),'[]'::jsonb)) order by i.display_order)
    from public.scoring_formula_items i where i.formula_id=f.id),'[]'::jsonb),
  'testCases',coalesce((select jsonb_agg(jsonb_build_object('id',t.case_key,'recordId',t.id::text,
    'label',t.label,'inputs',t.inputs,'expectedTotal',t.expected_total,'expectedBreakdown',t.expected_breakdown,
    'order',t.display_order) order by t.display_order) from public.scoring_formula_test_cases t where t.formula_id=f.id),'[]'::jsonb),
  'history','[]'::jsonb
) from public.scoring_formulas f where f.id=p_formula_id;
$$;

create function public.evaluate_scoring_formula_snapshot(p_formula_id uuid, p_inputs jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare item record; band record; raw text; input_value jsonb; total integer:=0; max_total integer:=0; breakdown jsonb:='[]'; problems jsonb:='[]';
begin
  if jsonb_typeof(p_inputs) <> 'object' then raise exception 'SCORING_INPUT_INVALID'; end if;
  for item in select * from public.scoring_formula_items where formula_id=p_formula_id order by display_order loop
    max_total := max_total + item.declared_max_score;
    input_value := case when p_inputs ? item.fact then p_inputs -> item.fact else p_inputs -> item.item_key end;
    if input_value is null or jsonb_typeof(input_value)='null' then
      problems := problems || jsonb_build_array(item.label || ': MISSING_INPUT');
      breakdown := breakdown || jsonb_build_array(jsonb_build_object('componentId',item.item_key,'label',item.label,
        'input',null,'points',null,'max',item.declared_max_score,'bandLabel',null,'problem','MISSING_INPUT'));
      continue;
    end if;
    if jsonb_typeof(input_value) <> 'number' then raise exception 'SCORING_INPUT_INVALID'; end if;
    raw := input_value #>> '{}';
    select b.* into band from public.scoring_formula_bands b where b.item_id=item.id
      and (b.min_value is null or raw::numeric >= b.min_value) and (b.max_value is null or raw::numeric <= b.max_value);
    if not found or 1 < (select count(*) from public.scoring_formula_bands b where b.item_id=item.id
      and (b.min_value is null or raw::numeric >= b.min_value) and (b.max_value is null or raw::numeric <= b.max_value)) then
      problems := problems || jsonb_build_array(item.label || ': BAND_NOT_UNIQUE');
      breakdown := breakdown || jsonb_build_array(jsonb_build_object('componentId',item.item_key,'label',item.label,
        'input',raw::numeric,'points',null,'max',item.declared_max_score,'bandLabel',null,'problem','BAND_NOT_UNIQUE'));
    else
      total := total + band.points;
      breakdown := breakdown || jsonb_build_array(jsonb_build_object('componentId',item.item_key,'label',item.label,
        'input',raw::numeric,'points',band.points,'max',item.declared_max_score,'bandLabel',band.label,'problem',null));
    end if;
  end loop;
  return jsonb_build_object('total',case when jsonb_array_length(problems)=0 then total else null end,
    'max',max_total,'breakdown',breakdown,'problems',problems,'interpretation',null);
end $$;

create function public.validate_scoring_formula(p_formula_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare errors jsonb:='[]'; item record; previous_max numeric; band record; actual_max integer;
begin
  if not exists(select 1 from public.scoring_formulas where id=p_formula_id) then raise exception 'SCORING_FORMULA_NOT_FOUND'; end if;
  if not exists(select 1 from public.scoring_formula_items where formula_id=p_formula_id) then errors:=errors||'"EMPTY_ITEMS"'::jsonb; end if;
  for item in select * from public.scoring_formula_items where formula_id=p_formula_id order by display_order loop
    if not exists(select 1 from public.scoring_formula_bands where item_id=item.id) then errors:=errors||to_jsonb('EMPTY_BANDS:'||item.item_key); continue; end if;
    select max(points) into actual_max from public.scoring_formula_bands where item_id=item.id;
    if actual_max <> item.declared_max_score then errors:=errors||to_jsonb('MAX_SCORE_MISMATCH:'||item.item_key); end if;
    previous_max:=null;
    for band in select * from public.scoring_formula_bands where item_id=item.id order by display_order loop
      if previous_max is not null and band.min_value is null then errors:=errors||to_jsonb('BAND_ORDER_INVALID:'||item.item_key); end if;
      if previous_max is not null and band.min_value <= previous_max then errors:=errors||to_jsonb('BAND_OVERLAP:'||item.item_key); end if;
      if previous_max is not null and band.min_value > previous_max + 1 then errors:=errors||to_jsonb('BAND_GAP:'||item.item_key); end if;
      if previous_max is null and band.display_order > 0 and band.min_value is not null then errors:=errors||to_jsonb('BAND_GAP:'||item.item_key); end if;
      previous_max:=band.max_value;
      if band.max_value is null and exists(select 1 from public.scoring_formula_bands x where x.item_id=item.id and x.display_order>band.display_order) then errors:=errors||to_jsonb('OPEN_BAND_NOT_LAST:'||item.item_key); end if;
    end loop;
  end loop;
  return errors;
end $$;

create function public.list_scoring_formulas() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform public.assert_assessment_review_access(false);
return coalesce((select jsonb_agg(public.scoring_formula_snapshot(id) order by slug,version) from public.scoring_formulas),'[]'::jsonb); end $$;
create function public.get_scoring_formula_detail(p_formula_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare value jsonb; begin perform public.assert_assessment_review_access(false); value:=public.scoring_formula_snapshot(p_formula_id);
if value is null then raise exception 'SCORING_FORMULA_NOT_FOUND'; end if; return value; end $$;
create function public.get_scoring_formula_audit(p_formula_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform public.assert_assessment_review_access(false); return coalesce((select jsonb_agg(jsonb_build_object('id',id,'action',action,
'actorUserId',actor_user_id,'reason',reason,'before',before_snapshot,'after',after_snapshot,'revision',formula_revision,'createdAt',created_at) order by id)
from public.scoring_formula_audit_logs where formula_id=p_formula_id),'[]'::jsonb); end $$;

create function public.review_scoring_formula(p_formula_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform public.assert_assessment_review_access(false);
return jsonb_build_object('validation',public.validate_scoring_formula(p_formula_id),'testCases',coalesce((select jsonb_agg(jsonb_build_object(
  'id',t.case_key,'expectedTotal',t.expected_total,'actualTotal',(public.evaluate_scoring_formula_snapshot(p_formula_id,t.inputs)->>'total')::int,
  'passed',coalesce((public.evaluate_scoring_formula_snapshot(p_formula_id,t.inputs)->>'total')::int=t.expected_total,false)) order by t.display_order)
  from public.scoring_formula_test_cases t where t.formula_id=p_formula_id),'[]'::jsonb)); end $$;

create function public.create_scoring_formula_draft(p_input jsonb,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; result uuid;
begin perform public.assert_assessment_review_access(true); actor:=auth.uid();
if length(trim(p_reason))<3 then raise exception 'REASON_REQUIRED'; end if;
insert into public.scoring_formulas(slug,version,name,description,target,scope_key,applicable_scope,status,published_to_users,legal_basis,interpretations,created_by,updated_by)
values(p_input->>'slug',p_input->>'version',p_input->>'name',coalesce(p_input->>'description',''),p_input->>'target',p_input->>'scopeKey',
coalesce(p_input->'applicableScope','{}'), 'DRAFT',false,p_input->>'legalBasis',coalesce(p_input->'interpretations','[]'),actor,actor) returning id into result;
insert into public.scoring_formula_audit_logs(formula_id,action,actor_user_id,reason,after_snapshot,formula_revision)
values(result,'CREATE',actor,p_reason,public.scoring_formula_snapshot(result),0); return public.scoring_formula_snapshot(result); end $$;

create function public.clone_scoring_formula_version(p_formula_id uuid,p_version text,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; source public.scoring_formulas%rowtype; result uuid;
begin perform public.assert_assessment_review_access(true); actor:=auth.uid(); select * into source from public.scoring_formulas where id=p_formula_id;
if not found then raise exception 'SCORING_FORMULA_NOT_FOUND'; end if; if length(trim(p_reason))<3 then raise exception 'REASON_REQUIRED'; end if;
insert into public.scoring_formulas(slug,version,name,description,target,scope_key,applicable_scope,status,published_to_users,legal_basis,interpretations,created_by,updated_by)
values(source.slug,p_version,source.name,source.description,source.target,source.scope_key,source.applicable_scope,'DRAFT',false,source.legal_basis,source.interpretations,actor,actor) returning id into result;
insert into public.scoring_formula_items(id,formula_id,item_key,label,description,unit,fact,display_order,declared_max_score)
select gen_random_uuid(),result,item_key,label,description,unit,fact,display_order,declared_max_score from public.scoring_formula_items where formula_id=p_formula_id;
insert into public.scoring_formula_bands(item_id,display_order,min_value,max_value,points,label,note)
select ni.id,b.display_order,b.min_value,b.max_value,b.points,b.label,b.note from public.scoring_formula_bands b
join public.scoring_formula_items oi on oi.id=b.item_id join public.scoring_formula_items ni on ni.formula_id=result and ni.item_key=oi.item_key;
insert into public.scoring_formula_test_cases(formula_id,case_key,label,inputs,expected_total,expected_breakdown,display_order)
select result,case_key,label,inputs,expected_total,expected_breakdown,display_order from public.scoring_formula_test_cases where formula_id=p_formula_id;
insert into public.scoring_formula_audit_logs(formula_id,action,actor_user_id,reason,before_snapshot,after_snapshot,formula_revision)
values(result,'CLONE',actor,p_reason,public.scoring_formula_snapshot(p_formula_id),public.scoring_formula_snapshot(result),0);
return public.scoring_formula_snapshot(result); end $$;

create function public.mutate_scoring_formula_draft(p_formula_id uuid,p_expected_revision bigint,p_action text,p_payload jsonb,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; current public.scoring_formulas%rowtype; before_value jsonb; v_item_id uuid;
begin perform public.assert_assessment_review_access(true); actor:=auth.uid(); select * into current from public.scoring_formulas where id=p_formula_id for update;
if not found then raise exception 'SCORING_FORMULA_NOT_FOUND'; end if; if current.revision<>p_expected_revision then raise exception 'SCORING_STALE_REVISION'; end if;
if current.status not in ('DRAFT','IN_REVIEW') then raise exception 'SCORING_VERSION_IMMUTABLE'; end if; if length(trim(p_reason))<3 then raise exception 'REASON_REQUIRED'; end if;
before_value:=public.scoring_formula_snapshot(p_formula_id);
if p_action='UPDATE_METADATA' then update public.scoring_formulas set name=coalesce(p_payload->>'name',name),description=coalesce(p_payload->>'description',description),
 legal_basis=coalesce(p_payload->>'legalBasis',legal_basis),interpretations=coalesce(p_payload->'interpretations',interpretations) where id=p_formula_id;
elsif p_action='CREATE_ITEM' then insert into public.scoring_formula_items(formula_id,item_key,label,description,unit,fact,display_order,declared_max_score)
 values(p_formula_id,p_payload->>'id',p_payload->>'label',coalesce(p_payload->>'description',''),p_payload->>'unit',p_payload->>'fact',(p_payload->>'order')::int,(p_payload->>'declaredMaxScore')::int);
elsif p_action='UPDATE_ITEM' then update public.scoring_formula_items set label=p_payload->>'label',description=coalesce(p_payload->>'description',''),unit=p_payload->>'unit',fact=p_payload->>'fact',display_order=(p_payload->>'order')::int,declared_max_score=(p_payload->>'declaredMaxScore')::int where formula_id=p_formula_id and item_key=p_payload->>'id';
elsif p_action='DELETE_ITEM' then delete from public.scoring_formula_items where formula_id=p_formula_id and item_key=p_payload->>'itemId';
elsif p_action in ('CREATE_BAND','UPDATE_BAND') then
  if p_action='CREATE_BAND' then select id into v_item_id from public.scoring_formula_items where formula_id=p_formula_id and item_key=p_payload->>'itemId';
    insert into public.scoring_formula_bands(item_id,display_order,min_value,max_value,points,label,note) values(v_item_id,(p_payload->>'order')::int,(p_payload#>>'{band,min}')::numeric,(p_payload#>>'{band,max}')::numeric,(p_payload#>>'{band,points}')::int,p_payload#>>'{band,label}',p_payload#>>'{band,note}');
  else update public.scoring_formula_bands b set display_order=(p_payload->>'order')::int,min_value=(p_payload#>>'{band,min}')::numeric,max_value=(p_payload#>>'{band,max}')::numeric,points=(p_payload#>>'{band,points}')::int,label=p_payload#>>'{band,label}',note=p_payload#>>'{band,note}' from public.scoring_formula_items i where b.id=(p_payload->>'bandId')::uuid and i.id=b.item_id and i.formula_id=p_formula_id; end if;
elsif p_action='DELETE_BAND' then select i.id into v_item_id from public.scoring_formula_bands b join public.scoring_formula_items i on i.id=b.item_id where b.id=(p_payload->>'bandId')::uuid and i.formula_id=p_formula_id;
  delete from public.scoring_formula_bands where id=(p_payload->>'bandId')::uuid and item_id=v_item_id;
elsif p_action in ('CREATE_TEST_CASE','UPDATE_TEST_CASE') then
  if p_action='CREATE_TEST_CASE' then insert into public.scoring_formula_test_cases(formula_id,case_key,label,inputs,expected_total,display_order) values(p_formula_id,p_payload#>>'{testCase,id}',p_payload#>>'{testCase,label}',p_payload#>'{testCase,inputs}',(p_payload#>>'{testCase,expectedTotal}')::int,(p_payload->>'order')::int);
  else update public.scoring_formula_test_cases set label=p_payload#>>'{testCase,label}',inputs=p_payload#>'{testCase,inputs}',expected_total=(p_payload#>>'{testCase,expectedTotal}')::int,display_order=(p_payload->>'order')::int where formula_id=p_formula_id and case_key=p_payload#>>'{testCase,id}'; end if;
elsif p_action='DELETE_TEST_CASE' then delete from public.scoring_formula_test_cases where formula_id=p_formula_id and case_key=p_payload->>'testCaseId';
else raise exception 'SCORING_ACTION_INVALID'; end if;
if p_action in ('CREATE_BAND','UPDATE_BAND','DELETE_BAND') then
  update public.scoring_formula_items i set declared_max_score=coalesce((select max(b.points) from public.scoring_formula_bands b where b.item_id=i.id),0)
   where i.formula_id=p_formula_id and (i.id=v_item_id or exists(select 1 from public.scoring_formula_bands b where b.item_id=i.id and b.id=(p_payload->>'bandId')::uuid));
end if;
update public.scoring_formulas set revision=revision+1,updated_at=now(),updated_by=actor where id=p_formula_id;
insert into public.scoring_formula_audit_logs(formula_id,action,actor_user_id,reason,before_snapshot,after_snapshot,formula_revision)
values(p_formula_id,p_action,actor,p_reason,before_value,public.scoring_formula_snapshot(p_formula_id),current.revision+1);
return public.scoring_formula_snapshot(p_formula_id); end $$;

create function public.request_scoring_formula_review(p_formula_id uuid,p_expected_revision bigint,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; current public.scoring_formulas%rowtype; before_value jsonb;
begin perform public.assert_assessment_review_access(true); actor:=auth.uid(); select * into current from public.scoring_formulas where id=p_formula_id for update;
if not found then raise exception 'SCORING_FORMULA_NOT_FOUND'; end if; if current.revision<>p_expected_revision then raise exception 'SCORING_STALE_REVISION'; end if;
if current.status<>'DRAFT' then raise exception 'SCORING_STATUS_INVALID'; end if; if jsonb_array_length(public.validate_scoring_formula(p_formula_id))>0 then raise exception 'SCORING_VALIDATION_FAILED'; end if;
before_value:=public.scoring_formula_snapshot(p_formula_id); update public.scoring_formulas set status='IN_REVIEW',revision=revision+1,updated_at=now(),updated_by=actor where id=p_formula_id;
insert into public.scoring_formula_audit_logs(formula_id,action,actor_user_id,reason,before_snapshot,after_snapshot,formula_revision) values(p_formula_id,'REQUEST_REVIEW',actor,p_reason,before_value,public.scoring_formula_snapshot(p_formula_id),current.revision+1);
return public.scoring_formula_snapshot(p_formula_id); end $$;

create function public.activate_scoring_formula(p_formula_id uuid,p_expected_revision bigint,p_publish_to_users boolean,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; current public.scoring_formulas%rowtype; test record; evaluated jsonb; prior record; before_value jsonb; prior_before jsonb;
begin perform public.assert_assessment_review_access(true); actor:=auth.uid(); select * into current from public.scoring_formulas where id=p_formula_id for update;
if not found then raise exception 'SCORING_FORMULA_NOT_FOUND'; end if; if current.revision<>p_expected_revision then raise exception 'SCORING_STALE_REVISION'; end if;
if current.status not in ('DRAFT','IN_REVIEW') then raise exception 'SCORING_STATUS_INVALID'; end if;
-- Serialize all activations for this scope; the partial unique index is a second guard.
perform pg_advisory_xact_lock(hashtext('scoring:'||current.scope_key));
if jsonb_array_length(public.validate_scoring_formula(p_formula_id))>0 then raise exception 'SCORING_VALIDATION_FAILED'; end if;
if not exists(select 1 from public.scoring_formula_test_cases where formula_id=p_formula_id) then raise exception 'SCORING_TEST_CASE_FAILED'; end if;
for test in select * from public.scoring_formula_test_cases where formula_id=p_formula_id loop
  evaluated:=public.evaluate_scoring_formula_snapshot(p_formula_id,test.inputs);
  if evaluated->>'total' is null or (evaluated->>'total')::int<>test.expected_total then raise exception 'SCORING_TEST_CASE_FAILED'; end if;
end loop;
before_value:=public.scoring_formula_snapshot(p_formula_id); perform set_config('wanpane.scoring_internal','lifecycle',true);
for prior in select * from public.scoring_formulas where scope_key=current.scope_key and status='ACTIVE' and id<>p_formula_id for update loop
  prior_before:=public.scoring_formula_snapshot(prior.id);
  update public.scoring_formulas set status='RETIRED',published_to_users=false,retired_at=now(),revision=revision+1,updated_at=now(),updated_by=actor where id=prior.id;
  insert into public.scoring_formula_audit_logs(formula_id,action,actor_user_id,reason,before_snapshot,after_snapshot,formula_revision)
  values(prior.id,'AUTO_RETIRE_FOR_REPLACEMENT',actor,p_reason,prior_before,public.scoring_formula_snapshot(prior.id),prior.revision+1);
end loop;
update public.scoring_formulas set status='ACTIVE',published_to_users=p_publish_to_users,activated_at=now(),activated_by=actor,retired_at=null,revision=revision+1,updated_at=now(),updated_by=actor where id=p_formula_id;
insert into public.scoring_formula_audit_logs(formula_id,action,actor_user_id,reason,before_snapshot,after_snapshot,formula_revision) values(p_formula_id,'ACTIVATE',actor,p_reason,before_value,public.scoring_formula_snapshot(p_formula_id),current.revision+1);
return public.scoring_formula_snapshot(p_formula_id);
exception when unique_violation then raise exception 'SCORING_SCOPE_ALREADY_ACTIVE';
end $$;

create function public.retire_scoring_formula(p_formula_id uuid,p_expected_revision bigint,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; current public.scoring_formulas%rowtype; before_value jsonb;
begin perform public.assert_assessment_review_access(true); actor:=auth.uid(); select * into current from public.scoring_formulas where id=p_formula_id for update;
if not found then raise exception 'SCORING_FORMULA_NOT_FOUND'; end if; if current.revision<>p_expected_revision then raise exception 'SCORING_STALE_REVISION'; end if; if current.status<>'ACTIVE' then raise exception 'SCORING_STATUS_INVALID'; end if;
before_value:=public.scoring_formula_snapshot(p_formula_id); perform set_config('wanpane.scoring_internal','lifecycle',true);
update public.scoring_formulas set status='RETIRED',published_to_users=false,retired_at=now(),revision=revision+1,updated_at=now(),updated_by=actor where id=p_formula_id;
insert into public.scoring_formula_audit_logs(formula_id,action,actor_user_id,reason,before_snapshot,after_snapshot,formula_revision) values(p_formula_id,'RETIRE',actor,p_reason,before_value,public.scoring_formula_snapshot(p_formula_id),current.revision+1);
return public.scoring_formula_snapshot(p_formula_id); end $$;

create function public.get_active_scoring_formula(p_target text) returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_set(public.scoring_formula_snapshot(id),'{testCases}','[]'::jsonb,true) - 'history'
from public.scoring_formulas where target=p_target and status='ACTIVE' and published_to_users limit 1 $$;
create function public.evaluate_active_scoring_formula(p_target text,p_inputs jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare formula_id uuid; begin select id into formula_id from public.scoring_formulas where target=p_target and status='ACTIVE' and published_to_users limit 1;
if formula_id is null then return null; end if; return public.evaluate_scoring_formula_snapshot(formula_id,p_inputs); end $$;

-- Server-only deterministic seed import. The committed package defaults to
-- IN_REVIEW and published_to_users=false. Dry-run is the default.
create function public.seed_scoring_formula_package(p_package jsonb,p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f jsonb; formula_id uuid; existing public.scoring_formulas%rowtype; item jsonb; band jsonb; tc jsonb; item_id uuid; package_hash text;
begin
  package_hash:=p_package->>'sourcePackageHash'; f:=p_package->'formula';
  if package_hash is null or package_hash !~ '^[a-f0-9]{64}$' then raise exception 'SCORING_SEED_HASH_INVALID'; end if;
  select * into existing from public.scoring_formulas where slug=f->>'slug' and version=f->>'version';
  if found and existing.source_package_hash=package_hash then return jsonb_build_object('status','NO_CHANGE','formulaId',existing.id,'dryRun',p_dry_run); end if;
  if found then raise exception 'SCORING_SEED_CONFLICT'; end if;
  if p_dry_run then return jsonb_build_object('status','WOULD_INSERT','slug',f->>'slug','version',f->>'version','dryRun',true); end if;
  insert into public.scoring_formulas(slug,version,name,description,target,scope_key,status,published_to_users,legal_basis,interpretations,source_package_hash)
  values(f->>'slug',f->>'version',f->>'name',coalesce(f->>'description',''),f->>'target',f->>'scopeKey','IN_REVIEW',false,f->>'legalBasis',coalesce(f->'interpretations','[]'),package_hash)
  returning id into formula_id;
  for item in select * from jsonb_array_elements(f->'components') loop
    insert into public.scoring_formula_items(formula_id,item_key,label,description,unit,fact,display_order,declared_max_score)
    values(formula_id,item->>'id',item->>'label',coalesce(item->>'description',''),item->>'unit',item->>'fact',(item->>'order')::int,(item->>'maxScore')::int) returning id into item_id;
    for band in select * from jsonb_array_elements(item->'bands') loop
      insert into public.scoring_formula_bands(item_id,display_order,min_value,max_value,points,label,note)
      values(item_id,(band->>'order')::int,(band->>'min')::numeric,(band->>'max')::numeric,(band->>'points')::int,band->>'label',band->>'note');
    end loop;
  end loop;
  for tc in select * from jsonb_array_elements(f->'testCases') loop
    insert into public.scoring_formula_test_cases(formula_id,case_key,label,inputs,expected_total,display_order)
    values(formula_id,tc->>'id',tc->>'label',tc->'inputs',(tc->>'expectedTotal')::int,(tc->>'order')::int);
  end loop;
  insert into public.scoring_formula_audit_logs(formula_id,action,actor_user_id,reason,after_snapshot,formula_revision)
  values(formula_id,'SEED',auth.uid(),'Deterministic scoring seed import',public.scoring_formula_snapshot(formula_id),0);
  return jsonb_build_object('status','INSERTED','formulaId',formula_id,'dryRun',false);
end $$;

revoke all on function public.scoring_formula_snapshot(uuid), public.evaluate_scoring_formula_snapshot(uuid,jsonb), public.validate_scoring_formula(uuid),
 public.list_scoring_formulas(), public.get_scoring_formula_detail(uuid), public.get_scoring_formula_audit(uuid),
 public.review_scoring_formula(uuid),
 public.create_scoring_formula_draft(jsonb,text), public.clone_scoring_formula_version(uuid,text,text),
 public.mutate_scoring_formula_draft(uuid,bigint,text,jsonb,text), public.request_scoring_formula_review(uuid,bigint,text),
 public.activate_scoring_formula(uuid,bigint,boolean,text), public.retire_scoring_formula(uuid,bigint,text),
 public.get_active_scoring_formula(text), public.evaluate_active_scoring_formula(text,jsonb), public.seed_scoring_formula_package(jsonb,boolean) from public, anon, authenticated;
grant execute on function public.list_scoring_formulas(), public.get_scoring_formula_detail(uuid), public.get_scoring_formula_audit(uuid),
 public.review_scoring_formula(uuid),
 public.create_scoring_formula_draft(jsonb,text), public.clone_scoring_formula_version(uuid,text,text),
 public.mutate_scoring_formula_draft(uuid,bigint,text,jsonb,text), public.request_scoring_formula_review(uuid,bigint,text),
 public.activate_scoring_formula(uuid,bigint,boolean,text), public.retire_scoring_formula(uuid,bigint,text) to authenticated;
grant execute on function public.get_active_scoring_formula(text), public.evaluate_active_scoring_formula(text,jsonb) to anon, authenticated;
grant execute on function public.scoring_formula_snapshot(uuid), public.evaluate_scoring_formula_snapshot(uuid,jsonb), public.validate_scoring_formula(uuid) to service_role;
grant execute on function public.seed_scoring_formula_package(jsonb,boolean) to service_role;

commit;
