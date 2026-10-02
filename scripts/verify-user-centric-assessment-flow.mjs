// Explicit Staging-only end-to-end verification. No Production target is accepted.
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
const actualRef = (() => { try { return new URL(url).hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1] ?? null; } catch { return null; } })();
assert.equal(environment, 'staging', 'STAGING_ENV_REQUIRED');
assert.ok(actualRef && actualRef === stagingRef, 'STAGING_PROJECT_REF_MISMATCH');
assert.ok(productionRef && actualRef !== productionRef, 'PRODUCTION_PROJECT_FORBIDDEN');
assert.ok(anonKey && serviceKey, 'STAGING_KEYS_REQUIRED');

const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const createdUsers = [];
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const email = `codex-v3-flow-${randomBytes(8).toString('hex')}@example.com`;
const password = `T3st!${randomBytes(16).toString('hex')}`;

try {
  const { data: sets, error: setError } = await service.from('assessment_rule_sets')
    .select('id,announcement_id,config').eq('is_active', true).eq('is_public', true)
    .not('approved_at', 'is', null).limit(10);
  if (setError) throw setError;
  const active = sets?.find(row => Array.isArray(row.config?.supplies) && row.config.supplies.length > 0);
  assert.ok(active, 'STAGING_ACTIVE_PUBLIC_RULE_SET_REQUIRED');
  const { data: announcement, error: announcementError } = await service.from('announcements')
    .select('region_name').eq('id', active.announcement_id).single();
  if (announcementError) throw announcementError;
  assert.ok(announcement?.region_name, 'STAGING_ANNOUNCEMENT_REGION_REQUIRED');
  const { data: binding, error: bindingError } = await service.from('announcement_listing_bindings')
    .select('listing_id').eq('announcement_id', active.announcement_id).limit(1).maybeSingle();
  if (bindingError) throw bindingError;
  const listingId = binding?.listing_id ?? `announcement:${active.announcement_id}`;
  const supplyType = active.config.supplies[0].type;

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { purpose: 'user-centric-flow-verification' },
  });
  if (createError) throw createError;
  createdUsers.push(created.user.id);
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  const profile = createEmptyApplicantProfileV3();
  profile.identity.birthDate = knownProfileFact({ value: '1995-05-01', precision: 'DAY' }, { source: 'USER' });
  profile.residence.currentRegion = knownProfileFact(announcement.region_name, { source: 'USER' });
  const { data: firstProfile, error: profileError } = await client.rpc('save_applicant_profile_v3', {
    p_expected_revision: 0, p_profile: profile, p_completed_at: null, p_consent_version: 'staging-e2e-v1',
  });
  if (profileError) throw profileError;
  ok(firstProfile.revision === 1, 'first V3 profile save creates revision 1');

  await client.auth.signOut({ scope: 'local' });
  const { error: signInAgainError } = await client.auth.signInWithPassword({ email, password });
  if (signInAgainError) throw signInAgainError;
  const { data: restored, error: restoredError } = await client.from('applicant_profiles_v3')
    .select('revision,profile_json').eq('user_id', created.user.id).single();
  if (restoredError) throw restoredError;
  ok(restored.revision === 1 && restored.profile_json.identity.birthDate.state === 'KNOWN', 'profile restores after a new session');

  const request = { listingId, supplyType, announcementDetails: {} };
  const { data: firstRun, error: firstRunError } = await client.functions.invoke('user-assessment', { body: request });
  if (firstRunError) throw firstRunError;
  ok(firstRun?.reused === false && firstRun?.result?.profileRevision === 1, 'server executes and persists deterministic assessment');
  const { data: stored, error: storedError } = await client.from('user_assessment_results')
    .select('id,profile_revision,stale_at,superseded_at').eq('listing_id', listingId).eq('supply_type', supplyType);
  if (storedError) throw storedError;
  ok(stored.length === 1 && stored[0].profile_revision === 1, 'owner reads persisted result');

  const { error: forgedError } = await client.rpc('save_user_assessment_result', { p_result: firstRun.result });
  ok(Boolean(forgedError), 'client-composed result cannot be persisted');
  const { data: reused, error: reusedError } = await client.functions.invoke('user-assessment', { body: request });
  if (reusedError) throw reusedError;
  ok(reused?.reused === true && reused?.result?.id === firstRun.result.id, 'fresh stored result is reused');

  const changed = {
    ...firstProfile.profile,
    identity: {
      ...firstProfile.profile.identity,
      displayName: knownProfileFact('staging-revision-2', { source: 'USER' }),
    },
  };
  const { data: secondProfile, error: secondProfileError } = await client.rpc('save_applicant_profile_v3', {
    p_expected_revision: 1, p_profile: changed, p_completed_at: null, p_consent_version: 'staging-e2e-v1',
  });
  if (secondProfileError) throw secondProfileError;
  ok(secondProfile.revision === 2, 'profile update increments revision');
  const { data: stale, error: staleError } = await client.from('user_assessment_results')
    .select('stale_reason').eq('id', firstRun.result.id).single();
  if (staleError) throw staleError;
  ok(stale.stale_reason === 'PROFILE_CHANGED', 'previous result becomes stale after profile update');

  const { data: recalculated, error: recalcError } = await client.functions.invoke('user-assessment', { body: request });
  if (recalcError) throw recalcError;
  ok(recalculated?.reused === false && recalculated?.result?.profileRevision === 2, 'stale result is recalculated and saved');
  const { data: currentRows, error: currentRowsError } = await service.from('user_assessment_results')
    .select('id,profile_revision,superseded_at').eq('user_id', created.user.id).eq('listing_id', listingId);
  if (currentRowsError) throw currentRowsError;
  ok(currentRows.filter(row => row.superseded_at === null).length === 1, 'only one non-superseded result remains');

  console.log(JSON.stringify({ projectRef: actualRef, listingId, supplyType, checks, status: 'PASS' }, null, 2));
} finally {
  for (const userId of createdUsers.reverse()) {
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error) console.error(`STAGING_CLEANUP_FAILED:${userId}`);
  }
}
