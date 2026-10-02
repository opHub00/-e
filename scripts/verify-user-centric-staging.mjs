// Explicit remote Staging verification. Creates disposable auth users and always cleans them up.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createApplicantProfileFromLegacy, knownField } from '../features/profile/domain.ts';
import { createEmptyApplicantProfileV3, migrateApplicantProfileV2ToV3 } from '../features/profile/v3.ts';

const environment = process.env.WANPANE_ENV?.trim().toLowerCase();
const url = process.env.SUPABASE_STAGING_URL?.trim();
const stagingRef = process.env.SUPABASE_STAGING_PROJECT_REF?.trim().toLowerCase();
const productionRef = process.env.SUPABASE_PRODUCTION_PROJECT_REF?.trim().toLowerCase();
const anonKey = process.env.SUPABASE_STAGING_ANON_KEY?.trim();
const serviceKey = process.env.SUPABASE_STAGING_SERVICE_ROLE_KEY?.trim();
const actualRef = (() => {
  try { return new URL(url).hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1] ?? null; }
  catch { return null; }
})();
assert.equal(environment, 'staging', 'STAGING_ENV_REQUIRED');
assert.ok(stagingRef && actualRef === stagingRef, 'STAGING_PROJECT_REF_MISMATCH');
assert.ok(productionRef && actualRef !== productionRef, 'PRODUCTION_PROJECT_FORBIDDEN');
assert.ok(anonKey && serviceKey, 'STAGING_KEYS_REQUIRED');

const service = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const createdUsers = [];
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const email = label => `codex-v3-${label}-${randomBytes(8).toString('hex')}@example.com`;
const password = () => `T3st!${randomBytes(16).toString('hex')}`;

async function createSignedInUser(label) {
  const address = email(label); const secret = password();
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: address, password: secret, email_confirm: true,
    user_metadata: { purpose: 'user-centric-staging-verification' },
  });
  if (createError) throw createError;
  createdUsers.push(created.user.id);
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email: address, password: secret });
  if (signInError) throw signInError;
  return { id: created.user.id, client };
}

try {
  const owner = await createSignedInUser('owner');
  const legacy = await createSignedInUser('legacy');
  const demo = await createSignedInUser('demo');

  const { error: anonError } = await anon.from('applicant_profiles_v3').select('user_id').limit(1);
  ok(Boolean(anonError), 'anon cannot read V3 profiles');

  const empty = createEmptyApplicantProfileV3();
  const { data: first, error: firstError } = await owner.client.rpc('save_applicant_profile_v3', {
    p_expected_revision: 0, p_profile: empty, p_completed_at: null, p_consent_version: 'test-v1',
  });
  if (firstError) throw firstError;
  ok(first.revision === 1 && first.profile.revision === 1, 'owner creates revision 1');

  const { error: staleError } = await owner.client.rpc('save_applicant_profile_v3', {
    p_expected_revision: 0, p_profile: empty, p_completed_at: null, p_consent_version: 'test-v1',
  });
  ok(staleError?.message?.includes('PROFILE_V3_REVISION_CONFLICT'), 'stale expected revision is rejected');

  const { data: crossRead, error: crossError } = await legacy.client
    .from('applicant_profiles_v3').select('user_id').eq('user_id', owner.id);
  if (crossError) throw crossError;
  ok(crossRead.length === 0, 'owner RLS hides another user profile');
  const { error: directWriteError } = await owner.client
    .from('applicant_profiles_v3').update({ revision: 99 }).eq('user_id', owner.id);
  ok(Boolean(directWriteError), 'direct profile update is denied');

  const legacyProfile = createApplicantProfileFromLegacy({
    name: '스테이징 이관', age: 33, occupation: 'worker', region: '검증지역',
    hasSubscriptionAccount: true, accountMonths: 24, monthlyPayment: 100000,
    isNoHomeOwner: true,
  });
  legacyProfile.family.marriageYears = knownField(2);
  legacyProfile.income.annualRange = knownField('30m-50m');
  const sourceUpdatedAt = '2026-10-01T00:00:00.000Z';
  const { error: legacyInsertError } = await service.from('user_profiles').insert({
    user_id: legacy.id, schema_version: 2, profile_json: legacyProfile, updated_at: sourceUpdatedAt,
  });
  if (legacyInsertError) throw legacyInsertError;
  const migrated = migrateApplicantProfileV2ToV3(legacyProfile, {
    source: 'PERSISTED_USER', observedAt: sourceUpdatedAt,
  });
  const fingerprint = createHash('sha256').update(JSON.stringify(legacyProfile)).digest('hex');
  const { data: backfill, error: backfillError } = await service.rpc('backfill_applicant_profile_v3', {
    p_user_id: legacy.id, p_profile: migrated, p_source_updated_at: sourceUpdatedAt,
    p_source_fingerprint: fingerprint, p_migration_version: 'staging-verification-v1',
  });
  if (backfillError) throw backfillError;
  ok(backfill.status === 'MIGRATED', 'reviewed V2 fixture backfills');
  const { data: migratedRow, error: migratedError } = await service.from('applicant_profiles_v3')
    .select('profile_json,provenance').eq('user_id', legacy.id).single();
  if (migratedError) throw migratedError;
  ok(migratedRow.profile_json.subscriptionAccount.openedAt.state === 'UNKNOWN', 'account months do not invent opened date');
  ok(migratedRow.profile_json.family.marriageDate.state === 'UNKNOWN', 'marriage years do not invent marriage date');
  ok(migratedRow.profile_json.income.monthlyApplicantIncome.state === 'UNKNOWN', 'income band does not invent amount');
  ok(migratedRow.provenance.kind === 'V2_BACKFILL', 'backfill provenance is retained');

  const demoProfile = createApplicantProfileFromLegacy({
    name: '지민', age: 22, occupation: 'student', region: '서울특별시',
    hasSubscriptionAccount: true, accountMonths: 14, monthlyPayment: 100000,
    isNoHomeOwner: true,
  });
  const { error: demoInsertError } = await service.from('user_profiles').insert({
    user_id: demo.id, schema_version: 2, profile_json: demoProfile,
  });
  if (demoInsertError) throw demoInsertError;
  const { data: demoV3, error: demoReadError } = await service.from('applicant_profiles_v3')
    .select('user_id').eq('user_id', demo.id);
  if (demoReadError) throw demoReadError;
  ok(demoV3.length === 0, 'demo seed is not automatically promoted to V3');

  const { data: activeSet, error: activeSetError } = await service
    .from('assessment_rule_sets')
    .select('id,announcement_id,document_id,version,source_status')
    .eq('is_active', true).eq('is_public', true).not('approved_at', 'is', null).limit(1).single();
  if (activeSetError) throw activeSetError;
  const { data: binding, error: bindingError } = await service
    .from('announcement_listing_bindings').select('listing_id')
    .eq('announcement_id', activeSet.announcement_id).limit(1).maybeSingle();
  if (bindingError) throw bindingError;
  const listingId = binding?.listing_id ?? `announcement:${activeSet.announcement_id}`;
  let activeDocumentHash = null;
  if (activeSet.document_id) {
    const { data: document, error: documentError } = await service.from('announcement_documents')
      .select('sha256').eq('id', activeSet.document_id).single();
    if (documentError) throw documentError;
    activeDocumentHash = document.sha256;
  }
  const resultId = randomUUID();
  const result = {
    id: resultId, userId: owner.id, announcementId: activeSet.announcement_id,
    listingId, supplyType: 'youth',
    ruleSetId: activeSet.id, ruleSetVersion: activeSet.version, sourceStatus: activeSet.source_status,
    sourceDocumentId: activeSet.document_id, sourceDocumentHash: activeDocumentHash, profileRevision: 1,
    engineVersion: 'staging-verification-v1', inputHash: createHash('sha256').update(resultId).digest('hex'),
    portfolioStatus: 'UNAVAILABLE', eligibilityStatus: null, scoringStatus: 'UNAVAILABLE',
    stage: null, score: null, missingUserFields: [], missingAnnouncementFields: ['ruleSet'],
    blockers: [], warnings: ['verification'], evidence: [], engineResult: null,
    calculatedAt: new Date().toISOString(), stale: { isStale: false },
  };
  const { error: forgedResultError } = await owner.client.rpc('save_user_assessment_result', { p_result: result });
  ok(Boolean(forgedResultError), 'authenticated client cannot submit calculated result');
  const { data: savedResult, error: saveResultError } = await service.rpc('save_user_assessment_result_server', {
    p_user_id: owner.id, p_result: result,
  });
  if (saveResultError) throw saveResultError;
  ok(savedResult.id === resultId && savedResult.user_id === owner.id, 'assessment result saves with owner and provenance');
  const { data: hiddenResults, error: hiddenError } = await legacy.client
    .from('user_assessment_results').select('id').eq('id', resultId);
  if (hiddenError) throw hiddenError;
  ok(hiddenResults.length === 0, 'result RLS hides another user result');

  const { data: second, error: secondError } = await owner.client.rpc('save_applicant_profile_v3', {
    p_expected_revision: 1, p_profile: { ...empty, revision: 1 },
    p_completed_at: null, p_consent_version: 'test-v1',
  });
  if (secondError) throw secondError;
  ok(second.revision === 2, 'matching revision update succeeds');
  const { data: staleResult, error: staleResultError } = await owner.client
    .from('user_assessment_results').select('stale_at,stale_reason').eq('id', resultId).single();
  if (staleResultError) throw staleResultError;
  ok(staleResult.stale_reason === 'PROFILE_CHANGED' && Boolean(staleResult.stale_at), 'profile change marks result stale');

  const { data: legacyStillThere, error: legacyStillThereError } = await service
    .from('user_profiles').select('user_id').eq('user_id', legacy.id).single();
  if (legacyStillThereError) throw legacyStillThereError;
  ok(legacyStillThere.user_id === legacy.id, 'V2 row remains after additive backfill');

  console.log(JSON.stringify({ projectRef: actualRef, checks, status: 'PASS' }, null, 2));
} finally {
  for (const userId of createdUsers.reverse()) {
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error) console.error(`STAGING_CLEANUP_FAILED:${userId}`);
  }
}
