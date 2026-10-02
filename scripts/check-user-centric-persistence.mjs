// Isolated PostgreSQL migration/RLS/concurrency verification. No network or credentials.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createEmptyApplicantProfileV3 } from '../features/profile/v3.ts';

const { PGlite } = await import(pathToFileURL(resolve('.cache/assessment-sql-check/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite();
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const rejects = async (fn, message) => { await assert.rejects(fn, undefined, message); checks += 1; };
const ids = {
  a: '11111111-1111-4111-8111-111111111111',
  b: '22222222-2222-4222-8222-222222222222',
  announcement: '33333333-3333-4333-8333-333333333333',
  document: '44444444-4444-4444-8444-444444444444',
  ruleSet: '55555555-5555-4555-8555-555555555555',
  result: '66666666-6666-4666-8666-666666666666',
};
const sourceHash = 'a'.repeat(64);
const inputHash = 'b'.repeat(64);
const v2 = {
  version: 2,
  basic: { name: '이관 사용자', age: 31, birthDate: { status: 'unknown' }, occupation: { status: 'known', value: 'worker' } },
  residence: { currentRegion: '검증지역' }, preferences: { regions: ['검증지역'] },
  subscriptionAccount: { hasAccount: { status: 'known', value: true }, accountMonths: { status: 'known', value: 24 }, monthlyPayment: { status: 'known', value: 100000 } },
  housing: { currentOwnership: { status: 'known', value: 'no-home' }, previousOwnership: { status: 'unknown' }, householdHasHome: { status: 'unknown' }, householdDisqualifyingPreviousOwnership: { status: 'unknown' }, hasSpecialSupplyRestriction: { status: 'unknown' } },
  household: { memberCount: { status: 'unknown' } },
  family: { marriageStatus: { status: 'unknown' }, marriageYears: { status: 'unknown' }, childrenCount: { status: 'unknown' }, childBirthYears: { status: 'unknown' } },
  income: { annualRange: { status: 'unknown' }, workOrBusinessIncomeEligible: { status: 'unknown' }, incomeTaxPaymentYears: { status: 'unknown' } },
  assets: { financial: { status: 'unknown' }, realEstate: { status: 'unknown' }, vehicle: { status: 'unknown' }, debt: { status: 'unknown' } },
};

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claim.role', true), '')
    $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    create table public.user_profiles(
      user_id uuid primary key references auth.users(id) on delete cascade,
      schema_version integer not null default 2 check(schema_version=2),
      profile_json jsonb not null check(jsonb_typeof(profile_json)='object'),
      updated_at timestamptz not null default now()
    );
    create table public.announcements(id uuid primary key, title text not null);
    create table public.announcement_documents(
      id uuid primary key,
      announcement_id uuid not null references public.announcements(id),
      sha256 text not null
    );
    create table public.assessment_rule_sets(
      id uuid primary key,
      announcement_id uuid not null references public.announcements(id),
      document_id uuid references public.announcement_documents(id),
      version text not null,
      source_status text not null default 'REFERENCE',
      is_active boolean not null default false,
      is_public boolean not null default false,
      approved_at timestamptz
    );
    create table public.announcement_listing_bindings(
      listing_id text primary key,
      announcement_id uuid not null references public.announcements(id),
      bound_rule_set_id uuid references public.assessment_rule_sets(id)
    );
  `);
  const migration = await readFile(new URL('../supabase/migrations/20261001071555_user_centric_assessment_persistence.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  const correction = await readFile(new URL('../supabase/migrations/20261001073009_user_centric_assessment_service_role_fix.sql', import.meta.url), 'utf8');
  await db.exec(correction);
  const serverExecution = await readFile(new URL('../supabase/migrations/20261001080049_user_centric_assessment_server_execution.sql', import.meta.url), 'utf8');
  await db.exec(serverExecution);
  const serverReuseFix = await readFile(new URL('../supabase/migrations/20261001081655_user_centric_assessment_server_reuse_fix.sql', import.meta.url), 'utf8');
  await db.exec(serverReuseFix);
  await db.query('insert into auth.users(id) values($1),($2)', [ids.a, ids.b]);
  await db.query('insert into public.announcements(id,title) values($1,$2)', [ids.announcement, '검증 공고']);
  await db.query('insert into public.announcement_documents(id,announcement_id,sha256) values($1,$2,$3)', [ids.document, ids.announcement, sourceHash]);
  await db.query("insert into public.assessment_rule_sets(id,announcement_id,document_id,version,source_status,is_active,is_public,approved_at) values($1,$2,$3,$4,'DRAFT_SOURCE_VERIFIED',true,true,now())", [ids.ruleSet, ids.announcement, ids.document, '1.0.0']);
  await db.query('insert into public.announcement_listing_bindings(listing_id,announcement_id,bound_rule_set_id) values($1,$2,$3)', ['listing-1', ids.announcement, ids.ruleSet]);
  await db.query('insert into public.user_profiles(user_id,profile_json,updated_at) values($1,$2,$3)', [ids.b, v2, '2026-10-01T00:00:00Z']);

  await db.exec('set role service_role');
  await db.query("select set_config('request.jwt.claim.role','service_role',false)");
  const migrated = { ...createEmptyApplicantProfileV3(), revision: 1 };
  let response = (await db.query(
    'select public.backfill_applicant_profile_v3($1,$2,$3,$4,$5) result',
    [ids.b, migrated, '2026-10-01T00:00:00Z', 'c'.repeat(64), 'test-v1'],
  )).rows[0].result;
  ok(response.status === 'MIGRATED', 'reviewed V2 row backfills once');
  response = (await db.query(
    'select public.backfill_applicant_profile_v3($1,$2,$3,$4,$5) result',
    [ids.b, migrated, '2026-10-01T00:00:00Z', 'c'.repeat(64), 'test-v1'],
  )).rows[0].result;
  ok(response.status === 'NO_CHANGE', 'backfill is idempotent');
  await db.exec('reset role; set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids.a]);

  const empty = createEmptyApplicantProfileV3();
  response = (await db.query(
    'select public.save_applicant_profile_v3(0,$1,null,null) result', [empty],
  )).rows[0].result;
  ok(response.revision === 1 && response.profile.revision === 1, 'profile create returns DB revision');
  await rejects(
    () => db.query('select public.save_applicant_profile_v3(0,$1,null,null)', [empty]),
    'stale profile revision is rejected',
  );
  await rejects(
    () => db.query('update public.applicant_profiles_v3 set revision=9 where user_id=$1', [ids.a]),
    'authenticated clients cannot bypass revision RPC',
  );
  let rows = (await db.query('select user_id from public.applicant_profiles_v3 order by user_id')).rows;
  ok(rows.length === 1 && rows[0].user_id === ids.a, 'RLS exposes only owner profile');

  const storedResult = {
    id: ids.result, userId: ids.a, announcementId: ids.announcement, listingId: 'listing-1', supplyType: 'youth',
    ruleSetId: ids.ruleSet, ruleSetVersion: '1.0.0', sourceStatus: 'DRAFT_SOURCE_VERIFIED',
    sourceDocumentId: ids.document, sourceDocumentHash: sourceHash, profileRevision: 1,
    engineVersion: 'assessment-engine-v1', inputHash, portfolioStatus: 'COMPLETE',
    eligibilityStatus: 'ELIGIBLE', scoringStatus: 'PENDING', stage: 'PRIORITY', score: null,
    missingUserFields: [], missingAnnouncementFields: [], blockers: [], warnings: [], evidence: [],
    engineResult: null, calculatedAt: '2026-10-01T00:00:00Z', stale: { isStale: false },
  };
  await rejects(
    () => db.query('select public.save_user_assessment_result($1)', [storedResult]),
    'authenticated clients cannot submit calculated result snapshots',
  );
  await db.exec('reset role; set role service_role');
  await db.query("select set_config('request.jwt.claim.role','service_role',false)");
  const saved = (await db.query('select public.save_user_assessment_result_server($1,$2) result', [ids.a, storedResult])).rows[0].result;
  ok(saved.id === ids.result && saved.user_id === ids.a, 'result RPC preserves provenance and owner');
  await db.query("update public.user_assessment_results set stale_at=now(), stale_reason='ENGINE_CHANGED' where id=$1", [ids.result]);
  const recalculatedId = '77777777-7777-4777-8777-777777777777';
  const recalculated = (await db.query(
    'select public.save_user_assessment_result_server($1,$2) result',
    [ids.a, { ...storedResult, id: recalculatedId }],
  )).rows[0].result;
  ok(recalculated.id === recalculatedId, 'stale exact-match row is superseded instead of reused');
  await db.exec('reset role; set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids.a]);
  await rejects(
    () => db.query('insert into public.user_assessment_results(id) values(gen_random_uuid())'),
    'authenticated clients cannot insert arbitrary results',
  );

  response = (await db.query(
    'select public.save_applicant_profile_v3(1,$1,null,null) result', [{ ...empty, revision: 1 }],
  )).rows[0].result;
  ok(response.revision === 2, 'matching expected revision increments atomically');
  rows = (await db.query('select stale_reason from public.user_assessment_results where superseded_at is null')).rows;
  ok(rows.length === 1 && rows[0].stale_reason === 'PROFILE_CHANGED', 'profile update marks current results stale');

  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids.b]);
  rows = (await db.query('select id from public.user_assessment_results')).rows;
  ok(rows.length === 0, 'another user cannot read assessment results');
  await db.exec('reset role; set role anon');
  await rejects(() => db.query('select * from public.applicant_profiles_v3'), 'anon profile read denied');
  await rejects(() => db.query('select * from public.user_assessment_results'), 'anon result read denied');
  await db.exec('reset role');

  const v2Count = Number((await db.query('select count(*) count from public.user_profiles')).rows[0].count);
  ok(v2Count === 1, 'additive migration leaves V2 rows intact');
  console.log(`User-centric persistence SQL/RLS: ${checks} checks passed (isolated PGlite; no remote connection)`);
} finally {
  await db.close();
}
