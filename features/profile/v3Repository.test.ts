import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplicantProfileFromLegacy } from './domain.ts';
import { createEmptyApplicantProfileV3 } from './v3.ts';
import {
  ApplicantProfileV3RepositoryError,
  createSupabaseApplicantProfileV3Repository,
  readApplicantProfileWithV2Fallback,
  type ApplicantProfileV3Repository,
} from './v3Repository.ts';

const userId = '11111111-1111-4111-8111-111111111111';
const now = '2026-10-01T00:00:00.000Z';

test('profile update sends expected revision and adopts the server revision', async () => {
  const calls: unknown[] = [];
  const profile = createEmptyApplicantProfileV3();
  const client = {
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { data: {
        userId, schemaVersion: 3, revision: 1, profile: { ...profile, revision: 1 },
        provenance: { kind: 'USER_AUTHORED' }, consentVersion: null, completedAt: null,
        createdAt: now, updatedAt: now,
      }, error: null };
    },
  } as never;
  const saved = await createSupabaseApplicantProfileV3Repository(client).update({
    expectedRevision: 0, profile,
  });
  assert.equal(saved.revision, 1);
  assert.equal(saved.profile.revision, 1);
  assert.deepEqual(calls, [{ name: 'save_applicant_profile_v3', args: {
    p_expected_revision: 0, p_profile: profile, p_completed_at: null, p_consent_version: null,
  } }]);
});

test('postgres revision conflict remains a stable repository error', async () => {
  const client = { rpc: async () => ({
    data: null, error: { message: 'PROFILE_V3_REVISION_CONFLICT', details: '{"actualRevision":3}' },
  }) } as never;
  await assert.rejects(
    () => createSupabaseApplicantProfileV3Repository(client).update({
      expectedRevision: 2, profile: createEmptyApplicantProfileV3(),
    }),
    (error: unknown) => error instanceof ApplicantProfileV3RepositoryError &&
      error.code === 'PROFILE_V3_REVISION_CONFLICT',
  );
});

test('V2 fallback is read-only and preserves unknown values', async () => {
  const v2 = createApplicantProfileFromLegacy({
    name: '테스트', age: 31, occupation: 'worker', region: '제주특별자치도',
    hasSubscriptionAccount: true, accountMonths: 24, monthlyPayment: 100_000,
    isNoHomeOwner: true,
  });
  const v3: ApplicantProfileV3Repository = {
    read: async () => null,
    update: async () => { throw new Error('must not write'); },
  };
  const result = await readApplicantProfileWithV2Fallback({
    userId, v3,
    v2: { readProfile: async () => ({ profileJson: v2, schemaVersion: 2, updatedAt: now }) },
    decodeV2: value => value === v2 ? v2 : null,
  });
  assert.equal(result.source, 'V2_FALLBACK');
  if (result.source !== 'V2_FALLBACK') return;
  assert.equal(result.profile.subscriptionAccount.openedAt.state, 'UNKNOWN');
  assert.equal(result.profile.family.marriageDate.state, 'UNKNOWN');
  assert.equal(result.profile.income.monthlyApplicantIncome.state, 'UNKNOWN');
});
