// Isolated PGlite RAG lineage/RLS verification. No remote database or credentials.
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(resolve('.cache/assessment-sql-check/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite();
const noticeId = 'test-notice-1';
const announcementId = '11111111-1111-4111-8111-111111111111';
const documentId = '22222222-2222-4222-8222-222222222222';
const sourceHash = 'a'.repeat(64);
let checks = 0;
const ok = (condition, message) => { assert.ok(condition, message); checks += 1; };
const rejects = async (action, message) => { await assert.rejects(action, undefined, message); checks += 1; };
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema storage; create table storage.buckets(id text primary key, name text, public boolean);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema public, storage to anon, authenticated, service_role;
    grant all on storage.objects to anon, authenticated, service_role;`);
  await db.exec(await readFile(new URL('../supabase/migrations/20260915105910_assessment_rule_registry.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261018134607_product_v3_rag_index_metadata.sql', import.meta.url), 'utf8'));
  await db.query('insert into public.announcements(id,source,title,status) values($1,$2,$3,$4)',
    [announcementId, 'LOCAL_TEST', 'RAG isolated test', 'PUBLISHED']);
  await db.query(`insert into public.announcement_documents(id,announcement_id,document_type,storage_path,file_name,mime_type,version_label,sha256,is_official)
    values($1,$2,'DRAFT',$3,'final1.8.hwp','application/x-hwp','final1.8',$4,false)`,
    [documentId, announcementId, `2026/${announcementId}/${documentId}/original.hwp`, sourceHash]);
  await db.query(`insert into public.product_v3_rag_index_metadata
    (notice_id,announcement_id,source_version,source_hash,index_version,chunk_count,index_status)
    values($1,$2,'final1.8',$3,'rag-v1',0,'REINDEX_REQUIRED')`, [noticeId, announcementId, sourceHash]);
  ok((await db.query('select count(*)::int count from public.product_v3_rag_index_audit_log')).rows[0].count === 1,
    'registration is audited');
  await db.query("update public.product_v3_rag_index_metadata set index_status='FAILED' where notice_id=$1", [noticeId]);
  ok((await db.query('select count(*)::int count from public.product_v3_rag_index_audit_log')).rows[0].count === 2,
    'status update is audited');
  await rejects(() => db.query("update public.product_v3_rag_index_metadata set source_hash=$1 where notice_id=$2", ['b'.repeat(64), noticeId]),
    'source hash mismatch rejected');
  await rejects(() => db.query("update public.product_v3_rag_index_metadata set index_status='ACTIVE',chunk_count=2,indexed_at=now() where notice_id=$1", [noticeId]),
    'unapproved source cannot be marked active');
  await rejects(() => db.query('delete from public.product_v3_rag_index_metadata where notice_id=$1', [noticeId]),
    'index history cannot be deleted');
  await rejects(() => db.query("update public.product_v3_rag_index_audit_log set action='UPDATE'"),
    'audit history cannot be changed');
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    for (const table of ['product_v3_rag_index_metadata', 'product_v3_rag_index_audit_log']) {
      await rejects(() => db.query(`select * from public.${table}`), `${role} cannot read ${table}`);
      ok((await db.query('select has_table_privilege(current_user,$1,$2) allowed', [`public.${table}`, 'INSERT'])).rows[0].allowed === false,
        `${role} cannot write ${table}`);
    }
    await db.exec('reset role');
  }
  const rls = await db.query("select relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname = any($1::text[])",
    [['product_v3_rag_index_metadata', 'product_v3_rag_index_audit_log']]);
  ok(rls.rows.length === 2 && rls.rows.every(row => row.relrowsecurity), 'both RAG tables enable RLS');
  console.log(`Product V3 RAG metadata SQL/RLS: ${checks} checks passed (isolated PGlite)`);
} finally { await db.close(); }
