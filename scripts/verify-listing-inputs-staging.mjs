// Explicit remote Staging verification. Creates disposable auth users and
// deletes them (and their cascading listing inputs) in finally.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createEmptyApplicantProfileV3 } from '../features/profile/v3.ts';

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

async function createActor(label) {
  const email = `listing-input-${label}-${randomBytes(8).toString('hex')}@example.invalid`;
  const password = `T3st!${randomBytes(16).toString('hex')}`;
  const { data, error } = await service.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { purpose: 'listing-input-staging-verification' },
  });
  if (error) throw error;
  createdUsers.push(data.user.id);
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, email, password, client };
}

function includesCode(error, code) {
  return [error?.message, error?.details, error?.hint].filter(Boolean).join(' ').includes(code);
}

try {
  const owner = await createActor('owner');
  const other = await createActor('other');
  const { error: profileError } = await owner.client.rpc('save_applicant_profile_v3', {
    p_expected_revision: 0,
    p_profile: createEmptyApplicantProfileV3(),
    p_completed_at: null,
    p_consent_version: 'listing-input-verification-v1',
  });
  if (profileError) throw profileError;

  const { data: ruleSet, error: ruleSetError } = await service.from('assessment_rule_sets')
    .select('id,announcement_id,document_id,version,config')
    .eq('is_active', true).eq('is_public', true).not('approved_at', 'is', null)
    .limit(1).single();
  if (ruleSetError) throw ruleSetError;
  const supplies = Array.isArray(ruleSet.config?.supplies)
    ? ruleSet.config.supplies.map(item => item?.type).filter(Boolean)
    : [];
  assert.ok(supplies.length > 0, 'STAGING_ACTIVE_RULE_SET_HAS_NO_SUPPLY');
  const supplyType = supplies[0];
  const { data: binding, error: bindingError } = await service.from('announcement_listing_bindings')
    .select('listing_id').eq('announcement_id', ruleSet.announcement_id).limit(1).maybeSingle();
  if (bindingError) throw bindingError;
  const listingId = binding?.listing_id ?? `announcement:${ruleSet.announcement_id}`;

  const { error: anonReadError } = await anon.from('user_listing_assessment_inputs').select('id').limit(1);
  ok(Boolean(anonReadError), 'anon cannot read listing-scoped answers');

  const firstPayload = {
    p_listing_id: listingId,
    p_supply_type: supplyType,
    p_rule_set_id: ruleSet.id,
    p_expected_revision: 0,
    p_schema_version: 1,
    p_answers: { exceptions: 'no', incomeHouseholdSize: '3' },
  };
  const { data: first, error: firstError } = await owner.client.rpc('save_user_listing_assessment_input', firstPayload);
  if (firstError) throw firstError;
  ok(first.revision === 1 && first.userId === owner.id, 'owner creates revision 1');
  ok(first.compatibility === 'CURRENT', 'new answer is current');

  const { data: firstAssessment, error: firstAssessmentError } = await owner.client.functions.invoke('user-assessment', {
    body: { listingId, supplyType, announcementDetails: { recognizedPaymentCount: 999 } },
  });
  if (firstAssessmentError) throw firstAssessmentError;
  ok(!firstAssessment.result.missingUserFields.includes('input:exceptionsClear'),
    'trusted assessment reuses the saved listing answer');
  ok(firstAssessment.result.missingUserFields.includes('input:recognizedPaymentCount'),
    'trusted assessment ignores an unpersisted client fact');
  const { data: repeatedAssessment, error: repeatedAssessmentError } = await owner.client.functions.invoke('user-assessment', {
    body: { listingId, supplyType, announcementDetails: {} },
  });
  if (repeatedAssessmentError) throw repeatedAssessmentError;
  ok(repeatedAssessment.reused === true, 'unchanged revisit reuses the trusted result');

  const { data: restored, error: restoreError } = await owner.client.rpc('read_user_listing_assessment_input', {
    p_listing_id: listingId, p_supply_type: supplyType, p_rule_set_id: ruleSet.id,
  });
  if (restoreError) throw restoreError;
  ok(restored.answers.exceptions === 'no' && restored.revision === 1, 'same actor restores saved answers');

  const { error: staleError } = await owner.client.rpc('save_user_listing_assessment_input', firstPayload);
  ok(includesCode(staleError, 'LISTING_INPUT_REVISION_CONFLICT'), 'stale revision is rejected');

  const { error: derivedError } = await owner.client.rpc('save_user_listing_assessment_input', {
    ...firstPayload, p_expected_revision: 1, p_answers: { exceptionsClear: 'true' },
  });
  ok(includesCode(derivedError, 'LISTING_INPUT_INVALID_PAYLOAD'), 'derived facts cannot be persisted');

  const { error: directWriteError } = await owner.client.from('user_listing_assessment_inputs')
    .update({ revision: 99 }).eq('user_id', owner.id);
  ok(Boolean(directWriteError), 'authenticated users cannot bypass the RPC write path');

  const { data: hidden, error: hiddenError } = await other.client.from('user_listing_assessment_inputs')
    .select('id').eq('user_id', owner.id);
  if (hiddenError) throw hiddenError;
  ok(hidden.length === 0, 'owner RLS hides answers from another actor');
  const { data: otherRead, error: otherReadError } = await other.client.rpc('read_user_listing_assessment_input', {
    p_listing_id: listingId, p_supply_type: supplyType, p_rule_set_id: ruleSet.id,
  });
  if (otherReadError) throw otherReadError;
  ok(otherRead === null, 'another actor cannot restore owner answers');

  const { error: listingIsolationError } = await owner.client.rpc('read_user_listing_assessment_input', {
    p_listing_id: `${listingId}-other`, p_supply_type: supplyType, p_rule_set_id: ruleSet.id,
  });
  ok(includesCode(listingIsolationError, 'LISTING_INPUT_RULE_SET_MISMATCH'), 'answers cannot cross listing scope');

  const otherSupply = supplies.find(value => value !== supplyType);
  if (otherSupply) {
    const { data: otherSupplyRead, error: otherSupplyError } = await owner.client.rpc('read_user_listing_assessment_input', {
      p_listing_id: listingId, p_supply_type: otherSupply, p_rule_set_id: ruleSet.id,
    });
    if (otherSupplyError) throw otherSupplyError;
    ok(otherSupplyRead === null, 'answers cannot cross supply type scope');
  } else {
    const { error: supplyIsolationError } = await owner.client.rpc('read_user_listing_assessment_input', {
      p_listing_id: listingId, p_supply_type: supplyType === 'youth' ? 'newlywed' : 'youth', p_rule_set_id: ruleSet.id,
    });
    ok(includesCode(supplyIsolationError, 'LISTING_INPUT_RULE_SET_MISMATCH'), 'unsupported supply cannot reuse answers');
  }

  await owner.client.auth.signOut();
  const reloaded = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: resignError } = await reloaded.auth.signInWithPassword({ email: owner.email, password: owner.password });
  if (resignError) throw resignError;
  const { data: afterRelogin, error: afterReloginError } = await reloaded.rpc('read_user_listing_assessment_input', {
    p_listing_id: listingId, p_supply_type: supplyType, p_rule_set_id: ruleSet.id,
  });
  if (afterReloginError) throw afterReloginError;
  ok(afterRelogin.revision === 1 && afterRelogin.answers.exceptions === 'no', 'relogin restores server-confirmed answers');

  const { data: second, error: secondError } = await reloaded.rpc('save_user_listing_assessment_input', {
    ...firstPayload, p_expected_revision: 1,
    p_answers: { exceptions: 'yes', incomeHouseholdSize: '3' },
  });
  if (secondError) throw secondError;
  ok(second.revision === 2 && second.answers.exceptions === 'yes', 'matching revision updates atomically');
  const { data: changedAssessment, error: changedAssessmentError } = await reloaded.functions.invoke('user-assessment', {
    body: { listingId, supplyType, announcementDetails: {} },
  });
  if (changedAssessmentError) throw changedAssessmentError;
  ok(changedAssessment.reused === false, 'changed listing input invalidates and recalculates the trusted result');

  console.log(JSON.stringify({ projectRef: actualRef, checks, listingId, supplyType, status: 'PASS' }, null, 2));
} finally {
  for (const userId of createdUsers.reverse()) {
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error) console.error(`STAGING_CLEANUP_FAILED:${userId}`);
  }
}
