// Explicit remote Staging verification. Disposable users are deleted in finally.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createEmptyApplicantProfileV3, knownProfileFact } from '../features/profile/v3.ts';

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
const createdUsers = [];
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };

async function createActor(label) {
  const email = `portfolio-${label}-${randomBytes(8).toString('hex')}@example.invalid`;
  const password = `T3st!${randomBytes(16).toString('hex')}`;
  const { data, error } = await service.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { purpose: 'portfolio-staging-verification' },
  });
  if (error) throw error;
  createdUsers.push(data.user.id);
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  const profile = createEmptyApplicantProfileV3();
  const { error: profileError } = await client.rpc('save_applicant_profile_v3', {
    p_expected_revision: 0, p_profile: profile, p_completed_at: null, p_consent_version: 'portfolio-e2e-v1',
  });
  if (profileError) throw profileError;
  return { id: data.user.id, client, profile };
}

async function portfolio(client, action) {
  const { data, error } = await client.functions.invoke('user-assessment-portfolio', { body: { action } });
  if (error) throw error;
  return data;
}

try {
  const owner = await createActor('owner');
  const other = await createActor('other');

  const initial = await portfolio(owner.client, 'get');
  ok(initial.userId === owner.id, 'portfolio belongs to the authenticated actor');
  ok(initial.items.length > 0 && initial.items.length <= 8, 'candidate batch is non-empty and bounded');
  ok(initial.items.every(item => item.provenance.resultId === null), 'initial get does not calculate missing results');

  const first = await portfolio(owner.client, 'refresh');
  ok(first.refresh.considered === first.portfolio.items.length, 'refresh accounts for every selected candidate');
  ok(first.refresh.recalculated > 0, 'first refresh calculates missing results');
  ok(first.portfolio.items.some(item => item.provenance.resultId), 'calculated results have server provenance');
  ok(first.refresh.failed < first.refresh.considered, 'one item failure cannot erase the whole batch');

  const second = await portfolio(owner.client, 'refresh');
  ok(second.refresh.recalculated === 0, 'fresh results are not recalculated');
  ok(second.refresh.reused === second.refresh.considered, 'all fresh selected results are reused');

  const changed = structuredClone(owner.profile);
  changed.identity.displayName = knownProfileFact('포트폴리오 검증 사용자', {
    source: 'USER', observedAt: '2026-10-02T00:00:00.000Z',
  });
  const { data: saved, error: updateError } = await owner.client.rpc('save_applicant_profile_v3', {
    p_expected_revision: 1, p_profile: changed, p_completed_at: null, p_consent_version: 'portfolio-e2e-v1',
  });
  if (updateError) throw updateError;
  ok(saved.revision === 2, 'profile update advances revision');

  const stale = await portfolio(owner.client, 'get');
  ok(stale.freshness.stale > 0, 'profile revision change is visible as stale portfolio results');
  ok(stale.items.some(item => item.freshness === 'STALE_PROFILE'), 'stale reason identifies profile change');

  const recalculated = await portfolio(owner.client, 'refresh');
  ok(recalculated.refresh.recalculated > 0, 'stale results are recalculated');
  ok(recalculated.portfolio.profileRevision === 2, 'new results use the latest profile revision');
  ok(recalculated.portfolio.freshness.stale === 0, 'successful refresh returns fresh selected results');

  const isolated = await portfolio(other.client, 'get');
  ok(isolated.userId === other.id, 'second actor receives its own portfolio');
  ok(isolated.items.every(item => item.provenance.resultId === null), 'second actor cannot see first actor result ids');

  console.log(JSON.stringify({ projectRef: actualRef, checks, selected: first.portfolio.items.length,
    firstRefresh: first.refresh, secondRefresh: second.refresh, staleRefresh: recalculated.refresh, status: 'PASS' }, null, 2));
} finally {
  for (const userId of createdUsers.reverse()) {
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error) console.error(`STAGING_CLEANUP_FAILED:${userId}`);
  }
}
