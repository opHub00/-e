import { known, unknown, type ApplicantProfile, type HouseholdMemberProfile, type SpouseProfile, type UserProfile } from '../domain/profile.ts';
import type { FrozenListingDataset } from '../domain/rules.ts';
import type { EvaluationResult } from '../domain/evaluation.ts';
import { assessFrozenDataset } from '../engine/batch.ts';

export type PersonaId = 'YOUNG_SINGLE' | 'ENGAGED_COUPLE' | 'NEWLYWED_COUPLE' | 'NEWLYWED_ONE_CHILD' | 'FIRST_HOME_COUPLE' | 'MULTI_CHILD' | 'GENERAL_NO_HOME' | 'CLEARLY_INELIGIBLE';
export type MatrixStatus = 'COMPLETE' | 'NEEDS_USER_INPUT' | 'INELIGIBLE' | 'UNAVAILABLE';
export type EventPersona = { id: PersonaId; label: string; profile: UserProfile };

function applicant(id: string, birthDate: string, monthlyIncomeKrw: number, totalAssetsKrw: number): ApplicantProfile {
  return {
    id: `${id}-applicant`, role: 'APPLICANT', birthDate: known(birthDate), maritalStatus: known('SINGLE'), marriageDate: unknown(),
    residence: { region: known('제주특별자치도 제주시'), residentSince: known('2018-01-01'), overseasStayRequiresReview: known(false) },
    housing: { currentHomeCount: known(0), everOwnedHome: known(false), noHomeSince: known('2015-01-01') },
    subscriptionAccount: { hasAccount: known(true), openedAt: known('2018-01-01'), firstRank: known(true), recognizedPaymentCount: known(36), recognizedDepositAmountKrw: known(6_000_000) },
    financial: { monthlyIncomeKrw: known(monthlyIncomeKrw), earnedOrBusinessIncome: known(true), incomeTaxPaymentYears: known(5), totalAssetsKrw: known(totalAssetsKrw), vehicleValueKrw: known(15_000_000) },
    specialSupplyHistory: known(false), reWinningRestriction: known(false), isHouseholdHead: known(true),
  };
}
function spouse(id: string, birthDate: string, monthlyIncomeKrw: number, totalAssetsKrw: number, marriageDate = '2024-05-01'): SpouseProfile {
  return {
    id: `${id}-spouse`, role: 'SPOUSE', birthDate: known(birthDate), maritalStatus: known('MARRIED'), marriageDate: known(marriageDate),
    residence: { region: known('제주특별자치도 제주시'), residentSince: known('2020-01-01'), overseasStayRequiresReview: known(false) },
    housing: { currentHomeCount: known(0), everOwnedHome: known(false), noHomeSince: known('2015-01-01') },
    subscriptionAccount: { hasAccount: known(true), openedAt: known('2019-01-01'), firstRank: known(true), recognizedPaymentCount: known(24), recognizedDepositAmountKrw: known(4_000_000) },
    financial: { monthlyIncomeKrw: known(monthlyIncomeKrw), earnedOrBusinessIncome: known(true), incomeTaxPaymentYears: known(4), totalAssetsKrw: known(totalAssetsKrw), vehicleValueKrw: known(10_000_000) },
    specialSupplyHistory: known(false), reWinningRestriction: known(false),
  };
}
function child(id: string, birthDate: string): HouseholdMemberProfile {
  return { id, relationship: 'CHILD', birthDate: known(birthDate), unborn: false, coResident: known(true), currentHomeCount: known(0), monthlyIncomeKrw: known(0), totalAssetsKrw: known(0) };
}
function base(id: string, label: string, birthDate: string, income: number, assets: number): EventPersona {
  return {
    id: id as PersonaId, label,
    profile: {
      schemaVersion: 1, profileId: `persona:${id}`, applicant: applicant(id, birthDate, income, assets), household: { composition: 'SINGLE', members: [] },
      eventQualifications: {
        eligibleResident: known(true), currentProgramTenant: known(false), collegeStudent: known(false), jobSeekerWithinTwoYears: known(false), marriageBeforeMoveIn: known(false), supportedSingleParent: known(false), benefitCategory: known('NONE'),
        parentMonthlyIncomeKrw: known(2_000_000), parentTotalAssetsKrw: known(60_000_000), parentVehicleValueKrw: known(8_000_000), parentNoHome: known(true), applicantDisabilityPoints: known(0), youthIncomeUnderHalfThreshold: known(false), housingVulnerable: known(false), severeDisabilityInHousehold: known(false), supportsSeniorParent: known(false), applicantRegisteredDisabled: known(false), rentBurdenPercent: known(20), workHistoryMonths: known(36), generalRentalPriorityCategory: known('NONE'), lhCollegeIncomeEligible: known(true),
      }, consent: { assessment: true, temporaryResultSession: true },
    },
  };
}
function makeCouple(persona: EventPersona, composition: UserProfile['household']['composition'] = 'COUPLE'): EventPersona {
  persona.profile.applicant.maritalStatus = known(composition === 'ENGAGED_COUPLE' ? 'ENGAGED' : 'MARRIED');
  persona.profile.applicant.marriageDate = composition === 'ENGAGED_COUPLE' ? unknown() : known('2024-05-01');
  persona.profile.household.composition = composition;
  persona.profile.household.spouse = spouse(persona.id, '1993-08-20', 2_100_000, 50_000_000);
  if (composition === 'ENGAGED_COUPLE') {
    persona.profile.household.spouse.maritalStatus = known('ENGAGED');
    persona.profile.household.spouse.marriageDate = unknown();
    persona.profile.eventQualifications!.marriageBeforeMoveIn = known(true);
  }
  return persona;
}

const young = base('YOUNG_SINGLE', '20대 미혼 청년', '2001-04-10', 2_500_000, 60_000_000);
const engaged = makeCouple(base('ENGAGED_COUPLE', '30대 예비신혼부부', '1992-04-10', 2_800_000, 80_000_000), 'ENGAGED_COUPLE');
const newlywed = makeCouple(base('NEWLYWED_COUPLE', '30대 신혼부부', '1991-04-10', 2_800_000, 80_000_000));
const oneChild = makeCouple(base('NEWLYWED_ONE_CHILD', '신혼 + 자녀 1명', '1991-04-10', 2_600_000, 80_000_000), 'COUPLE_WITH_CHILDREN');
oneChild.profile.household.members.push(child('one-child', '2025-01-15'));
const firstHome = makeCouple(base('FIRST_HOME_COUPLE', '생애최초 조건의 부부', '1990-04-10', 2_700_000, 70_000_000));
firstHome.profile.applicant.housing.everOwnedHome = known(false);
firstHome.profile.household.spouse!.housing.everOwnedHome = known(false);
const multiChild = makeCouple(base('MULTI_CHILD', '다자녀 가구', '1988-04-10', 2_200_000, 70_000_000), 'COUPLE_WITH_CHILDREN');
multiChild.profile.household.members.push(child('multi-child-1', '2018-01-01'), child('multi-child-2', '2021-01-01'), child('multi-child-3', '2025-01-01'));
const general = makeCouple(base('GENERAL_NO_HOME', '일반 무주택 가구', '1980-04-10', 2_000_000, 70_000_000));
general.profile.applicant.marriageDate = known('2010-05-01');
general.profile.household.spouse!.marriageDate = known('2010-05-01');
general.profile.eventQualifications!.generalRentalPriorityCategory = known('PRIORITY_1');
const ineligible = base('CLEARLY_INELIGIBLE', '명확한 자격 미달 가구', '1975-04-10', 15_000_000, 900_000_000);
ineligible.profile.applicant.housing.currentHomeCount = known(1);
ineligible.profile.applicant.housing.everOwnedHome = known(true);
ineligible.profile.applicant.financial.vehicleValueKrw = known(90_000_000);
ineligible.profile.eventQualifications!.eligibleResident = known(false);
ineligible.profile.eventQualifications!.currentProgramTenant = known(true);

export const eventPersonas: EventPersona[] = [young, engaged, newlywed, oneChild, firstHome, multiChild, general, ineligible];

export function matrixStatus(result: EvaluationResult): MatrixStatus {
  if (result.eligibility === 'INELIGIBLE') return 'INELIGIBLE';
  if (result.eligibility === 'NEEDS_MORE_INFORMATION' || result.eligibility === 'REVIEW_REQUIRED' || result.priority.status === 'PENDING' || result.officialScore.status === 'PENDING') return 'NEEDS_USER_INPUT';
  return 'COMPLETE';
}

export function evaluatePersonaMatrix(dataset: FrozenListingDataset, evaluatedAt = '2026-10-29T09:00:00.000+09:00') {
  const combinations = dataset.rulePackages.flatMap(pkg => pkg.supplies.map(supply => `${pkg.listingId}:${supply.supplyType}`));
  return eventPersonas.map(persona => {
    const assessment = assessFrozenDataset(persona.profile, dataset, { evaluatedAt });
    const byCombination = new Map(assessment.results.map(result => [result.evaluationId, matrixStatus(result)]));
    const cells = combinations.map(combination => ({ combination, status: byCombination.get(combination) ?? 'UNAVAILABLE' as MatrixStatus }));
    const distribution: Record<MatrixStatus, number> = { COMPLETE: 0, NEEDS_USER_INPUT: 0, INELIGIBLE: 0, UNAVAILABLE: 0 };
    for (const cell of cells) distribution[cell.status] += 1;
    return { personaId: persona.id, label: persona.label, distribution, cells };
  });
}
