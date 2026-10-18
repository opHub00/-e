-- Staging-ready RAG lineage. This migration does not register or activate any index.
begin;

create table public.product_v3_rag_index_metadata (
  notice_id text primary key check (length(notice_id) between 1 and 128),
  announcement_id uuid not null references public.announcements(id),
  source_version text not null check (length(source_version) between 1 and 120),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  index_version text not null check (length(index_version) between 1 and 120),
  chunk_count integer not null default 0 check (chunk_count >= 0),
  indexed_at timestamptz,
  index_status text not null default 'REINDEX_REQUIRED'
    check (index_status in ('ACTIVE', 'STALE', 'FAILED', 'REINDEX_REQUIRED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (index_status <> 'ACTIVE' or (chunk_count > 0 and indexed_at is not null))
);
create index product_v3_rag_index_metadata_announcement_idx
  on public.product_v3_rag_index_metadata(announcement_id);

create table public.product_v3_rag_index_audit_log (
  id bigint generated always as identity primary key,
  notice_id text not null,
  action text not null check (action in ('REGISTER', 'UPDATE')),
  before_snapshot jsonb,
  after_snapshot jsonb not null,
  actor text not null default 'staging_rag_indexer',
  created_at timestamptz not null default now()
);
create index product_v3_rag_index_audit_notice_idx
  on public.product_v3_rag_index_audit_log(notice_id, id);

create function public.guard_product_v3_rag_index() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (
    select 1 from public.announcement_documents d
    where d.announcement_id = new.announcement_id and d.sha256 = new.source_hash
  ) then raise exception 'RAG_SOURCE_DOCUMENT_MISMATCH'; end if;
  if new.index_status = 'ACTIVE' and not exists (
    select 1 from public.assessment_rule_sets s
      join public.announcement_documents d on d.id = s.document_id
    where s.announcement_id = new.announcement_id and s.is_active and s.approved_at is not null
      and d.sha256 = new.source_hash
  ) then raise exception 'RAG_ACTIVE_RULE_SOURCE_MISMATCH'; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger product_v3_rag_index_guard before insert or update
  on public.product_v3_rag_index_metadata for each row
  execute function public.guard_product_v3_rag_index();

create function public.audit_product_v3_rag_index() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.product_v3_rag_index_audit_log(notice_id, action, before_snapshot, after_snapshot)
  values (new.notice_id, case when tg_op = 'INSERT' then 'REGISTER' else 'UPDATE' end,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end, to_jsonb(new));
  return new;
end $$;
create trigger product_v3_rag_index_audit after insert or update
  on public.product_v3_rag_index_metadata for each row
  execute function public.audit_product_v3_rag_index();

create function public.prevent_product_v3_rag_delete() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin raise exception 'RAG_INDEX_HISTORY_IMMUTABLE'; end $$;
create trigger product_v3_rag_index_no_delete before delete
  on public.product_v3_rag_index_metadata for each row
  execute function public.prevent_product_v3_rag_delete();
create trigger product_v3_rag_index_audit_no_change before update or delete
  on public.product_v3_rag_index_audit_log for each row
  execute function public.prevent_product_v3_rag_delete();

alter table public.product_v3_rag_index_metadata enable row level security;
alter table public.product_v3_rag_index_audit_log enable row level security;
revoke all on public.product_v3_rag_index_metadata, public.product_v3_rag_index_audit_log
  from public, anon, authenticated;
grant select, insert, update on public.product_v3_rag_index_metadata to service_role;
grant select, insert on public.product_v3_rag_index_audit_log to service_role;
grant usage, select on sequence public.product_v3_rag_index_audit_log_id_seq to service_role;
revoke all on function public.guard_product_v3_rag_index(), public.audit_product_v3_rag_index(),
  public.prevent_product_v3_rag_delete() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
