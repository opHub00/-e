import type { Answers } from './questionnaire/questions.ts';
import type { SupplyType } from './types.ts';
import { parseForm } from './form.ts';

export const LISTING_INPUT_SCHEMA_VERSION = 1 as const;

export const LONG_TERM_QUESTION_IDS = [
  'birthDate', 'currentResidence', 'overseas', 'residenceStartDate',
  'marriageDate', 'everMarried', 'firstMarriageDate', 'children',
  'isHouseholdHead', 'householdHomeOwnership', 'specialSupplyRestriction',
  'housingDisposalDates', 'specialSupplyHistory', 'reWinningRestriction',
  'hasAccount', 'subscriptionAccountOpenedAt', 'recognizedPaymentCount',
  'recognizedDepositAmount', 'firstRank', 'monthlyIncome', 'householdIncome',
  'dualIncome', 'workStartedAt', 'totalAssets', 'parentAssets',
  'realEstateAssets', 'vehicleValue',
] as const;

/**
 * These are raw answers whose meaning is limited by the selected listing,
 * supply type or announcement wording. They must never be promoted to V3.
 */
export const LISTING_SCOPED_QUESTION_IDS = [
  'familyCategory',
  'plannedMarriageWithinDeadline',
  'singleParentQualified',
  'unmarriedChildInHousehold',
  'incomeHouseholdSize',
  'noHomeSince',
  'householdNoWinningFiveYears',
  'accountKindEligible',
  'youthPriorityTarget',
  'newlywedPriorityTarget',
  'exceptions',
] as const;

export const LISTING_SCOPED_ANSWER_FACTS: Record<ListingScopedQuestionId, readonly string[]> = {
  familyCategory: ['familyCategory', 'newlywedMarriageScoreMonths', 'singleParentChildScoreMonths'],
  plannedMarriageWithinDeadline: ['plannedMarriageWithinDeadline'],
  singleParentQualified: ['singleParentQualified'],
  unmarriedChildInHousehold: ['unmarriedChildInHousehold'],
  incomeHouseholdSize: ['incomeHouseholdSize', 'householdIncomeScoreTier', 'householdIncomeScoreEligible'],
  noHomeSince: ['noHomeMonths'],
  householdNoWinningFiveYears: ['householdNoWinningFiveYears'],
  accountKindEligible: ['accountKindEligible'],
  youthPriorityTarget: ['youthPriorityTarget'],
  newlywedPriorityTarget: ['newlywedPriorityTarget'],
  exceptions: ['exceptionsClear'],
};

/** Engine facts and outputs. None may be accepted as a persisted user answer. */
export const DERIVED_ASSESSMENT_FACTS = [
  'age', 'accountMonths', 'residenceMonths', 'noHomeMonths',
  'childbirthClear', 'exceptionsClear', 'stage', 'score',
] as const;

export type ListingScopedQuestionId = typeof LISTING_SCOPED_QUESTION_IDS[number];
export type QuestionnaireAnswerClass = 'LONG_TERM_PROFILE' | 'LISTING_SCOPED' | 'DERIVED_OR_UNKNOWN';

const longTerm = new Set<string>(LONG_TERM_QUESTION_IDS);
const listingScoped = new Set<string>(LISTING_SCOPED_QUESTION_IDS);
const derived = new Set<string>(DERIVED_ASSESSMENT_FACTS);

export function classifyQuestionnaireAnswer(id: string): QuestionnaireAnswerClass {
  if (longTerm.has(id)) return 'LONG_TERM_PROFILE';
  if (listingScoped.has(id)) return 'LISTING_SCOPED';
  if (derived.has(id)) return 'DERIVED_OR_UNKNOWN';
  return 'DERIVED_OR_UNKNOWN';
}

export function selectListingScopedAnswers(answers: Answers): Answers {
  const selected: Answers = {};
  for (const id of LISTING_SCOPED_QUESTION_IDS) {
    const value = answers[id]?.trim();
    if (value) selected[id] = value;
  }
  return selected;
}

/** A local draft is an unfinished edit and may override the last server snapshot. */
export function mergeSavedAnswersWithDraft(saved: Answers, draft: Answers): Answers {
  return { ...saved, ...draft };
}

/** Canonical questionnaire parser; the server and browser never maintain separate calculators. */
export function assessmentDetailsFromListingAnswers(answers: Answers, supplyType: SupplyType) {
  return parseForm(selectListingScopedAnswers(answers), supplyType).details;
}

export type ListingInputCompatibility =
  | 'CURRENT'
  | 'STALE_RULE_SET'
  | 'STALE_DOCUMENT';

export type ListingInputReference = {
  listingId: string;
  announcementId: string;
  supplyType: SupplyType;
  ruleSetId: string;
  ruleSetVersion: string;
  sourceDocumentId: string | null;
  sourceDocumentHash?: string | null;
};

export type ListingAssessmentInputRecord = ListingInputReference & {
  userId: string;
  schemaVersion: typeof LISTING_INPUT_SCHEMA_VERSION;
  revision: number;
  answers: Answers;
  compatibility: ListingInputCompatibility;
  staleAt: string | null;
  staleReason: Exclude<ListingInputCompatibility, 'CURRENT'> | null;
  createdAt: string;
  updatedAt: string;
};

export function listingInputCompatibility(
  record: ListingAssessmentInputRecord,
  current: ListingInputReference,
): ListingInputCompatibility {
  // The database can detect a source-document hash change even when the client
  // only has the document id. Never upgrade a server-declared stale record.
  if (record.compatibility !== 'CURRENT') return record.compatibility;
  if (record.ruleSetId !== current.ruleSetId || record.ruleSetVersion !== current.ruleSetVersion) {
    return 'STALE_RULE_SET';
  }
  if (record.sourceDocumentId !== current.sourceDocumentId
      || (current.sourceDocumentHash !== undefined
        && record.sourceDocumentHash !== current.sourceDocumentHash)) {
    return 'STALE_DOCUMENT';
  }
  return 'CURRENT';
}

export function reusableListingAnswers(
  record: ListingAssessmentInputRecord | null,
  current: ListingInputReference,
): { answers: Answers; stale: boolean; reason: ListingInputCompatibility | null } {
  if (!record) return { answers: {}, stale: false, reason: null };
  const compatibility = listingInputCompatibility(record, current);
  return compatibility === 'CURRENT'
    ? { answers: structuredClone(record.answers), stale: false, reason: compatibility }
    : { answers: {}, stale: true, reason: compatibility };
}

/**
 * Local drafts are unfinished input only. Scope them to the exact semantic
 * context so that a RuleSet/document change cannot revive an old draft.
 */
export function listingInputDraftScope(reference: ListingInputReference): string {
  return [
    reference.listingId,
    reference.supplyType,
    reference.ruleSetId,
    reference.ruleSetVersion,
    reference.sourceDocumentId ?? 'no-document',
  ].join('::');
}
