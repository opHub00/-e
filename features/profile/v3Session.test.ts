import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyApplicantProfileV3 } from './v3.ts';
import {
  saveReusableAssessmentDetailsToV3,
  startApplicantProfileV3Session,
  stopApplicantProfileV3Session,
  useApplicantProfileV3Store,
} from './useApplicantProfileV3Store.ts';
import {
  ApplicantProfileV3RepositoryError,
  type ApplicantProfileV3Record,
  type ApplicantProfileV3Repository,
} from './v3Repository.ts';

const now = '2026-10-01T00:00:00.000Z';
const record = (userId: string): ApplicantProfileV3Record => ({
  userId, schemaVersion: 3, revision: 1,
  profile: { ...createEmptyApplicantProfileV3(), revision: 1 },
  provenance: {}, consentVersion: null, completedAt: null, createdAt: now, updatedAt: now,
});
const v2 = { readProfile: async () => null };
const decodeV2 = () => null;

test('late profile load from the previous account cannot replace the new actor', async () => {
  stopApplicantProfileV3Session();
  let release!: (value: ApplicantProfileV3Record) => void;
  const slow: ApplicantProfileV3Repository = {
    read: () => new Promise(resolve => { release = resolve; }),
    update: async () => { throw new Error('unused'); },
  };
  const fast: ApplicantProfileV3Repository = {
    read: async userId => record(userId), update: async () => { throw new Error('unused'); },
  };
  const first = startApplicantProfileV3Session({ userId: 'user-a', repository: slow, v2, decodeV2 });
  await startApplicantProfileV3Session({ userId: 'user-b', repository: fast, v2, decodeV2 });
  release(record('user-a'));
  await first;
  assert.equal(useApplicantProfileV3Store.getState().userId, 'user-b');
  assert.equal(useApplicantProfileV3Store.getState().record?.userId, 'user-b');
  stopApplicantProfileV3Session();
  assert.equal(useApplicantProfileV3Store.getState().profile, null);
});

test('revision conflict preserves the local edit and exposes the latest server record', async () => {
  stopApplicantProfileV3Session();
  const first = record('user-a');
  const latest = { ...record('user-a'), revision: 2, profile: { ...first.profile, revision: 2 } };
  const repository: ApplicantProfileV3Repository = {
    read: async () => first,
    update: async () => {
      repository.read = async () => latest;
      throw new ApplicantProfileV3RepositoryError(
        'PROFILE_V3_REVISION_CONFLICT',
        '다른 기기에서 먼저 변경됐습니다.',
      );
    },
  };
  await startApplicantProfileV3Session({ userId: 'user-a', repository, v2, decodeV2 });
  await assert.rejects(
    saveReusableAssessmentDetailsToV3({ recognizedPaymentCount: 24 }, now),
    (error: unknown) => error instanceof ApplicantProfileV3RepositoryError
      && error.code === 'PROFILE_V3_REVISION_CONFLICT',
  );
  const state = useApplicantProfileV3Store.getState();
  assert.equal(state.status, 'conflict');
  assert.equal(state.record?.revision, 2);
  assert.equal(state.conflict?.local.subscriptionAccount.recognizedPaymentCount.state, 'KNOWN');
  assert.equal(state.conflict?.server?.revision, 2);
  stopApplicantProfileV3Session();
});
