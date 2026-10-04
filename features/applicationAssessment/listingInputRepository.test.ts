import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSupabaseListingAssessmentInputRepository,
  InMemoryListingAssessmentInputRepository,
  ListingInputRepositoryError,
} from './listingInputRepository.ts';

const userId = '11111111-1111-4111-8111-111111111111';
const reference = {
  userId, listingId: 'listing-x', announcementId: '22222222-2222-4222-8222-222222222222',
  supplyType: 'youth' as const, ruleSetId: '33333333-3333-4333-8333-333333333333',
  ruleSetVersion: '1.0.0', sourceDocumentId: null,
};

test('in-memory repository isolates listing and supply and enforces revisions', async () => {
  const repository = new InMemoryListingAssessmentInputRepository();
  const saved = await repository.save({
    ...reference, expectedRevision: 0,
    answers: { exceptions: 'no', birthDate: '1990-01-01' },
  });
  assert.equal(saved.revision, 1);
  assert.deepEqual(saved.answers, { exceptions: 'no' });
  assert.equal((await repository.read(reference))?.answers.exceptions, 'no');
  assert.equal(await repository.read({ ...reference, listingId: 'listing-y' }), null);
  assert.equal(await repository.read({ ...reference, supplyType: 'newlywed' }), null);
  assert.equal(await repository.read({ ...reference, userId: 'user-b' }), null);
  await assert.rejects(
    () => repository.save({ ...reference, expectedRevision: 0, answers: { exceptions: 'yes' } }),
    (error: unknown) => error instanceof ListingInputRepositoryError
      && error.code === 'LISTING_INPUT_REVISION_CONFLICT',
  );
});

test('Supabase repository sends only listing-scoped keys and adopts server snapshot', async () => {
  const calls: unknown[] = [];
  const client = { rpc: async (name: string, args: unknown) => {
    calls.push({ name, args });
    return { data: {
      ...reference, schemaVersion: 1, revision: 1, answers: { exceptions: 'no' },
      compatibility: 'CURRENT', staleAt: null, staleReason: null,
      sourceDocumentHash: null, createdAt: '2026-10-05T00:00:00Z', updatedAt: '2026-10-05T00:00:00Z',
    }, error: null };
  } } as never;
  const result = await createSupabaseListingAssessmentInputRepository(client).save({
    ...reference, expectedRevision: 0,
    answers: { exceptions: 'no', birthDate: '1990-01-01' },
  });
  assert.deepEqual(result.answers, { exceptions: 'no' });
  assert.deepEqual(calls, [{ name: 'save_user_listing_assessment_input', args: {
    p_listing_id: 'listing-x', p_supply_type: 'youth',
    p_rule_set_id: reference.ruleSetId, p_expected_revision: 0,
    p_schema_version: 1, p_answers: { exceptions: 'no' },
  } }]);
});

test('database conflict remains a stable repository error', async () => {
  const client = { rpc: async () => ({ data: null, error: { message: 'LISTING_INPUT_REVISION_CONFLICT' } }) } as never;
  await assert.rejects(
    () => createSupabaseListingAssessmentInputRepository(client).save({
      ...reference, expectedRevision: 1, answers: { exceptions: 'no' },
    }),
    (error: unknown) => error instanceof ListingInputRepositoryError
      && error.code === 'LISTING_INPUT_REVISION_CONFLICT',
  );
});
