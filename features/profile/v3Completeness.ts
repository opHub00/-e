import {
  knownProfileFact,
  notApplicableProfileFact,
  type ApplicantProfileV3,
  type PartialDate,
  type ProfileFact,
} from './v3.ts';
import type { ApplicantProfileReadResult, ApplicantProfileV3Record } from './v3Repository.ts';
import type { ApplicantProfileV3SyncStatus } from './useApplicantProfileV3Store.ts';

export type ApplicantProfileV3Lifecycle =
  | 'LOADING'
  | 'NEW_USER'
  | 'PROFILE_INCOMPLETE'
  | 'PROFILE_READY'
  | 'PROFILE_CONFLICT'
  | 'PROFILE_ERROR';

export type ApplicantProfileFieldId =
  | 'birthDate'
  | 'currentRegion'
  | 'hasSubscriptionAccount'
  | 'marriageStatus'
  | 'currentOwnership'
  | 'residenceStartedAt'
  | 'subscriptionAccountKind'
  | 'subscriptionAccountOpenedAt'
  | 'recognizedPaymentCount'
  | 'recognizedDepositAmount'
  | 'firstRank'
  | 'previousOwnership'
  | 'householdHasHome'
  | 'hasSpecialSupplyRestriction'
  | 'currentReWinningRestriction'
  | 'householdMemberCount'
  | 'isHouseholdHead'
  | 'monthlyApplicantIncome'
  | 'monthlyHouseholdIncome'
  | 'dualIncome'
  | 'workOrBusinessIncomeEligible'
  | 'incomeTaxPaymentYears'
  | 'totalApplicantAssets'
  | 'parentAssets'
  | 'householdRealEstateAssets'
  | 'vehicleValue';

export type ApplicantProfileFieldDefinition = {
  id: ApplicantProfileFieldId;
  label: string;
  help: string;
  kind: 'DATE' | 'REGION' | 'BOOLEAN' | 'INTEGER' | 'MONEY' | 'CHOICE';
  initial: boolean;
  assessmentFacts: string[];
  options?: Array<{ value: string | boolean; label: string }>;
};

export const applicantProfileV3Fields: ApplicantProfileFieldDefinition[] = [
  { id: 'birthDate', label: '생년월일', help: '공고일 기준 나이를 정확히 계산하는 데 사용해요.', kind: 'DATE', initial: true, assessmentFacts: ['age', 'birthDate'] },
  { id: 'currentRegion', label: '현재 거주지역', help: '지역 우선공급과 거주 요건을 확인해요.', kind: 'REGION', initial: true, assessmentFacts: ['residence'] },
  { id: 'hasSubscriptionAccount', label: '청약통장 보유 여부', help: '통장 요건이 있는 공고를 구분해요.', kind: 'BOOLEAN', initial: true, assessmentFacts: ['hasAccount'] },
  { id: 'marriageStatus', label: '혼인 상태', help: '청년·신혼·생애최초 공급유형을 구분해요.', kind: 'CHOICE', initial: true, assessmentFacts: ['maritalStatus'], options: [{ value: 'single', label: '미혼' }, { value: 'married', label: '기혼' }] },
  { id: 'currentOwnership', label: '현재 주택 상태', help: '본인 기준 무주택 여부를 확인해요.', kind: 'CHOICE', initial: true, assessmentFacts: ['noHome'], options: [{ value: 'no-home', label: '무주택' }, { value: 'owns-home', label: '주택 보유' }] },
  { id: 'residenceStartedAt', label: '현재 지역 거주 시작일', help: '지역 거주기간을 공고일 기준으로 계산해요.', kind: 'DATE', initial: false, assessmentFacts: ['residenceMonths'] },
  { id: 'subscriptionAccountKind', label: '청약통장 종류', help: '공급유형별 인정 통장인지 확인해요.', kind: 'CHOICE', initial: false, assessmentFacts: ['accountKindEligible'], options: [{ value: 'HOUSING_SUBSCRIPTION', label: '주택청약종합저축' }, { value: 'SUBSCRIPTION_SAVINGS', label: '청약저축' }, { value: 'OTHER', label: '기타' }] },
  { id: 'subscriptionAccountOpenedAt', label: '청약통장 가입일', help: '가입기간을 공고일 기준으로 계산해요.', kind: 'DATE', initial: false, assessmentFacts: ['accountMonths', 'subscriptionAccountOpenedAt'] },
  { id: 'recognizedPaymentCount', label: '인정 납입횟수', help: '청약통장 인정 납입횟수를 입력해요.', kind: 'INTEGER', initial: false, assessmentFacts: ['recognizedPaymentCount'] },
  { id: 'recognizedDepositAmount', label: '인정 저축금액', help: '청약저축 인정 금액을 원 단위로 입력해요.', kind: 'MONEY', initial: false, assessmentFacts: ['recognizedDepositAmount'] },
  { id: 'firstRank', label: '청약통장 1순위 여부', help: '청약통장 1순위 충족 여부를 입력해요.', kind: 'BOOLEAN', initial: false, assessmentFacts: ['firstRank'] },
  { id: 'previousOwnership', label: '과거 주택소유 이력', help: '과거 본인 주택소유 이력이 있는지 확인해요.', kind: 'BOOLEAN', initial: false, assessmentFacts: ['neverOwned'] },
  { id: 'householdHasHome', label: '세대 주택 보유 여부', help: '현재 세대원 전체의 주택 상태를 확인해요.', kind: 'BOOLEAN', initial: false, assessmentFacts: ['householdNoHome'] },
  { id: 'hasSpecialSupplyRestriction', label: '특별공급 제한 여부', help: '특별공급 재신청 제한 여부를 확인해요.', kind: 'BOOLEAN', initial: false, assessmentFacts: ['noSpecialRestriction'] },
  { id: 'currentReWinningRestriction', label: '현재 재당첨 제한 여부', help: '현재 적용 중인 재당첨 제한을 확인해요.', kind: 'BOOLEAN', initial: false, assessmentFacts: ['noReWinningRestriction'] },
  { id: 'householdMemberCount', label: '세대원 수', help: '세대 기준 소득과 자격을 확인해요.', kind: 'INTEGER', initial: false, assessmentFacts: ['householdMemberCount', 'incomeHouseholdSize'] },
  { id: 'isHouseholdHead', label: '세대주 여부', help: '세대주 요건이 있는 공고를 확인해요.', kind: 'BOOLEAN', initial: false, assessmentFacts: ['isHouseholdHead'] },
  { id: 'monthlyApplicantIncome', label: '본인 월소득', help: '세전 월소득 금액을 원 단위로 입력해요.', kind: 'MONEY', initial: false, assessmentFacts: ['monthlyIncome'] },
  { id: 'monthlyHouseholdIncome', label: '세대 월소득', help: '세대 합산 월소득을 원 단위로 입력해요.', kind: 'MONEY', initial: false, assessmentFacts: ['householdIncome'] },
  { id: 'dualIncome', label: '맞벌이 여부', help: '신혼부부 소득기준 구분에 사용해요.', kind: 'BOOLEAN', initial: false, assessmentFacts: ['dualIncome'] },
  { id: 'workOrBusinessIncomeEligible', label: '근로·사업소득 요건', help: '현재 근로·사업소득 요건 충족 여부를 입력해요.', kind: 'BOOLEAN', initial: false, assessmentFacts: ['workOrBusinessIncome'] },
  { id: 'incomeTaxPaymentYears', label: '소득세 납부연수', help: '생애최초 공급의 소득세 납부 이력을 확인해요.', kind: 'INTEGER', initial: false, assessmentFacts: ['incomeTaxPaymentYears'] },
  { id: 'totalApplicantAssets', label: '본인 총자산', help: '본인 총자산을 원 단위로 입력해요.', kind: 'MONEY', initial: false, assessmentFacts: ['totalAssets'] },
  { id: 'parentAssets', label: '부모 자산', help: '필요한 공급유형에서 부모 자산을 확인해요.', kind: 'MONEY', initial: false, assessmentFacts: ['parentAssets'] },
  { id: 'householdRealEstateAssets', label: '세대 부동산 자산', help: '세대 기준 부동산 자산을 원 단위로 입력해요.', kind: 'MONEY', initial: false, assessmentFacts: ['realEstateAssets'] },
  { id: 'vehicleValue', label: '자동차 가액', help: '보유 자동차 가액을 원 단위로 입력해요.', kind: 'MONEY', initial: false, assessmentFacts: ['vehicleValue'] },
];

export const initialProfileRequiredFields = applicantProfileV3Fields.filter(field => field.initial);
export const progressiveProfileFields = applicantProfileV3Fields.filter(field => !field.initial);

function factForField(profile: ApplicantProfileV3, field: ApplicantProfileFieldId): ProfileFact<unknown> {
  switch (field) {
    case 'birthDate': return profile.identity.birthDate;
    case 'currentRegion': return profile.residence.currentRegion;
    case 'hasSubscriptionAccount': return profile.subscriptionAccount.hasAccount;
    case 'marriageStatus': return profile.family.marriageStatus;
    case 'currentOwnership': return profile.housing.currentOwnership;
    case 'residenceStartedAt': return profile.residence.startedAt;
    case 'subscriptionAccountKind': return profile.subscriptionAccount.kind;
    case 'subscriptionAccountOpenedAt': return profile.subscriptionAccount.openedAt;
    case 'recognizedPaymentCount': return profile.subscriptionAccount.recognizedPaymentCount;
    case 'recognizedDepositAmount': return profile.subscriptionAccount.recognizedDepositAmount;
    case 'firstRank': return profile.subscriptionAccount.firstRank;
    case 'previousOwnership': return profile.housing.previousOwnership;
    case 'householdHasHome': return profile.housing.householdHasHome;
    case 'hasSpecialSupplyRestriction': return profile.housing.hasSpecialSupplyRestriction;
    case 'currentReWinningRestriction': return profile.housing.currentReWinningRestriction;
    case 'householdMemberCount': return profile.household.memberCount;
    case 'isHouseholdHead': return profile.household.isHouseholdHead;
    case 'monthlyApplicantIncome': return profile.income.monthlyApplicantIncome;
    case 'monthlyHouseholdIncome': return profile.income.monthlyHouseholdIncome;
    case 'dualIncome': return profile.income.dualIncome;
    case 'workOrBusinessIncomeEligible': return profile.income.workOrBusinessIncomeEligible;
    case 'incomeTaxPaymentYears': return profile.income.incomeTaxPaymentYears;
    case 'totalApplicantAssets': return profile.assets.totalApplicantAssets;
    case 'parentAssets': return profile.assets.parentAssets;
    case 'householdRealEstateAssets': return profile.assets.householdRealEstateAssets;
    case 'vehicleValue': return profile.assets.vehicleValue;
  }
}

export function profileFieldValue(profile: ApplicantProfileV3, field: ApplicantProfileFieldId): unknown {
  const fact = factForField(profile, field);
  if (fact.state !== 'KNOWN') return undefined;
  const value = fact.value;
  return typeof value === 'object' && value && 'value' in value ? (value as PartialDate).value : value;
}

export function missingInitialProfileFields(profile: ApplicantProfileV3 | null): ApplicantProfileFieldDefinition[] {
  if (!profile) return initialProfileRequiredFields;
  return initialProfileRequiredFields.filter(field => factForField(profile, field.id).state !== 'KNOWN');
}

export function isInitialApplicantProfileComplete(profile: ApplicantProfileV3 | null): boolean {
  return missingInitialProfileFields(profile).length === 0;
}

export function deriveApplicantProfileV3Lifecycle(input: {
  authHydrated: boolean;
  userId: string | null;
  status: ApplicantProfileV3SyncStatus;
  source: ApplicantProfileReadResult['source'] | null;
  profile: ApplicantProfileV3 | null;
  record: ApplicantProfileV3Record | null;
}): ApplicantProfileV3Lifecycle {
  if (!input.authHydrated || input.status === 'loading' || input.status === 'disabled') return 'LOADING';
  if (input.status === 'conflict') return 'PROFILE_CONFLICT';
  if (input.status === 'error') return 'PROFILE_ERROR';
  if (!input.userId || input.source === 'NONE' || !input.profile) return 'NEW_USER';
  if (!input.record || !isInitialApplicantProfileComplete(input.profile)) return 'PROFILE_INCOMPLETE';
  return 'PROFILE_READY';
}

export function profileFieldForAssessmentFact(field: string): ApplicantProfileFieldDefinition | null {
  const normalized = field.replace(/^input:/, '');
  return applicantProfileV3Fields.find(definition => definition.assessmentFacts.includes(normalized)) ?? null;
}

const userFact = <T>(value: T, observedAt: string) => knownProfileFact(value, { source: 'USER', observedAt });
const day = (value: string): PartialDate => ({ value, precision: 'DAY' });

export function updateApplicantProfileV3Field(
  profile: ApplicantProfileV3,
  field: ApplicantProfileFieldId,
  value: string | number | boolean,
  observedAt = new Date().toISOString(),
): ApplicantProfileV3 {
  const next = structuredClone(profile);
  switch (field) {
    case 'birthDate': next.identity.birthDate = userFact(day(String(value)), observedAt); break;
    case 'currentRegion': next.residence.currentRegion = userFact(String(value), observedAt); break;
    case 'hasSubscriptionAccount': {
      const has = Boolean(value);
      next.subscriptionAccount.hasAccount = userFact(has, observedAt);
      if (!has) {
        next.subscriptionAccount.kind = notApplicableProfileFact({ source: 'USER', observedAt });
        next.subscriptionAccount.openedAt = notApplicableProfileFact({ source: 'USER', observedAt });
        next.subscriptionAccount.recognizedPaymentCount = notApplicableProfileFact({ source: 'USER', observedAt });
        next.subscriptionAccount.recognizedPaymentCountAsOf = notApplicableProfileFact({ source: 'USER', observedAt });
        next.subscriptionAccount.recognizedDepositAmount = notApplicableProfileFact({ source: 'USER', observedAt });
        next.subscriptionAccount.firstRank = notApplicableProfileFact({ source: 'USER', observedAt });
      }
      break;
    }
    case 'marriageStatus': {
      const status = value as 'single' | 'married';
      next.family.marriageStatus = userFact(status, observedAt);
      if (status === 'single') {
        next.family.marriageDate = notApplicableProfileFact({ source: 'USER', observedAt });
        next.family.firstMarriageDate = notApplicableProfileFact({ source: 'USER', observedAt });
      }
      break;
    }
    case 'currentOwnership': next.housing.currentOwnership = userFact(value as 'no-home' | 'owns-home', observedAt); break;
    case 'residenceStartedAt': next.residence.startedAt = userFact(day(String(value)), observedAt); break;
    case 'subscriptionAccountKind': next.subscriptionAccount.kind = userFact(value as 'HOUSING_SUBSCRIPTION' | 'SUBSCRIPTION_SAVINGS' | 'OTHER', observedAt); break;
    case 'subscriptionAccountOpenedAt': next.subscriptionAccount.openedAt = userFact(day(String(value)), observedAt); break;
    case 'recognizedPaymentCount': next.subscriptionAccount.recognizedPaymentCount = userFact(Number(value), observedAt); break;
    case 'recognizedDepositAmount': next.subscriptionAccount.recognizedDepositAmount = userFact(Number(value), observedAt); break;
    case 'firstRank': next.subscriptionAccount.firstRank = userFact(Boolean(value), observedAt); break;
    case 'previousOwnership': next.housing.previousOwnership = userFact(Boolean(value), observedAt); break;
    case 'householdHasHome': next.housing.householdHasHome = userFact(Boolean(value), observedAt); break;
    case 'hasSpecialSupplyRestriction': next.housing.hasSpecialSupplyRestriction = userFact(Boolean(value), observedAt); break;
    case 'currentReWinningRestriction': next.housing.currentReWinningRestriction = userFact(Boolean(value), observedAt); break;
    case 'householdMemberCount': next.household.memberCount = userFact(Number(value), observedAt); break;
    case 'isHouseholdHead': next.household.isHouseholdHead = userFact(Boolean(value), observedAt); break;
    case 'monthlyApplicantIncome': next.income.monthlyApplicantIncome = userFact(Number(value), observedAt); break;
    case 'monthlyHouseholdIncome': next.income.monthlyHouseholdIncome = userFact(Number(value), observedAt); break;
    case 'dualIncome': next.income.dualIncome = userFact(Boolean(value), observedAt); break;
    case 'workOrBusinessIncomeEligible': next.income.workOrBusinessIncomeEligible = userFact(Boolean(value), observedAt); break;
    case 'incomeTaxPaymentYears': next.income.incomeTaxPaymentYears = userFact(Number(value), observedAt); break;
    case 'totalApplicantAssets': next.assets.totalApplicantAssets = userFact(Number(value), observedAt); break;
    case 'parentAssets': next.assets.parentAssets = userFact(Number(value), observedAt); break;
    case 'householdRealEstateAssets': next.assets.householdRealEstateAssets = userFact(Number(value), observedAt); break;
    case 'vehicleValue': next.assets.vehicleValue = userFact(Number(value), observedAt); break;
  }
  return next;
}
