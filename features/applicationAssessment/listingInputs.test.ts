import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyQuestionnaireAnswer,
  assessmentDetailsFromListingAnswers,
  listingInputCompatibility,
  listingInputDraftScope,
  mergeSavedAnswersWithDraft,
  reusableListingAnswers,
  selectListingScopedAnswers,
  type ListingAssessmentInputRecord,
  type ListingInputReference,
} from './listingInputs.ts';

const current: ListingInputReference = {
  listingId: 'listing-x', announcementId: 'announcement-x', supplyType: 'newlywed',
  ruleSetId: 'rule-set-1', ruleSetVersion: '1.0.0', sourceDocumentId: 'document-1',
  sourceDocumentHash: 'a'.repeat(64),
};

const record = (overrides: Partial<ListingAssessmentInputRecord> = {}): ListingAssessmentInputRecord => ({
  ...current, userId: 'user-a', schemaVersion: 1, revision: 1,
  answers: { exceptions: 'no', plannedMarriageWithinDeadline: 'yes' },
  compatibility: 'CURRENT', staleAt: null, staleReason: null,
  createdAt: '2026-10-05T00:00:00Z', updatedAt: '2026-10-05T00:00:00Z',
  ...overrides,
});

test('long-term, listing-scoped and derived facts stay in separate stores', () => {
  assert.equal(classifyQuestionnaireAnswer('birthDate'), 'LONG_TERM_PROFILE');
  assert.equal(classifyQuestionnaireAnswer('exceptions'), 'LISTING_SCOPED');
  assert.equal(classifyQuestionnaireAnswer('exceptionsClear'), 'DERIVED_OR_UNKNOWN');
  assert.equal(classifyQuestionnaireAnswer('childbirthClear'), 'DERIVED_OR_UNKNOWN');
  assert.deepEqual(selectListingScopedAnswers({
    birthDate: '1990-01-01', exceptions: 'no', exceptionsClear: 'true',
    youthPriorityTarget: 'yes', score: '9',
  }), { exceptions: 'no', youthPriorityTarget: 'yes' });
  assert.deepEqual(assessmentDetailsFromListingAnswers({
    exceptions: 'no', incomeHouseholdSize: '3', birthDate: '1990-01-01',
  }, 'newlywed'), { incomeHouseholdSize: 3, specialExceptions: [] });
});

test('a valid answer is reused only for the same exact rule and document reference', () => {
  assert.deepEqual(reusableListingAnswers(record(), current), {
    answers: { exceptions: 'no', plannedMarriageWithinDeadline: 'yes' },
    stale: false, reason: 'CURRENT',
  });
  assert.deepEqual(reusableListingAnswers(record(), { ...current, ruleSetVersion: '2.0.0' }), {
    answers: {}, stale: true, reason: 'STALE_RULE_SET',
  });
  assert.deepEqual(reusableListingAnswers(record(), { ...current, sourceDocumentHash: 'b'.repeat(64) }), {
    answers: {}, stale: true, reason: 'STALE_DOCUMENT',
  });
});

test('unfinished local draft overrides the server snapshot without becoming server truth', () => {
  const merged = mergeSavedAnswersWithDraft(
    { exceptions: 'no', plannedMarriageWithinDeadline: 'yes' },
    { exceptions: 'yes' },
  );
  assert.deepEqual(merged, { exceptions: 'yes', plannedMarriageWithinDeadline: 'yes' });
});

test('server-declared document staleness cannot be upgraded by a client without the hash', () => {
  const stale = record({
    compatibility: 'STALE_DOCUMENT',
    staleAt: '2026-10-05T00:00:00.000Z',
    staleReason: 'STALE_DOCUMENT',
  });
  const currentWithoutHash = { ...current, sourceDocumentHash: undefined };
  assert.equal(listingInputCompatibility(stale, currentWithoutHash), 'STALE_DOCUMENT');
  assert.deepEqual(reusableListingAnswers(stale, currentWithoutHash), {
    answers: {}, stale: true, reason: 'STALE_DOCUMENT',
  });
});

test('no saved record leaves first-visit answers empty', () => {
  assert.deepEqual(reusableListingAnswers(null, current), {
    answers: {}, stale: false, reason: null,
  });
});

test('unfinished drafts are scoped by listing, supply, RuleSet and document', () => {
  assert.notEqual(
    listingInputDraftScope(current),
    listingInputDraftScope({ ...current, ruleSetVersion: '2.0.0' }),
  );
  assert.notEqual(
    listingInputDraftScope(current),
    listingInputDraftScope({ ...current, listingId: 'listing-y' }),
  );
});
