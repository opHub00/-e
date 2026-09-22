// Isolated SQL/RLS verification. No network, project credentials, or production DB.
// Install the optional test runtime as documented; it is not an application dependency.
import { readFile } from 'node:fs/promises';
import { strict as assert } from 'node:assert';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { serializeRuleSet } from '../features/applicationAssessment/data/ruleCodec.ts';
import { samdoReferenceRules } from '../features/applicationAssessment/reference/samdoReferenceRules.ts';
import { decodeRuleSet } from '../features/applicationAssessment/data/ruleCodec.ts';

const { PGlite } = await import(pathToFileURL(resolve('.cache/assessment-sql-check/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite();
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const fails = async (sql, message) => { await assert.rejects(db.exec(sql), undefined, message); checks++; };
try {
  // Supabase infrastructure stand-ins only; actual application schema comes from the migration.
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema storage; create table storage.buckets(id text primary key, name text, public boolean);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema public, storage to anon, authenticated, service_role;
    grant all on storage.objects to anon, authenticated, service_role;
    create policy unrelated_permissive_policy on storage.objects for all to anon, authenticated using(true) with check(true);`);
  await db.exec(await readFile(new URL('../supabase/migrations/20260915105910_assessment_rule_registry.sql', import.meta.url), 'utf8'));
  const ids = { announcementId: '11111111-1111-4111-8111-111111111111', ruleSetId: '22222222-2222-4222-8222-222222222222', documentId: null };
  const seed = serializeRuleSet(samdoReferenceRules, ids);
  await db.query('insert into public.announcements(id,source,title,status) values($1,$2,$3,$4)', [ids.announcementId, 'LOCAL_TEST', 'Synthetic SQL test', 'PUBLISHED']);
  await db.query('insert into public.announcement_listing_bindings(listing_id,announcement_id) values($1,$2)', ['test:exact', ids.announcementId]);
  await db.query('insert into public.assessment_rule_sets(id,announcement_id,version,config) values($1,$2,$3,$4)', [ids.ruleSetId, ids.announcementId, 'TEST-1', seed.rule_set.config]);
  for (const row of seed.rules) {
    const inserted = await db.query('insert into public.assessment_rules(rule_set_id,supply_type,stage,category,rule_key,config) values($1,$2,$3,$4,$5,$6) returning id',
      [ids.ruleSetId, row.supply_type, row.stage, row.category, row.rule_key, row.config]);
    const e = row.evidence[0];
    await db.query('insert into public.rule_evidence(rule_id,evidence_key,source,section,evidence_label) values($1,$2,$3,$4,$5)', [inserted.rows[0].id, e.evidence_key, e.source, e.section, e.evidence_label]);
  }
  await db.exec('set role anon');
  ok((await db.query('select * from public.assessment_rule_sets')).rows.length === 0, 'unapproved hidden');
  ok((await db.query('select * from public.assessment_rules')).rows.length === 0, 'unapproved child hidden');
  ok((await db.query('select * from public.rule_evidence')).rows.length === 0, 'unapproved evidence hidden');
  await db.exec('reset role');
  await fails(`update public.assessment_rule_sets set approved_at=now(),is_active=true where id='${ids.ruleSetId}'`, 'cannot approve without review');
  await db.query("insert into public.assessment_admin_reviews(rule_set_id,decision,reviewer_label) values($1,'APPROVED','ISOLATED TEST')", [ids.ruleSetId]);
  await db.query('update public.assessment_rule_sets set approved_at=now(),is_active=true,is_public=true where id=$1', [ids.ruleSetId]);
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    const read = await db.query('select public.read_assessment_rule_set($1,null) as payload', [ids.announcementId]);
    ok(decodeRuleSet(read.rows[0].payload, { announcementId: ids.announcementId }).status === 'AVAILABLE', `${role}: snapshot maps to domain`);
    const exact = await db.query('select public.read_assessment_rule_set(null,$1) as payload', ['test:exact']);
    ok(exact.rows[0].payload.listing_id === 'test:exact', `${role}: explicit listing mapping`);
    ok((await db.query("select public.read_assessment_rule_set(null,'wrong') as payload")).rows[0].payload === null, `${role}: unknown listing unavailable`);
    ok((await db.query('select * from public.list_assessment_announcements(null)')).rows.length === 1, `${role}: catalog`);
    ok((await db.query('select * from public.list_assessment_announcements($1)', [ids.announcementId])).rows.length === 0, `${role}: cursor`);
    for (const table of ['announcements', 'announcement_listing_bindings', 'announcement_documents', 'assessment_rule_sets', 'assessment_rules', 'rule_evidence', 'rule_extraction_jobs', 'assessment_admin_reviews']) {
      await fails(`insert into public.${table} default values`, `${role}: insert ${table} denied`);
      await fails(`delete from public.${table}`, `${role}: delete ${table} denied`);
      for (const privilege of ['INSERT', 'UPDATE', 'DELETE']) {
        ok((await db.query('select has_table_privilege(current_user,$1,$2) as allowed', [`public.${table}`, privilege])).rows[0].allowed === false, `${role}: ${privilege} grant absent on ${table}`);
      }
    }
    await fails('select * from public.assessment_admin_reviews', `${role}: review records private`);
    await fails('select * from public.rule_extraction_jobs', `${role}: jobs private`);
    await fails("insert into storage.objects(bucket_id,name) values('announcement-documents','test.hwp')", `${role}: upload denied despite unrelated policy`);
    await db.exec('reset role');
  }
  await fails("update public.assessment_rules set config='{}'", 'approved rule immutable');
  await fails("update public.rule_evidence set section='changed'", 'approved evidence immutable');
  await fails("update public.assessment_rule_sets set source_status='DRAFT_SOURCE_VERIFIED'", 'approved set immutable');
  await fails('delete from public.assessment_admin_reviews', 'review immutable');
  const nextId = '44444444-4444-4444-8444-444444444444';
  await db.query('insert into public.assessment_rule_sets(id,announcement_id,version,config) values($1,$2,$3,$4)', [nextId, ids.announcementId, 'TEST-2', seed.rule_set.config]);
  await db.query("insert into public.assessment_admin_reviews(rule_set_id,decision,reviewer_label) values($1,'APPROVED','ISOLATED TEST')", [nextId]);
  await fails(`update public.assessment_rule_sets set approved_at=now(),is_active=true,is_public=true where id='${nextId}'`, 'two active versions forbidden');
  await db.exec(`begin; update public.assessment_rule_sets set is_active=false where id='${ids.ruleSetId}'; update public.assessment_rule_sets set approved_at=now(),is_active=true,is_public=true where id='${nextId}'; commit; set role anon;`);
  const versions = await db.query('select id from public.assessment_rule_sets');
  ok(versions.rows.length === 1 && versions.rows[0].id === nextId, 'only active version visible');
  ok((await db.query('select * from public.assessment_rules')).rows.length === 0, 'old version rules hidden');
  const incomplete = (await db.query('select public.read_assessment_rule_set($1,null) as payload', [ids.announcementId])).rows[0].payload;
  ok(decodeRuleSet(incomplete, { announcementId: ids.announcementId }).status === 'INVALID_RULE_SET', 'incomplete approved manifest rejected');
  await db.exec('reset role');
  const docId = '33333333-3333-4333-8333-333333333333';
  await db.query("insert into public.announcement_documents(id,announcement_id,document_type,storage_path,file_name,mime_type,sha256) values($1,$2,'DRAFT',$3,'test.hwp','application/x-hwp',$4)", [docId, ids.announcementId, `2026/${ids.announcementId}/${docId}/original.hwp`, 'a'.repeat(64)]);
  await fails('update public.announcement_documents set is_official=true', 'document cannot be promoted by overwrite');
  await fails(`insert into public.assessment_rule_sets(announcement_id,document_id,version,source_status,effective_date,config) values('${ids.announcementId}','${docId}','BAD-OFFICIAL','OFFICIAL_VERIFIED','2026-09-14','{}')`, 'draft cannot be official');
  await db.exec("insert into storage.objects(bucket_id,name) values('announcement-documents','original.hwp'); set role anon;");
  ok((await db.query('select * from storage.objects')).rows.length === 0, 'private originals cannot be read');
  await db.exec('reset role');
  console.log(`Assessment migration SQL/RLS: ${checks} checks passed (isolated PGlite, no production connection)`);
} finally { await db.close(); }
