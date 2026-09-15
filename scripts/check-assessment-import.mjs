// Real PostgreSQL execution using a SYNTHETIC document. Not a Samdo verification claim.
import { readFile } from 'node:fs/promises';
import { strict as assert } from 'node:assert';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { syntheticPackage, syntheticApplicant } from '../features/applicationAssessment/server/lifecycleFixture.test-data.ts';
import { createRuleLifecycle, ruleSemantics } from '../features/applicationAssessment/server/lifecycle.ts';
import { DatabaseAssessmentRuleRepository } from '../features/applicationAssessment/data/databaseRuleRepository.ts';
import { assessApplication } from '../features/applicationAssessment/engine.ts';

const { PGlite } = await import(pathToFileURL(resolve('.cache/assessment-sql-check/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite();
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const rejected = async (fn, message) => { await assert.rejects(fn, undefined, message); checks++; };
async function asRole(role, fn) {
  assert.ok(['anon','authenticated','service_role'].includes(role));
  await db.exec(`set role ${role}`);
  try { return await fn(); } finally { await db.exec('reset role'); }
}
const statements = {
  import_assessment_rule_package: ['select public.import_assessment_rule_package($1) as result', ['p_package']],
  get_assessment_review_snapshot: ['select public.get_assessment_review_snapshot($1) as result', ['p_rule_set_id']],
  approve_assessment_rule_set: ['select public.approve_assessment_rule_set($1,$2,$3) as result', ['p_rule_set_id','p_fingerprint','p_reviewer']],
  activate_assessment_rule_set: ['select public.activate_assessment_rule_set($1,$2) as result', ['p_rule_set_id','p_expected_active_id']],
};
const rpc = (name, args) => asRole('service_role', async () => {
  const [sql, keys] = statements[name]; return (await db.query(sql, keys.map(key => args[key]))).rows[0].result;
});
const lifecycle = createRuleLifecycle(rpc);
const repo = new DatabaseAssessmentRuleRepository({
  read: lookup => asRole('anon', async () => (await db.query('select public.read_assessment_rule_set($1,$2) as result', [lookup.announcementId ?? null, lookup.listingId ?? null])).rows[0].result),
  catalog: after => asRole('anon', async () => (await db.query('select * from public.list_assessment_announcements($1)', [after ?? null])).rows),
});
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema storage; create table storage.buckets(id text primary key, name text, public boolean);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema public, storage to anon, authenticated, service_role;
    grant all on storage.objects to anon, authenticated, service_role;
    create policy unrelated_storage_policy on storage.objects for all to anon, authenticated using(true) with check(true);`);
  for (const name of ['20260915105910_assessment_rule_registry.sql', '20260915112848_assessment_rule_import_lifecycle.sql']) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
  }
  const p = syntheticPackage(), lookup = { announcementId: p.announcement.id }, id = p.ruleSet.id;
  await rejected(() => lifecycle.import(p), 'original object required');
  await db.query("insert into storage.objects(bucket_id,name) values('announcement-documents',$1)", [p.document.storagePath]);
  const broken = structuredClone(p); broken.rules.at(-1).evidence.documentId = p.announcement.id;
  // Deliberately bypass the TS preflight to prove rollback after prior rows were inserted.
  await rejected(() => rpc('import_assessment_rule_package', { p_package: broken }), 'late evidence error rolls back');
  for (const table of ['announcements','announcement_documents','assessment_rule_sets','assessment_rules','rule_evidence']) {
    check((await db.query(`select count(*)::int as count from public.${table}`)).rows[0].count === 0, `${table}: no partial DB rows`);
  }
  const imported = await lifecycle.import(p);
  check(imported.receipt.status === 'IMPORTED', 'import succeeds');
  const flags = (await db.query('select approved_at,is_active,is_public,source_status from public.assessment_rule_sets')).rows[0];
  check(flags.approved_at === null && !flags.is_active && !flags.is_public && flags.source_status === 'DRAFT_SOURCE_VERIFIED', 'import never approves');
  check((await repo.getActiveRuleSet(lookup)).status === 'RULE_NOT_AVAILABLE', 'unapproved is hidden');
  const snapshot = await lifecycle.review(id);
  assert.deepEqual(ruleSemantics(snapshot.rules), ruleSemantics(imported.expectedRules)); checks++;
  await asRole('service_role', () => db.query("update public.assessment_rules set config=jsonb_set(config,'{label}','\"edited\"') where rule_set_id=$1 and rule_key=$2", [id,p.rules[0].ruleKey]));
  await rejected(() => lifecycle.approve(id, snapshot.fingerprint, 'TEST REVIEWER'), 'stale review blocked in tool');
  await rejected(() => rpc('approve_assessment_rule_set', { p_rule_set_id:id, p_fingerprint:snapshot.fingerprint, p_reviewer:'TEST REVIEWER' }), 'stale review blocked in DB');
  await asRole('service_role', () => db.query('update public.assessment_rules set config=$1 where rule_set_id=$2 and rule_key=$3', [p.rules[0].config,id,p.rules[0].ruleKey]));
  const reviewed = await lifecycle.review(id);
  check((await lifecycle.approve(id,reviewed.fingerprint,'SYNTHETIC TEST REVIEWER')).status === 'APPROVED', 'review and approval');
  check((await repo.getActiveRuleSet(lookup)).status === 'RULE_NOT_AVAILABLE', 'approved inactive remains hidden');
  check((await lifecycle.activate(id,null)).status === 'ACTIVE', 'activation');
  const roundTrip = await repo.getActiveRuleSet(lookup);
  assert.equal(roundTrip.status,'AVAILABLE'); checks++;
  assert.deepEqual(ruleSemantics(roundTrip.rules),ruleSemantics(imported.expectedRules)); checks++;
  const assessed = assessApplication(roundTrip.rules,syntheticApplicant());
  for (const type of ['youth','newlywed','firstHome']) {
    const result = assessed.find(r => r.supplyType === type);
    check(result.status === 'ELIGIBLE', `DB ${type}: synthetic eligible`);
    check(result.sourceStatus === 'DRAFT_SOURCE_VERIFIED' && result.warnings.some(w => w.includes('검토본')), `${type}: draft provenance`);
    check(result.evidence.every(e => e.documentId === p.document.id) && result.provenance.documentId === p.document.id, `${type}: rule -> evidence -> document`);
  }
  check(assessed.find(r => r.supplyType === 'youth').score.total === 3, 'DB youth score from imported table');
  check(assessed.find(r => r.supplyType === 'firstHome').score === undefined, 'firstHome has no score');
  const underage = syntheticApplicant(); underage.details.birthDate='2008-09-15';
  check(assessApplication(roundTrip.rules,underage)[0].status === 'INELIGIBLE','DB youth ineligible');
  check(assessApplication(roundTrip.rules,{...syntheticApplicant(),details:{}})[0].status === 'NEEDS_MORE_INFORMATION','DB missing information');
  check((await repo.getActiveRuleSet({ announcementId:p.document.id })).status === 'RULE_NOT_AVAILABLE','unknown rule set');
  await rejected(() => lifecycle.import(p),'duplicate version conflict, no overwrite');
  await rejected(() => asRole('service_role', () => db.query("update public.assessment_rules set config='{}' where rule_set_id=$1",[id])),'approved rule immutable');

  for (const role of ['anon','authenticated']) {
    await asRole(role, async () => {
      for (const [name,[sql,keys]] of Object.entries(statements)) {
        const args = {p_package:p,p_rule_set_id:id,p_fingerprint:reviewed.fingerprint,p_reviewer:'UNTRUSTED',p_expected_active_id:null};
        await assert.rejects(db.query(sql,keys.map(k=>args[k])), error => error.code === '42501', `${role}: ${name} denied`); checks++;
      }
      check((await db.query('select count(*)::int as count from public.assessment_rule_sets')).rows[0].count === 1,`${role}: approved active public read`);
      check((await db.query("select * from storage.objects where bucket_id='announcement-documents'")).rows.length===0,`${role}: original private`);
      await assert.rejects(db.exec("insert into storage.objects(bucket_id,name) values('announcement-documents','unauthorized')"),error=>error.code==='42501');checks++;
    });
  }
  const next = structuredClone(p); next.ruleSet.id='44444444-4444-4444-8444-444444444444';next.ruleSet.version='SYNTHETIC-2';
  await lifecycle.import(next);
  await rejected(() => lifecycle.activate(next.ruleSet.id,id),'unapproved activation blocked');
  const secondReview = await lifecycle.review(next.ruleSet.id);
  await lifecycle.approve(next.ruleSet.id,secondReview.fingerprint,'SYNTHETIC TEST REVIEWER');
  await rejected(() => lifecycle.activate(next.ruleSet.id,null),'stale active version blocked');
  check((await repo.getActiveRuleSet(lookup)).rules.id===id,'failed activation preserves previous active');
  await lifecycle.activate(next.ruleSet.id,id);
  check((await repo.getActiveRuleSet(lookup)).rules.id===next.ruleSet.id,'version switch uses new active only');
  check((await db.query('select count(*)::int as count from public.assessment_admin_reviews')).rows[0].count===2,'two review records retained');
  const malformed = structuredClone(p); malformed.ruleSet.id='55555555-5555-4555-8555-555555555555';malformed.ruleSet.version='BROKEN-TEST';
  await lifecycle.import(malformed);
  await asRole('service_role', () => db.query("update public.assessment_rules set config='{}' where rule_set_id=$1",[malformed.ruleSet.id]));
  await rejected(() => lifecycle.review(malformed.ruleSet.id),'malformed stored config cannot be approved by tool');
  console.log(`Assessment import lifecycle: ${checks} checks passed. Synthetic document only; Samdo NOT verified. PostgREST/Storage API not exercised.`);
} finally { await db.close(); }
