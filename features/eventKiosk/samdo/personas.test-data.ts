import { knownField } from '../../profile/domain.ts';
import { samdoApplicant } from '../../applicationAssessment/server/samdoProfiles.test-data.ts';
import type { AssessmentInput } from '../../applicationAssessment/types.ts';

export type SamdoPersona = { id: string; label: string; input: AssessmentInput };

const clone = (input: AssessmentInput): AssessmentInput => structuredClone(input);

function young(residenceStartDate: string): AssessmentInput {
  const input = clone(samdoApplicant('youth'));
  input.details.residenceStartDate = residenceStartDate;
  input.details.familyCategory = undefined;
  input.details.marriageDate = undefined;
  input.details.firstMarriageDate = undefined;
  input.details.everMarried = false;
  input.details.plannedMarriageWithinDeadline = false;
  input.details.singleParentQualified = false;
  input.details.unmarriedChildInHousehold = false;
  return input;
}

function engaged(): AssessmentInput {
  const input = clone(samdoApplicant('newlywed'));
  input.profile.family.marriageStatus = knownField('single');
  input.details.familyCategory = 'engaged';
  input.details.marriageDate = undefined;
  input.details.firstMarriageDate = undefined;
  input.details.everMarried = false;
  input.details.plannedMarriageWithinDeadline = true;
  return input;
}

function newlywed(childBirthDate?: string): AssessmentInput {
  const input = clone(samdoApplicant('newlywed'));
  input.details.marriageDate = '2025-09-14';
  input.details.firstMarriageDate = '2025-09-14';
  input.details.children = childBirthDate ? [{ birthDate: childBirthDate, unborn: false }] : [];
  return input;
}

function firstHome(): AssessmentInput {
  const input = clone(samdoApplicant('firstHome'));
  input.details.marriageDate = '2022-09-14';
  input.details.firstMarriageDate = '2022-09-14';
  return input;
}

function newborn(): AssessmentInput {
  const input = newlywed('2025-09-14');
  input.details.householdIncome = 5_000_000;
  input.details.incomeHouseholdSize = 3;
  input.profile.household.memberCount = knownField(3);
  return input;
}

function general(): AssessmentInput {
  const input = clone(samdoApplicant('firstHome'));
  input.details.birthDate = '1981-09-14';
  input.profile.basic.birthDate = knownField('1981-09-14');
  input.profile.basic.age = 45;
  input.details.marriageDate = '2010-09-14';
  input.details.firstMarriageDate = '2010-09-14';
  input.details.noHomeSince = '2020-09-14';
  input.profile.housing.previousOwnership = knownField(true);
  input.profile.housing.householdDisqualifyingPreviousOwnership = knownField(true);
  input.details.housingDisposalDates = ['2020-09-14'];
  return input;
}

function ineligible(): AssessmentInput {
  const input = clone(samdoApplicant('firstHome'));
  input.details.birthDate = '1981-09-14';
  input.profile.basic.birthDate = knownField('1981-09-14');
  input.profile.basic.age = 45;
  input.profile.housing.currentOwnership = knownField('owns-home');
  input.profile.housing.householdHasHome = knownField(true);
  input.profile.subscriptionAccount.hasAccount = knownField(false);
  input.details.reWinningRestriction = true;
  input.details.totalAssets = 600_000_000;
  input.details.children = [];
  return input;
}

export const SAMDO_PERSONAS: SamdoPersona[] = [
  { id: 'young-single-20s', label: '20대 미혼 청년', input: young('2026-01-01') },
  { id: 'young-jeju-2y', label: '제주 2년 이상 청년', input: young('2024-09-14') },
  { id: 'engaged', label: '예비신혼', input: engaged() },
  { id: 'newlywed-no-child', label: '신혼 1년 + 자녀 없음', input: newlywed() },
  { id: 'newlywed-infant', label: '신혼 + 1세 영아', input: newlywed('2025-09-14') },
  { id: 'first-home-couple', label: '생애최초 부부', input: firstHome() },
  { id: 'newborn-family', label: '신생아 가구', input: newborn() },
  { id: 'general-no-home', label: '일반 무주택', input: general() },
  { id: 'clearly-ineligible', label: '명확 자격 미달', input: ineligible() },
];
