-- 청약가점 계산식을 운영 화면에서 관리하기 위한 표.
--
-- 지금은 `data/scoring-formulas/formulas.json` 이 유일한 산식이고, 관리자 화면의 편집은 브라우저 초안에만 남는다.
-- 이 migration 은 그 다음 단계를 위한 것이다: 운영자가 코드 수정 없이 배점표를 고치고, 검토를 거쳐 활성화하고,
-- 누가 무엇을 바꿨는지 남기게 한다.
--
-- 설계에서 지키는 것:
--  - 버전: 한 산식의 배점표는 버전마다 따로 남는다. 고칠 때 이전 버전을 덮어쓰지 않는다.
--  - 발행본 불변: ACTIVE 나 SUSPENDED 로 한 번 간 버전의 배점은 더 이상 바뀌지 않는다(트리거로 막는다).
--  - 초안 편집: DRAFT / REVIEW 인 동안만 항목과 구간을 고칠 수 있다.
--  - 적용 범위당 활성 하나: 같은 적용 대상에 활성 버전이 둘이면 어느 쪽으로 계산했는지 알 수 없다.
--  - 감사 기록: 상태 변경과 발행은 추가만 되는 로그에 남는다.
--
-- 권한은 새로 만들지 않는다. 기존 assessment_review_members 의 (role, enabled) 를 읽는
-- assert_assessment_review_access 를 그대로 쓴다. 읽기는 reviewer 이상, 쓰기는 admin 만.
--
-- ⚠ 이 파일은 아직 production 에 실행하지 않았다. 실행은 사용자 승인 후에 한다.
begin;

create table public.scoring_formulas (
  id uuid primary key default gen_random_uuid(),
  -- 같은 산식의 여러 버전이 이 키를 공유한다. 화면에서는 이것을 "산식"으로 부른다.
  slug text not null check (length(trim(slug)) between 2 and 80),
  version text not null check (length(trim(version)) between 1 and 40),
  name text not null check (length(trim(name)) between 2 and 120),
  description text not null default '',
  -- 어떤 공급에 쓰는 산식인가. 엔진의 supply type 과 일반공급을 함께 담는다.
  targets text[] not null check (
    array_length(targets, 1) between 1 and 8
    and targets <@ array['generalPrivate', 'generalPublic', 'youth', 'newlywed', 'firstHome']
  ),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'REVIEW', 'ACTIVE', 'SUSPENDED')),
  published_to_users boolean not null default false,
  -- 근거 없는 배점표는 만들지 않는다. 법령 조항이나 공고 조항을 반드시 적는다.
  legal_basis text not null check (length(trim(legal_basis)) between 3 and 500),
  interpretations jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 활성으로 넘어간 시각. 이 값이 있으면 배점은 더 이상 바뀌지 않는다.
  published_at timestamptz,
  unique (slug, version),
  check ((status in ('ACTIVE', 'SUSPENDED')) = (published_at is not null))
);

create table public.scoring_formula_items (
  id uuid primary key default gen_random_uuid(),
  formula_id uuid not null references public.scoring_formulas(id) on delete cascade,
  item_key text not null check (length(trim(item_key)) between 2 and 60),
  label text not null check (length(trim(label)) between 1 and 60),
  description text not null default '',
  unit text not null check (length(trim(unit)) between 1 and 20),
  -- 판정 엔진이 쓰는 입력 이름. 나중에 공고 규칙과 이을 때 필요하다.
  fact text not null check (length(trim(fact)) between 2 and 60),
  display_order integer not null default 1,
  unique (formula_id, item_key)
);

create table public.scoring_formula_bands (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.scoring_formula_items(id) on delete cascade,
  -- 경계는 양끝을 포함한다. null 은 그쪽이 열려 있다는 뜻.
  min_value numeric,
  max_value numeric,
  points integer not null check (points >= 0),
  label text not null check (length(trim(label)) between 1 and 80),
  note text,
  check (min_value is null or max_value is null or min_value <= max_value)
);
create index scoring_formula_bands_item_idx on public.scoring_formula_bands(item_id, min_value);

create table public.scoring_formula_test_cases (
  id uuid primary key default gen_random_uuid(),
  formula_id uuid not null references public.scoring_formulas(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 120),
  -- { item_key: number } 형태. 항목이 바뀌면 화면이 빠진 값을 알려 준다.
  inputs jsonb not null,
  expected_total integer not null check (expected_total >= 0),
  created_at timestamptz not null default now()
);

create table public.scoring_formula_audit_logs (
  id bigint generated always as identity primary key,
  formula_id uuid not null references public.scoring_formulas(id) on delete cascade,
  action text not null check (action in ('CREATE', 'EDIT', 'SUBMIT_REVIEW', 'ACTIVATE', 'SUSPEND', 'PUBLISH_TO_USERS', 'UNPUBLISH')),
  actor_user_id uuid references auth.users(id),
  previous_status text,
  new_status text,
  summary text not null check (length(trim(summary)) between 3 and 500),
  created_at timestamptz not null default now()
);
create index scoring_formula_audit_formula_idx on public.scoring_formula_audit_logs(formula_id, id);

create function public.guard_scoring_audit_append_only() returns trigger language plpgsql
security invoker set search_path = '' as $$ begin raise exception 'Scoring audit records are append-only'; end $$;
create trigger scoring_formula_audit_immutable before update or delete on public.scoring_formula_audit_logs
for each row execute function public.guard_scoring_audit_append_only();

-- 발행된 버전의 배점은 바뀌지 않는다. 고치려면 새 버전을 만든다.
-- 이걸 막지 않으면 "어떤 배점으로 계산해 준 점수인지" 나중에 설명할 수 없게 된다.
create function public.guard_published_scoring_immutable() returns trigger language plpgsql
security invoker set search_path = '' as $$
declare locked boolean;
begin
  select f.published_at is not null into locked
    from public.scoring_formulas f
    join public.scoring_formula_items i on i.formula_id = f.id
   where i.id = coalesce(new.item_id, old.item_id);
  if locked then raise exception 'SCORING_VERSION_PUBLISHED'; end if;
  return coalesce(new, old);
end $$;
create trigger scoring_bands_locked before insert or update or delete on public.scoring_formula_bands
for each row execute function public.guard_published_scoring_immutable();

-- 같은 적용 대상에 활성 버전은 하나뿐이어야 한다.
create function public.guard_single_active_scoring() returns trigger language plpgsql
security invoker set search_path = '' as $$
declare clash text;
begin
  if new.status <> 'ACTIVE' then return new; end if;
  select f.slug into clash from public.scoring_formulas f
   where f.id <> new.id and f.status = 'ACTIVE' and f.targets && new.targets limit 1;
  if clash is not null then raise exception 'SCORING_TARGET_ALREADY_ACTIVE'; end if;
  return new;
end $$;
create trigger scoring_single_active before insert or update on public.scoring_formulas
for each row execute function public.guard_single_active_scoring();

alter table public.scoring_formulas enable row level security;
alter table public.scoring_formula_items enable row level security;
alter table public.scoring_formula_bands enable row level security;
alter table public.scoring_formula_test_cases enable row level security;
alter table public.scoring_formula_audit_logs enable row level security;

revoke all on public.scoring_formulas, public.scoring_formula_items, public.scoring_formula_bands,
  public.scoring_formula_test_cases, public.scoring_formula_audit_logs from public, anon, authenticated;

-- 사용자 앱은 "사용자에게 공개된 활성 버전"만 본다. 초안과 검토 중은 새어 나가지 않는다.
create policy scoring_public_read on public.scoring_formulas for select to anon, authenticated
  using (status = 'ACTIVE' and published_to_users);
create policy scoring_items_public_read on public.scoring_formula_items for select to anon, authenticated
  using (exists (select 1 from public.scoring_formulas f
    where f.id = formula_id and f.status = 'ACTIVE' and f.published_to_users));
create policy scoring_bands_public_read on public.scoring_formula_bands for select to anon, authenticated
  using (exists (select 1 from public.scoring_formula_items i
    join public.scoring_formulas f on f.id = i.formula_id
    where i.id = item_id and f.status = 'ACTIVE' and f.published_to_users));
grant select on public.scoring_formulas, public.scoring_formula_items, public.scoring_formula_bands to anon, authenticated;

-- 관리자 화면이 쓰는 읽기. reviewer 이상이면 초안까지 본다.
create function public.list_scoring_formulas()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_assessment_review_access(false);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.id, 'slug', f.slug, 'version', f.version, 'name', f.name, 'description', f.description,
      'targets', f.targets, 'status', f.status, 'publishedToUsers', f.published_to_users,
      'legalBasis', f.legal_basis, 'interpretations', f.interpretations,
      'updatedAt', f.updated_at, 'publishedAt', f.published_at,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', i.id, 'itemKey', i.item_key, 'label', i.label, 'description', i.description,
          'unit', i.unit, 'fact', i.fact, 'order', i.display_order,
          'bands', coalesce((
            select jsonb_agg(jsonb_build_object('min', b.min_value, 'max', b.max_value,
              'points', b.points, 'label', b.label, 'note', b.note) order by b.min_value nulls first)
            from public.scoring_formula_bands b where b.item_id = i.id), '[]'::jsonb))
          order by i.display_order)
        from public.scoring_formula_items i where i.formula_id = f.id), '[]'::jsonb),
      'testCases', coalesce((
        select jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label, 'inputs', t.inputs,
          'expectedTotal', t.expected_total) order by t.created_at)
        from public.scoring_formula_test_cases t where t.formula_id = f.id), '[]'::jsonb)
    ) order by f.slug, f.version)
    from public.scoring_formulas f), '[]'::jsonb);
end $$;

-- 상태 변경은 admin 만. 감사 로그를 같은 트랜잭션에서 남긴다.
create function public.set_scoring_formula_status(p_formula_id uuid, p_status text, p_summary text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid; previous text;
begin
  perform public.assert_assessment_review_access(true);
  actor := auth.uid();
  select status into previous from public.scoring_formulas where id = p_formula_id for update;
  if previous is null then raise exception 'SCORING_FORMULA_NOT_FOUND'; end if;

  update public.scoring_formulas
     set status = p_status,
         updated_at = now(),
         published_at = case when p_status in ('ACTIVE', 'SUSPENDED') then coalesce(published_at, now()) else published_at end
   where id = p_formula_id;

  insert into public.scoring_formula_audit_logs(formula_id, action, actor_user_id, previous_status, new_status, summary)
  values (p_formula_id, case p_status when 'ACTIVE' then 'ACTIVATE' when 'SUSPENDED' then 'SUSPEND'
    when 'REVIEW' then 'SUBMIT_REVIEW' else 'EDIT' end, actor, previous, p_status, p_summary);

  return jsonb_build_object('id', p_formula_id, 'status', p_status);
end $$;

revoke all on function public.list_scoring_formulas() from public, anon;
revoke all on function public.set_scoring_formula_status(uuid, text, text) from public, anon;
grant execute on function public.list_scoring_formulas() to authenticated;
grant execute on function public.set_scoring_formula_status(uuid, text, text) to authenticated;

commit;
