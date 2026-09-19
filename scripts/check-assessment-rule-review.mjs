// Isolated PostgreSQL/RLS verification. No network, Supabase credentials or remote writes.
import { readFile } from 'node:fs/promises';
import { strict as assert } from 'node:assert';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const { PGlite } = await import(pathToFileURL(resolve('.cache/assessment-sql-check/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite(); let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const rejects = async (action, message) => { await assert.rejects(action, undefined, message); checks++; };
const ids = { announcement: '11111111-1111-4111-8111-111111111111', document: '22222222-2222-4222-8222-222222222222', set: '33333333-3333-4333-8333-333333333333' };
const hash = 'a'.repeat(64);
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema storage; create table storage.buckets(id text primary key, name text, public boolean);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security; grant usage on schema public, storage to anon, authenticated, service_role;
    grant all on storage.objects to anon, authenticated, service_role;`);
  for (const name of ['20260915105910_assessment_rule_registry.sql', '20260915112848_assessment_rule_import_lifecycle.sql', '20260919204711_assessment_rule_review_backend.sql'])
    await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
  await db.query("insert into public.announcements(id,source,title) values($1,'LOCAL_TEST','Review backend test')", [ids.announcement]);
  await db.query("insert into public.announcement_documents(id,announcement_id,document_type,storage_path,file_name,mime_type,sha256) values($1,$2,'DRAFT',$3,'review.hwp','application/x-hwp',$4)",
    [ids.document, ids.announcement, `2026/${ids.announcement}/${ids.document}/original.hwp`, hash]);
  await db.query("insert into public.assessment_rule_sets(id,announcement_id,document_id,version,source_status,effective_date,config) values($1,$2,$3,'REVIEW-1','DRAFT_SOURCE_VERIFIED','2026-09-14','{}')", [ids.set, ids.announcement, ids.document]);
  const inserted = await db.query("insert into public.assessment_rules(rule_set_id,supply_type,category,rule_key,config) values($1,'youth','ELIGIBILITY','youth.age','{}') returning id", [ids.set]);
  const ruleId = inserted.rows[0].id;
  await db.query("insert into public.rule_evidence(rule_id,document_id,evidence_key,source,section,evidence_label) values($1,$2,'age:evidence','Samdo VER1.7','신청자격','만 19~39세')", [ruleId, ids.document]);
  const evidenceId = 'age:evidence';
  await db.query("insert into public.assessment_rule_review_versions(rule_set_id,reviewed_document_sha256,current_document_sha256) values($1,$2,$2)", [ids.set, hash]);
  const review = await db.query(`insert into public.assessment_rule_reviews(rule_set_id,candidate_rule_id,materialized_rule_id,original_candidate_hash,original_candidate,
      critical_category,is_critical,is_required,candidate_status) values($1,'candidate:youth-age',$2,$3,$4,'AGE',true,true,'REVIEW_REQUIRED') returning id`,
    [ids.set, ruleId, 'b'.repeat(64), { ruleKey: 'youth.age', value: [19, 39], evidence: [{ id: evidenceId, documentId: ids.document }] }]);
  const reviewId = review.rows[0].id;
  await db.query("insert into public.assessment_rule_evidence_reviews(rule_review_id,evidence_id) values($1,$2)", [reviewId, evidenceId]);
  await db.query("insert into public.assessment_rule_review_conflicts(rule_set_id,concept,candidates) values($1,'age conflict',$2)", [ids.set, [{ candidateId: 'a', value: 39 }, { candidateId: 'b', value: 40 }]]);
  await db.query("insert into public.assessment_rule_review_unresolved(rule_set_id,issue_type,description,rule_ids) values($1,'UNRESOLVED','Needs review',$2)", [ids.set, ['candidate:youth-age']]);
  await db.query("insert into public.assessment_rule_review_audit_log(rule_set_id,actor_id,action,target_type,target_id,reason) values($1::uuid,'reviewer:test','START_REVIEW','RULE_VERSION',$1::text,'isolated test')", [ids.set]);
  ok((await db.query('select count(*)::int count from public.assessment_rule_reviews')).rows[0].count === 1, 'review row inserted');
  await rejects(() => db.query("update public.assessment_rule_reviews set original_candidate='{}',revision=1 where id=$1", [reviewId]), 'AI original immutable');
  await rejects(() => db.query("update public.assessment_rule_reviews set review_status='APPROVED' where id=$1", [reviewId]), 'revision and decision metadata required');
  await db.query("update public.assessment_rule_reviews set review_status='APPROVED',reviewer_id='reviewer:test',reviewed_at=now(),decision_reason='source checked',revision=1 where id=$1", [reviewId]);
  ok((await db.query('select review_status from public.assessment_rule_reviews where id=$1', [reviewId])).rows[0].review_status === 'APPROVED', 'trusted review update');
  await rejects(() => db.query("update public.assessment_rule_evidence_reviews set review_status='REPLACED',reviewer_id='reviewer:test',reviewed_at=now() where rule_review_id=$1 and evidence_id=$2", [reviewId, evidenceId]), 'replacement snapshot required');
  await rejects(() => db.exec('delete from public.assessment_rule_review_audit_log'), 'audit append-only');
  await rejects(() => db.query("insert into public.assessment_rule_review_versions(rule_set_id,reviewed_document_sha256,current_document_sha256) values(gen_random_uuid(),$1,$1)", [hash]), 'unknown rule set rejected');
  let gate = (await db.query('select public.can_activate_assessment_rule_version($1) gate', [ids.set])).rows[0].gate;
  ok(gate.canActivate === false && gate.blockers.includes('CONFLICT') && gate.blockers.includes('UNRESOLVED') && gate.blockers.includes('EVIDENCE_NOT_VALID'), 'database activation gate reports unresolved blockers');
  await db.query("update public.assessment_rule_evidence_reviews set review_status='VALID',reviewer_id='reviewer:test',reviewed_at=now() where rule_review_id=$1", [reviewId]);
  await db.query("update public.assessment_rule_review_conflicts set resolution_status='RESOLVED',resolution=$2,reviewer_id='reviewer:test',reviewed_at=now() where rule_set_id=$1", [ids.set, { type: 'CANDIDATE', candidateId: 'a' }]);
  await db.query("update public.assessment_rule_review_unresolved set resolution='checked',reviewer_id='reviewer:test',reviewed_at=now() where rule_set_id=$1", [ids.set]);
  await db.query("update public.assessment_rule_review_versions set lifecycle_status='IN_REVIEW',revision=1,updated_at=now() where rule_set_id=$1", [ids.set]);
  gate = (await db.query('select public.can_activate_assessment_rule_version($1) gate', [ids.set])).rows[0].gate;
  ok(gate.canActivate === true && gate.blockers.length === 0, 'database activation gate becomes eligible only after review completion');
  await db.query("insert into public.assessment_admin_reviews(rule_set_id,decision,reviewer_label) values($1,'APPROVED','ISOLATED REVIEWER')", [ids.set]);
  await db.query('update public.assessment_rule_sets set approved_at=now() where id=$1', [ids.set]);
  ok((await db.query('select public.activate_assessment_rule_set($1,null) result', [ids.set])).rows[0].result.status === 'ACTIVE', 'activation RPC enforces and passes completed review gate');
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    for (const table of ['assessment_rule_review_versions','assessment_rule_reviews','assessment_rule_evidence_reviews','assessment_rule_review_conflicts','assessment_rule_review_unresolved','assessment_rule_exception_reviews','assessment_rule_review_audit_log']) {
      await rejects(() => db.query(`select * from public.${table}`), `${role}: private ${table}`);
      for (const privilege of ['SELECT','INSERT','UPDATE','DELETE']) ok((await db.query('select has_table_privilege(current_user,$1,$2) allowed', [`public.${table}`, privilege])).rows[0].allowed === false, `${role}: ${privilege} absent ${table}`);
    }
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  ok((await db.query('select count(*)::int count from public.assessment_rule_reviews')).rows[0].count === 1, 'service role can read review queue');
  await db.exec('reset role');
  console.log(`Assessment rule review SQL/RLS: ${checks} checks passed (isolated PGlite; no remote connection)`);
} finally { await db.close(); }
