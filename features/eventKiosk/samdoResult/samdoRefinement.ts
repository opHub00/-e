import type { AssessmentInput } from '../../applicationAssessment/types.ts';
import { monthsBefore } from '../engineInput.ts';
import type { AnswerStateMap } from '../questionPolicy.ts';
import { SAMDO_DEEP_RULE_PACKAGE } from '../samdo/rulePackage.ts';
import { SAMDO_STAGE_LABELS } from '../samdo/presentation.ts';
import type {
  SamdoEligibility,
  SamdoOfficialScore,
  SamdoRecommendation,
  SamdoSupplyType,
} from '../samdo/types.ts';
import type { KioskAnswers } from '../model.ts';
import { buildSamdoRecommendation } from '../samdo/evaluate.ts';
import { samdoInputFromAnswers } from './samdoInput.ts';
import { samdoRules } from './samdoEvaluate.ts';

export type SamdoRefinementFactId =
  | 'currentResidence'
  | 'residenceMonths'
  | 'longOverseasStay'
  | 'accountOpenedAt'
  | 'paymentCount'
  | 'depositAmount'
  | 'firstRank'
  | 'monthlyIncome'
  | 'householdIncome'
  | 'totalAssets'
  | 'parentAssets'
  | 'marriageDate'
  | 'childBirthDate'
  | 'householdNoHome'
  | 'pastHomeOwnership'
  | 'specialSupplyHistory'
  | 'reWinningRestriction'
  | 'householdNoWinningFiveYears';

export type SamdoSimulationFactId =
  | 'residenceMonths'
  | 'accountOpenedAt'
  | 'paymentCount'
  | 'depositAmount'
  | 'monthlyIncome'
  | 'householdIncome'
  | 'totalAssets'
  | 'parentAssets'
  | 'marriageDate'
  | 'childBirthDate'
  | 'noHomeSince'
  | 'specialSupplyHistory'
  | 'reWinningRestriction'
  | 'householdNoWinningFiveYears';

export type SamdoFactValue = string | number | boolean;
export type SamdoInputKind = 'NUMBER' | 'DATE' | 'BOOLEAN';
export type SamdoResolutionState = 'DOES_NOT_KNOW' | 'UNKNOWN' | 'EVIDENCE_REQUIRED' | 'CONDITIONAL';

type Definition = {
  id: SamdoRefinementFactId;
  label: string;
  inputKind: SamdoInputKind;
  unit?: string;
  reason: string;
  help: string;
  answerKeys: string[];
};

const DEFINITIONS: Record<SamdoRefinementFactId, Definition> = {
  currentResidence: {
    id: 'currentResidence', label: '제주 거주 여부', inputKind: 'BOOLEAN', reason: '공고일 현재 제주 거주 자격을 확인하는 데 필요해요.',
    help: '주민등록표 초본의 공고일 현재 주소를 확인해 주세요.', answerKeys: ['applicant.livesInEventRegion'],
  },
  residenceMonths: {
    id: 'residenceMonths', label: '제주 연속 거주기간', inputKind: 'NUMBER', unit: '개월', reason: '지역 우선공급 단계와 일부 공식 가점에 영향을 줘요.',
    help: '주민등록표 초본의 제주 전입일과 장기 해외체류 기간을 함께 확인해 주세요.', answerKeys: ['applicant.residenceMonths'],
  },
  longOverseasStay: {
    id: 'longOverseasStay', label: '장기 해외체류 이력', inputKind: 'BOOLEAN', reason: '제주 연속 거주기간 인정 여부에 영향을 줄 수 있어요.',
    help: '출입국에 관한 사실증명에서 계속 90일을 넘긴 해외체류가 있었는지 확인해 주세요.', answerKeys: ['applicant.longOverseasStay'],
  },
  accountOpenedAt: {
    id: 'accountOpenedAt', label: '청약통장 가입일', inputKind: 'DATE', reason: '가입기간과 신청 순위를 계산하는 데 필요해요.',
    help: '청약통장 순위확인서의 가입일을 YYYY-MM-DD로 입력해 주세요.', answerKeys: ['subscription.openedAt'],
  },
  paymentCount: {
    id: 'paymentCount', label: '청약통장 인정 납입횟수', inputKind: 'NUMBER', unit: '회', reason: '특별공급 자격, 일반공급 순위와 공식 가점에 영향을 줘요.',
    help: '통장 앱의 단순 입금횟수가 아니라 청약통장 순위확인서의 인정 횟수를 확인해 주세요.', answerKeys: ['subscription.paymentCount'],
  },
  depositAmount: {
    id: 'depositAmount', label: '청약통장 인정 저축총액', inputKind: 'NUMBER', unit: '원', reason: '생애최초 기준과 일반공급 선정순차에 영향을 줘요.',
    help: '청약통장 순위확인서의 인정 저축총액을 확인해 주세요.', answerKeys: ['subscription.depositAmount'],
  },
  firstRank: {
    id: 'firstRank', label: '청약통장 1순위 여부', inputKind: 'BOOLEAN', reason: '일반공급 신청 순위와 공급단계를 정하는 데 필요해요.',
    help: '청약통장 순위확인서에서 이 공고 기준 1순위인지 확인해 주세요.', answerKeys: ['subscription.firstRank'],
  },
  monthlyIncome: {
    id: 'monthlyIncome', label: '신청자 월평균소득', inputKind: 'NUMBER', unit: '원', reason: '청년 특별공급의 소득 자격과 단계에 영향을 줘요.',
    help: '소득금액증명 등 공고가 인정하는 서류의 월평균 금액을 확인해 주세요.', answerKeys: ['applicant.monthlyIncome'],
  },
  householdIncome: {
    id: 'householdIncome', label: '세대 월평균소득', inputKind: 'NUMBER', unit: '원', reason: '신혼·생애최초·신생아·일반공급의 자격과 단계에 영향을 줘요.',
    help: '공고상 소득 산정 대상 세대원의 월평균소득 합계를 확인해 주세요.', answerKeys: ['household.householdIncome'],
  },
  totalAssets: {
    id: 'totalAssets', label: '판정 대상 총자산', inputKind: 'NUMBER', unit: '원', reason: '공급유형별 자산기준 충족 여부를 확인하는 데 필요해요.',
    help: '부동산·자동차·금융·일반자산에서 인정 부채를 차감한 공고 기준 금액을 확인해 주세요.', answerKeys: ['household.totalAssets', 'adaptive.applicantTotalAssetsKrw'],
  },
  parentAssets: {
    id: 'parentAssets', label: '부모 총자산', inputKind: 'NUMBER', unit: '원', reason: '청년 특별공급의 부모 자산기준에만 영향을 줘요.',
    help: '부모님에게 확인하거나 자산 보유 사실확인서 준비 과정에서 확인해 주세요. 확인할 수 없으면 모름 상태를 유지해요.', answerKeys: ['household.parentInformationStatus', 'household.parentAssets'],
  },
  marriageDate: {
    id: 'marriageDate', label: '혼인신고일', inputKind: 'DATE', reason: '신혼기간과 공급단계, 혼인 관련 공식 가점에 영향을 줘요.',
    help: '혼인관계증명서의 신고일을 YYYY-MM-DD로 입력해 주세요.', answerKeys: ['household.marriageDate'],
  },
  childBirthDate: {
    id: 'childBirthDate', label: '자녀 생년월일', inputKind: 'DATE', reason: '2세 미만 자녀, 미성년 자녀 수와 출산특례 검토에 영향을 줘요.',
    help: '가족관계증명서의 정확한 생년월일을 YYYY-MM-DD로 입력해 주세요. 태아·입양은 별도 증빙 확인이 필요해요.', answerKeys: ['household.childBirthDates.0'],
  },
  householdNoHome: {
    id: 'householdNoHome', label: '세대 전체 무주택 여부', inputKind: 'BOOLEAN', reason: '모든 자동추천 공급유형의 기본 자격에 영향을 줘요.',
    help: '분리된 배우자와 그 세대원을 포함한 주택·분양권 보유 여부를 확인해 주세요.', answerKeys: ['applicant.householdNoHome'],
  },
  pastHomeOwnership: {
    id: 'pastHomeOwnership', label: '과거 주택소유 이력', inputKind: 'BOOLEAN', reason: '생애최초와 무주택기간 산정에 영향을 줘요.',
    help: '본인과 세대구성원의 과거 주택·분양권 소유 이력을 청약홈에서 확인해 주세요.', answerKeys: ['applicant.neverOwnedHome'],
  },
  specialSupplyHistory: {
    id: 'specialSupplyHistory', label: '특별공급 당첨 이력', inputKind: 'BOOLEAN', reason: '특별공급 신청 제한 여부에 영향을 줘요.',
    help: '청약홈의 청약제한사항 조회에서 본인과 세대의 특별공급 당첨 이력을 확인해 주세요.', answerKeys: ['applicant.specialSupplyHistory'],
  },
  reWinningRestriction: {
    id: 'reWinningRestriction', label: '재당첨·부적격 당첨 제한', inputKind: 'BOOLEAN', reason: '현재 신청 제한 여부에 영향을 줘요.',
    help: '청약홈의 청약제한사항 조회에서 제한기간이 남아 있는지 확인해 주세요.', answerKeys: ['applicant.reWinningRestriction'],
  },
  householdNoWinningFiveYears: {
    id: 'householdNoWinningFiveYears', label: '세대의 최근 5년 당첨 이력', inputKind: 'BOOLEAN', reason: '생애최초와 일반공급 1순위에 영향을 줘요.',
    help: '본인과 세대구성원 모두의 최근 5년 주택 당첨 이력을 확인해 주세요.', answerKeys: ['applicant.householdNoWinningFiveYears'],
  },
};

const RAW_FACT_MAP: Record<string, SamdoRefinementFactId | undefined> = {
  currentResidence: 'currentResidence', residence: 'currentResidence',
  residenceStartDate: 'residenceMonths', overseasClear: 'longOverseasStay',
  accountMonths: 'accountOpenedAt', recognizedPaymentCount: 'paymentCount', recognizedDepositAmount: 'depositAmount', firstRank: 'firstRank',
  monthlyIncome: 'monthlyIncome', householdIncome: 'householdIncome', totalAssets: 'totalAssets', parentAssets: 'parentAssets',
  marriageDate: 'marriageDate',
  children: 'childBirthDate', childUnderTwo: 'childBirthDate', childbirth: 'childBirthDate', childbirthClear: 'childBirthDate', hasChildren: 'childBirthDate', hasChildUnder7: 'childBirthDate', unmarriedChildInHousehold: 'childBirthDate',
  householdNoHome: 'householdNoHome', noHome: 'householdNoHome',
  neverOwned: 'pastHomeOwnership', householdNeverOwned: 'pastHomeOwnership', housing: 'pastHomeOwnership',
  specialSupplyHistory: 'specialSupplyHistory', noSpecialSupplyHistory: 'specialSupplyHistory', specialHistory: 'specialSupplyHistory',
  reWinningRestriction: 'reWinningRestriction', noReWinningRestriction: 'reWinningRestriction', reWinning: 'reWinningRestriction',
  householdNoWinningFiveYears: 'householdNoWinningFiveYears', fiveYears: 'householdNoWinningFiveYears',
};

const STATE_LABELS: Record<SamdoResolutionState, string> = {
  DOES_NOT_KNOW: '모름으로 답함', UNKNOWN: '아직 답하지 않음', EVIDENCE_REQUIRED: '서류 확인 필요', CONDITIONAL: '조건 확인 필요',
};

const supplyLabel = (type: SamdoSupplyType): string => ({
  YOUTH: '청년 특별공급', NEWLYWED: '신혼부부 특별공급', FIRST_HOME: '생애최초 특별공급',
  NEWBORN: '신생아 특별공급', GENERAL: '일반공급', INSTITUTIONAL_RECOMMENDATION: '기관추천',
})[type];

const normalizeRawFact = (raw: string): string => raw.replace(/^(?:input|review|fact):/, '').split('.').at(-1) ?? raw;

function responseState(definition: Definition, answerStates: AnswerStateMap): SamdoResolutionState | null {
  const states = definition.answerKeys.map(key => answerStates[key]).filter(Boolean);
  return states.includes('DOES_NOT_KNOW') ? 'DOES_NOT_KNOW' : null;
}

export type SamdoResolutionItem = Definition & {
  currentState: SamdoResolutionState;
  currentLabel: string;
  affectedSupplyTypes: SamdoSupplyType[];
  affectedSupplyLabels: string[];
};

/** Raw engine facts are mapped once here; no internal fact key reaches the screen. */
export function buildSamdoResolutionCenter(
  recommendation: SamdoRecommendation,
  answerStates: AnswerStateMap,
): SamdoResolutionItem[] {
  const usage = new Map<SamdoRefinementFactId, { types: Set<SamdoSupplyType>; states: Set<SamdoResolutionState> }>();
  for (const evaluation of recommendation.evaluations) {
    if (!evaluation.autoRecommend || evaluation.eligibility === 'INELIGIBLE') continue;
    for (const raw of evaluation.missingFacts) {
      const id = RAW_FACT_MAP[normalizeRawFact(raw)];
      if (!id) continue;
      const definition = DEFINITIONS[id];
      const explicit = responseState(definition, answerStates);
      const inferred: SamdoResolutionState = explicit ?? (raw.startsWith('review:') ? 'EVIDENCE_REQUIRED' : evaluation.eligibility === 'CONDITIONAL' ? 'CONDITIONAL' : 'UNKNOWN');
      const current = usage.get(id) ?? { types: new Set<SamdoSupplyType>(), states: new Set<SamdoResolutionState>() };
      current.types.add(evaluation.supplyType);
      current.states.add(inferred);
      usage.set(id, current);
    }
  }
  const statePriority: SamdoResolutionState[] = ['DOES_NOT_KNOW', 'EVIDENCE_REQUIRED', 'CONDITIONAL', 'UNKNOWN'];
  return [...usage.entries()].map(([id, value]) => {
    const currentState = statePriority.find(state => value.states.has(state)) ?? 'UNKNOWN';
    const definition = DEFINITIONS[id];
    const affectedSupplyTypes = [...value.types];
    return {
      ...definition,
      currentState,
      currentLabel: STATE_LABELS[currentState],
      affectedSupplyTypes,
      affectedSupplyLabels: affectedSupplyTypes.map(supplyLabel),
    };
  });
}

const asNumber = (value: SamdoFactValue): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error('INVALID_NUMBER');
  return parsed;
};

const asDate = (value: SamdoFactValue): string => {
  const date = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw new Error('INVALID_DATE');
  return date;
};

const asBoolean = (value: SamdoFactValue): boolean => {
  if (typeof value !== 'boolean') throw new Error('INVALID_BOOLEAN');
  return value;
};

export type SamdoResolvedAnswers = { answers: KioskAnswers; answerKeys: string[] };

/** Applies an explicitly supplied real value. It never turns an unknown into a guessed value. */
export function applySamdoResolvedFact(answers: KioskAnswers, id: SamdoRefinementFactId, value: SamdoFactValue): SamdoResolvedAnswers {
  const next = structuredClone(answers);
  let answerKeys = [...DEFINITIONS[id].answerKeys];
  switch (id) {
    case 'currentResidence': next.applicant.livesInEventRegion = asBoolean(value); break;
    case 'residenceMonths': next.applicant.residenceMonths = asNumber(value); break;
    case 'longOverseasStay': next.applicant.longOverseasStay = asBoolean(value); break;
    case 'accountOpenedAt': next.subscription.openedAt = asDate(value); break;
    case 'paymentCount': next.subscription.paymentCount = asNumber(value); break;
    case 'depositAmount': next.subscription.depositAmount = asNumber(value); break;
    case 'firstRank': next.subscription.firstRank = asBoolean(value); break;
    case 'monthlyIncome': next.applicant.monthlyIncome = asNumber(value); break;
    case 'householdIncome': next.household.householdIncome = asNumber(value); break;
    case 'totalAssets':
      if (next.householdType === 'single') {
        next.adaptive.applicantTotalAssetsKrw = asNumber(value);
        answerKeys = ['adaptive.applicantTotalAssetsKrw'];
      } else {
        next.household.totalAssets = asNumber(value);
        answerKeys = ['household.totalAssets'];
      }
      break;
    case 'parentAssets':
      next.household.parentInformationStatus = 'KNOWN';
      next.household.parentAssets = asNumber(value);
      break;
    case 'marriageDate': next.household.marriageDate = asDate(value); break;
    case 'childBirthDate': {
      const date = asDate(value);
      const count = Math.max(1, next.household.childrenCount ?? 0);
      next.household.childrenCount = count;
      next.household.childBirthDates = Array.from({ length: count }, (_, index) => index === 0 ? date : next.household.childBirthDates[index] ?? '');
      next.household.childBirthYears = Array.from({ length: count }, (_, index) => index === 0 ? Number(date.slice(0, 4)) : next.household.childBirthYears[index] ?? null);
      answerKeys = ['household.childrenCount', 'household.childBirthDates.0'];
      break;
    }
    case 'householdNoHome': next.applicant.householdNoHome = asBoolean(value); break;
    case 'pastHomeOwnership': next.applicant.neverOwnedHome = !asBoolean(value); break;
    case 'specialSupplyHistory': next.applicant.specialSupplyHistory = asBoolean(value); break;
    case 'reWinningRestriction': next.applicant.reWinningRestriction = asBoolean(value); break;
    case 'householdNoWinningFiveYears': next.applicant.householdNoWinningFiveYears = asBoolean(value); break;
  }
  return { answers: next, answerKeys };
}

export const SAMDO_SIMULATION_FACTS: Array<{
  id: SamdoSimulationFactId;
  label: string;
  inputKind: SamdoInputKind;
  unit?: string;
  hint: string;
}> = [
  { id: 'residenceMonths', label: '제주 연속 거주기간', inputKind: 'NUMBER', unit: '개월', hint: '예: 24개월' },
  { id: 'accountOpenedAt', label: '청약통장 가입일', inputKind: 'DATE', hint: 'YYYY-MM-DD' },
  { id: 'paymentCount', label: '인정 납입횟수', inputKind: 'NUMBER', unit: '회', hint: '예: 24회' },
  { id: 'depositAmount', label: '인정 저축총액', inputKind: 'NUMBER', unit: '원', hint: '예: 600만원' },
  { id: 'monthlyIncome', label: '신청자 월평균소득', inputKind: 'NUMBER', unit: '원', hint: '공고 기준 월평균 금액' },
  { id: 'householdIncome', label: '세대 월평균소득', inputKind: 'NUMBER', unit: '원', hint: '공고 기준 세대 합계' },
  { id: 'totalAssets', label: '판정 대상 총자산', inputKind: 'NUMBER', unit: '원', hint: '현재 가구유형에 적용되는 자산' },
  { id: 'parentAssets', label: '부모 총자산', inputKind: 'NUMBER', unit: '원', hint: '청년 특별공급에만 사용' },
  { id: 'marriageDate', label: '혼인신고일', inputKind: 'DATE', hint: 'YYYY-MM-DD' },
  { id: 'childBirthDate', label: '자녀 생년월일', inputKind: 'DATE', hint: '2세 미만 여부를 날짜로 계산' },
  { id: 'noHomeSince', label: '세대 무주택 시작일', inputKind: 'DATE', hint: 'YYYY-MM-DD' },
  { id: 'specialSupplyHistory', label: '특별공급 당첨 이력', inputKind: 'BOOLEAN', hint: '있음/없음 가정' },
  { id: 'reWinningRestriction', label: '재당첨 제한 상태', inputKind: 'BOOLEAN', hint: '제한 중/제한 없음 가정' },
  { id: 'householdNoWinningFiveYears', label: '세대 최근 5년 무당첨', inputKind: 'BOOLEAN', hint: '해당/해당하지 않음 가정' },
];

export type SamdoSimulationOverrides = Partial<Record<SamdoSimulationFactId, SamdoFactValue>>;

function applySimulationOverride(input: AssessmentInput, id: SamdoSimulationFactId, value: SamdoFactValue): void {
  switch (id) {
    case 'residenceMonths': input.details.residenceStartDate = monthsBefore(asNumber(value), new Date(`${SAMDO_DEEP_RULE_PACKAGE.announcementDate}T00:00:00`)); break;
    case 'accountOpenedAt': input.details.subscriptionAccountOpenedAt = asDate(value); break;
    case 'paymentCount': input.details.recognizedPaymentCount = asNumber(value); break;
    case 'depositAmount': input.details.recognizedDepositAmount = asNumber(value); break;
    case 'monthlyIncome': input.details.monthlyIncome = asNumber(value); break;
    case 'householdIncome': input.details.householdIncome = asNumber(value); break;
    case 'totalAssets': input.details.totalAssets = asNumber(value); break;
    case 'parentAssets': input.details.parentAssets = asNumber(value); break;
    case 'marriageDate': {
      const date = asDate(value);
      input.details.marriageDate = date;
      input.details.firstMarriageDate = date;
      break;
    }
    case 'childBirthDate': {
      const date = asDate(value);
      const children = structuredClone(input.details.children ?? []);
      if (children.length) children[0] = { birthDate: date, unborn: false };
      else children.push({ birthDate: date, unborn: false });
      input.details.children = children;
      break;
    }
    case 'noHomeSince': input.details.noHomeSince = asDate(value); break;
    case 'specialSupplyHistory': input.details.specialSupplyHistory = asBoolean(value); break;
    case 'reWinningRestriction': input.details.reWinningRestriction = asBoolean(value); break;
    case 'householdNoWinningFiveYears': input.details.householdNoWinningFiveYears = asBoolean(value); break;
  }
}

const scoreText = (score: SamdoOfficialScore): string => score.status === 'AVAILABLE'
  ? `${score.total}/${score.max}점`
  : score.status === 'NOT_APPLICABLE' ? '해당 없음' : '확인 필요';

const eligibleTypes = (result: SamdoRecommendation): SamdoSupplyType[] => result.evaluations
  .filter(item => item.autoRecommend && item.eligibility === 'ELIGIBLE')
  .map(item => item.supplyType);

const unresolvedCount = (result: SamdoRecommendation): number => new Set(result.evaluations
  .filter(item => item.autoRecommend && item.eligibility !== 'INELIGIBLE')
  .flatMap(item => item.missingFacts)).size;

export type SamdoSimulationDiff = {
  recommendedType: { before: string; after: string; changed: boolean };
  eligibility: Array<{ supplyType: SamdoSupplyType; label: string; before: SamdoEligibility; after: SamdoEligibility }>;
  priorityStage: { before: string; after: string; changed: boolean };
  officialScore: { before: string; after: string; changed: boolean };
  alternatives: { before: string[]; after: string[] };
  newlyEligibleTypes: string[];
  noLongerEligibleTypes: string[];
  unresolvedCount: { before: number; after: number };
};

export type SamdoSimulationResult = {
  baseline: SamdoRecommendation;
  overrides: SamdoSimulationOverrides;
  simulatedResult: SamdoRecommendation;
  diffs: SamdoSimulationDiff;
};

function focus(result: SamdoRecommendation) {
  return result.recommendedType ?? result.alternatives[0] ?? result.lowerPriorityTypes[0] ?? null;
}

const stageText = (item: ReturnType<typeof focus>): string => item?.stage
  ? SAMDO_STAGE_LABELS[item.stage]
  : '확인 필요';

export function simulateSamdoRecommendation(answers: KioskAnswers, overrides: SamdoSimulationOverrides): SamdoSimulationResult {
  const baselineInput = samdoInputFromAnswers(answers);
  const baseline = buildSamdoRecommendation(samdoRules(), baselineInput);
  const simulatedInput = structuredClone(baselineInput);
  for (const [id, value] of Object.entries(overrides) as Array<[SamdoSimulationFactId, SamdoFactValue | undefined]>) {
    if (value !== undefined) applySimulationOverride(simulatedInput, id, value);
  }
  const simulatedResult = buildSamdoRecommendation(samdoRules(), simulatedInput);
  const beforeFocus = focus(baseline);
  const afterFocus = focus(simulatedResult);
  const beforeEligible = new Set(eligibleTypes(baseline));
  const afterEligible = new Set(eligibleTypes(simulatedResult));
  const beforeEvaluations = new Map(baseline.evaluations.map(item => [item.supplyType, item]));
  const eligibility = simulatedResult.evaluations.flatMap(after => {
    const before = beforeEvaluations.get(after.supplyType);
    return before && before.eligibility !== after.eligibility
      ? [{ supplyType: after.supplyType, label: after.supplyLabel, before: before.eligibility, after: after.eligibility }]
      : [];
  });
  const beforeName = beforeFocus?.supplyLabel ?? '추천 유형 없음';
  const afterName = afterFocus?.supplyLabel ?? '추천 유형 없음';
  const beforeStage = stageText(beforeFocus);
  const afterStage = stageText(afterFocus);
  const beforeScore = beforeFocus ? scoreText(beforeFocus.officialScore) : '확인 필요';
  const afterScore = afterFocus ? scoreText(afterFocus.officialScore) : '확인 필요';
  return {
    baseline,
    overrides: structuredClone(overrides),
    simulatedResult,
    diffs: {
      recommendedType: { before: beforeName, after: afterName, changed: beforeName !== afterName },
      eligibility,
      priorityStage: { before: beforeStage, after: afterStage, changed: beforeStage !== afterStage },
      officialScore: { before: beforeScore, after: afterScore, changed: beforeScore !== afterScore },
      alternatives: {
        before: [...baseline.alternatives, ...baseline.lowerPriorityTypes].map(item => item.supplyLabel),
        after: [...simulatedResult.alternatives, ...simulatedResult.lowerPriorityTypes].map(item => item.supplyLabel),
      },
      newlyEligibleTypes: [...afterEligible].filter(type => !beforeEligible.has(type)).map(supplyLabel),
      noLongerEligibleTypes: [...beforeEligible].filter(type => !afterEligible.has(type)).map(supplyLabel),
      unresolvedCount: { before: unresolvedCount(baseline), after: unresolvedCount(simulatedResult) },
    },
  };
}
