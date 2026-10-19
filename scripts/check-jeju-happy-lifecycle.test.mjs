// Isolated PostgreSQL lifecycle test for the reviewed Jeju Happy Housing package.
// No remote database, Storage API or production credentials are used.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createRuleLifecycle, ruleSemantics } from '../features/applicationAssessment/server/lifecycle.ts';
import { DatabaseAssessmentRuleRepository } from '../features/applicationAssessment/data/databaseRuleRepository.ts';
import { assessApplication } from '../features/applicationAssessment/engine.ts';
import { knownField, createMinimalApplicantProfile } from '../features/profile/domain.ts';

const { PGlite } = await import(pathToFileURL(resolve(
  '.cache/assessment-sql-check/node_modules/@electric-sql/pglite/dist/index.js',
)).href);
const packageJson = JSON.parse(await readFile(new URL(
  '../data/assessment-rules/lh-jeju-ildo-samdo-happy-20260918.json', import.meta.url,
), 'utf8'));
const db = new PGlite();
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };

async function asRole(role, operation) {
  await db.exec(`set role ${role}`);
  try { return await operation(); } finally { await db.exec('reset role'); }
}

const statements = {
  import_assessment_rule_package: ['select public.import_assessment_rule_package($1) result', ['p_package']],
  get_assessment_review_snapshot: ['select public.get_assessment_review_snapshot($1) result', ['p_rule_set_id']],
  approve_assessment_rule_set: ['select public.approve_assessment_rule_set($1,$2,$3) result', ['p_rule_set_id', 'p_fingerprint', 'p_reviewer']],
  activate_assessment_rule_set: ['select public.activate_assessment_rule_set($1,$2) result', ['p_rule_set_id', 'p_expected_active_id']],
};

const rpc = (name, args) => asRole('service_role', async () => {
  const [sql, keys] = statements[name];
  return (await db.query(sql, keys.map(key => args[key]))).rows[0].result;
});

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema public, storage to anon, authenticated, service_role;
    grant all on storage.objects to service_role;
  `);
  for (const migration of [
    '20260915105910_assessment_rule_registry.sql',
    '20260915112848_assessment_rule_import_lifecycle.sql',
  ]) await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'));

  await db.query("insert into storage.objects(bucket_id,name) values('announcement-documents',$1)", [packageJson.document.storagePath]);
  const lifecycle = createRuleLifecycle(rpc);
  const imported = await lifecycle.import(packageJson);
  check(imported.receipt.status === 'IMPORTED', 'package imports');
  check(imported.expectedRules.supplies.length === 5, 'five supply types survive import decode');

  const review = await lifecycle.review(packageJson.ruleSet.id);
  assert.deepEqual(ruleSemantics(review.rules), ruleSemantics(imported.expectedRules));
  checks += 1;
  check((await lifecycle.approve(packageJson.ruleSet.id, review.fingerprint, 'LOCAL LIFECYCLE REVIEWER')).status === 'APPROVED', 'review approves exact fingerprint');
  check((await lifecycle.activate(packageJson.ruleSet.id, null)).status === 'ACTIVE', 'approved version activates');

  const externalListingId = packageJson.announcement.externalId;
  await asRole('service_role', () => db.query(
    'insert into public.announcement_listing_bindings(listing_id,announcement_id) values($1,$2)',
    [externalListingId, packageJson.announcement.id],
  ));
  const repository = new DatabaseAssessmentRuleRepository({
    read: async lookup => asRole('anon', async () => (await db.query(
      'select public.read_assessment_rule_set($1,$2) result',
      [lookup.announcementId ?? null, lookup.listingId ?? null],
    )).rows[0].result),
    catalog: async after => asRole('anon', async () => (await db.query(
      'select * from public.list_assessment_announcements($1)', [after ?? null],
    )).rows),
  });
  const loaded = await repository.getActiveRuleSet({ listingId: externalListingId });
  assert.equal(loaded.status, 'AVAILABLE');
  checks += 1;
  check(loaded.rules.id === packageJson.ruleSet.id, 'listing resolves to the activated RuleSet');

  const profile = createMinimalApplicantProfile({
    name: '로컬 lifecycle 청년', age: 30,
    currentRegion: '제주특별자치도', preferredRegions: ['제주특별자치도'],
  });
  profile.family.marriageStatus = knownField('single');
  profile.housing.currentOwnership = knownField('no-home');
  profile.housing.householdHasHome = knownField(false);
  profile.household.memberCount = knownField(1);
  const results = assessApplication(loaded.rules, { profile, details: {
    birthDate: '1996-09-18', currentResidence: '제주특별자치도',
    incomeSourceRegion: '제주특별자치도', children: [], incomeHouseholdSize: 1,
    householdIncome: 4_000_000, totalAssets: 100_000_000, vehicleValue: 0,
    canProveSubscriptionByMoveIn: true, adultOrMinorHouseholdHeadException: true,
    noPublicRentalSubletRestriction: true, singleHouseholdApplicationClear: true,
    specialExceptions: [],
  } }, externalListingId);
  const youth = results.find(item => item.supplyType === 'youth');
  check(youth?.status === 'ELIGIBLE' && youth.stageLabel === '1순위', 'bound RuleSet produces the representative youth decision');
  check(youth?.evidence.every(item => item.locator?.sha256 === packageJson.document.sha256), 'result evidence stays tied to the source hash');

  console.log(`Jeju Happy Housing local lifecycle: ${checks} checks passed (import → review → approve → activate → bind → assess).`);
} finally {
  await db.close();
}
