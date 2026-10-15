import { assessApplication } from '../../applicationAssessment/engine.ts';
import { completedMonths, validDate } from '../../applicationAssessment/facts.ts';
import type { AnnouncementRules, ApplicationAssessmentResult, AssessmentInput, Evidence, Scalar, SupplyType } from '../../applicationAssessment/types.ts';
import { humanizeAll } from '../presentation.ts';
import { SAMDO_DEEP_RULE_PACKAGE } from './rulePackage.ts';
import type {
  SamdoEligibility,
  SamdoDeepRulePackage,
  SamdoOfficialScore,
  SamdoRecommendation,
  SamdoRecommendationItem,
  SamdoStage,
  SamdoSupplyEvaluation,
  SamdoSupplyType,
} from './types.ts';

const TYPE_MAP: Record<SupplyType, SamdoSupplyType> = { youth: 'YOUTH', newlywed: 'NEWLYWED', firstHome: 'FIRST_HOME' };

type Check = { value: boolean | null; fact: string; pass: string; fail: string; evidence?: string };

const known = <T>(field: { status: string; value?: T }): T | undefined => field.status === 'known' ? field.value : undefined;
const unique = (items: Array<string | undefined>) => [...new Set(items.filter((item): item is string => Boolean(item)))];

function incomeLimit(rules: AnnouncementRules, size: number | undefined, percent: number): number | undefined {
  if (!Number.isInteger(size) || size! < 1) return undefined;
  const normalized = Math.max(3, size!);
  const direct = rules.parameters[`income.${Math.min(8, normalized)}.${percent}`];
  if (normalized <= 8 && typeof direct === 'number') return direct;
  const base = rules.parameters[`income.${Math.min(8, normalized)}.100`];
  if (typeof base !== 'number') return undefined;
  // HWP <표5>: 8인을 초과하면 100% 기준 1명당 702,038원을 더한 뒤 비율을 적용한다.
  const baseForSize = base + Math.max(0, normalized - 8) * 702_038;
  return Math.round(baseForSize * percent / 100);
}

function postBirthCount(input: AssessmentInput, cutoff: string): number | undefined {
  const children = input.details.children;
  if (!children) return undefined;
  if (children.some(child => !child.unborn && !validDate(child.birthDate))) return undefined;
  return children.filter(child => child.unborn || child.birthDate! >= cutoff).length;
}

function childUnderTwo(input: AssessmentInput): boolean | undefined {
  const children = input.details.children;
  if (!children) return undefined;
  if (children.some(child => !child.unborn && !validDate(child.birthDate))) return undefined;
  return children.some(child => child.unborn || child.birthDate! >= '2024-10-27');
}

function minorChildren(input: AssessmentInput): number | undefined {
  const children = input.details.children;
  if (!children) return undefined;
  if (children.some(child => !child.unborn && !validDate(child.birthDate))) return undefined;
  return children.filter(child => child.unborn || child.birthDate! > '2007-10-27').length;
}

function householdNoHome(input: AssessmentInput): boolean | undefined {
  const applicant = known(input.profile.housing.currentOwnership);
  const household = known(input.profile.housing.householdHasHome);
  if (applicant === 'owns-home' || household === true) return false;
  return applicant === undefined || household === undefined ? undefined : true;
}

function baseChecks(input: AssessmentInput, kind: 'NEWBORN' | 'GENERAL'): Check[] {
  const account = known(input.profile.subscriptionAccount.hasAccount);
  const noHome = householdNoHome(input);
  const residence = input.details.currentResidence || input.profile.residence.currentRegion;
  const exceptionKnown = input.details.specialExceptions;
  const hasChildException = (postBirthCount(input, '2024-06-19') ?? 0) > 0;
  const noSpecialHistory = input.details.specialSupplyHistory === undefined ? null : !input.details.specialSupplyHistory;
  return [
    { value: residence ? residence.includes('제주') : null, fact: 'currentResidence', pass: '공고일 현재 제주 거주', fail: '공고일 현재 제주 거주자가 아니에요.' },
    {
      value: noHome ?? null,
      fact: 'householdNoHome',
      pass: '세대 전체 무주택',
      fail: '세대에 주택 보유자가 있어 무주택 요건을 충족하지 못해요.',
      evidence: kind === 'NEWBORN' && noHome === false && hasChildException ? '2024년 6월 19일 이후 출산특례와 기존 주택 처분조건 확인이 필요해요.' : undefined,
    },
    { value: account ?? null, fact: 'hasAccount', pass: '청약통장 보유', fail: '청약통장이 없어 신청할 수 없어요.' },
    { value: input.details.reWinningRestriction === undefined ? null : !input.details.reWinningRestriction, fact: 'reWinningRestriction', pass: '재당첨 제한 없음', fail: '재당첨 또는 부적격 당첨 제한기간에는 신청할 수 없어요.' },
    ...(kind === 'NEWBORN' ? [{
      value: noSpecialHistory,
      fact: 'specialSupplyHistory',
      pass: '특별공급 당첨 이력 없음',
      fail: '세대의 특별공급 당첨 이력 때문에 신청할 수 없어요.',
      evidence: noSpecialHistory === false && hasChildException ? '출산특례로 특별공급 이력 예외를 적용할 수 있는지 서류 확인이 필요해요.' : undefined,
    } satisfies Check] : []),
    {
      value: exceptionKnown === undefined ? null : exceptionKnown.length === 0,
      fact: 'specialExceptions',
      pass: '별도 특례 검토사항 없음',
      fail: '특례 적용 여부를 공고문과 증빙으로 확인해야 해요.',
      evidence: exceptionKnown?.length ? '입력한 혼인·출산·군복무 특례의 적용 여부를 서류로 확인해야 해요.' : undefined,
    },
  ];
}

function classify(checks: Check[], extraMissing: string[], evidenceRequired: string[]): SamdoEligibility {
  const hardFail = checks.some(check => check.value === false && !check.evidence);
  if (hardFail) return 'INELIGIBLE';
  if (checks.some(check => check.value === null) || extraMissing.length) return 'CONDITIONAL';
  if (checks.some(check => check.value === false && check.evidence) || evidenceRequired.some(item => item.startsWith('특례:'))) return 'EVIDENCE_REQUIRED';
  return 'ELIGIBLE';
}

function newbornScore(input: AssessmentInput, rules: AnnouncementRules, deepPackage: SamdoDeepRulePackage): SamdoOfficialScore {
  const size = input.details.incomeHouseholdSize ?? known(input.profile.household.memberCount);
  const income = input.details.householdIncome;
  const dual = input.details.dualIncome;
  const low = dual === undefined ? undefined : incomeLimit(rules, size, dual ? 80 : 70);
  const middle = dual === undefined ? undefined : incomeLimit(rules, size, dual ? 110 : 100);
  const incomePoints = income === undefined || low === undefined || middle === undefined ? undefined : income <= low ? 3 : income <= middle ? 2 : 1;
  const childCount = minorChildren(input);
  const childPoints = childCount === undefined ? undefined : Math.min(3, childCount);
  const residenceMonths = completedMonths(input.details.residenceStartDate, deepPackage.announcementDate);
  const residencePoints = residenceMonths === undefined ? undefined : residenceMonths >= 24 ? 3 : residenceMonths >= 12 ? 2 : residenceMonths >= 0 ? 1 : 0;
  const payment = input.details.recognizedPaymentCount;
  const paymentPoints = payment === undefined ? undefined : payment >= 24 ? 3 : payment >= 12 ? 2 : payment >= 6 ? 1 : 0;
  if ([incomePoints, childPoints, residencePoints, paymentPoints].some(value => value === undefined)) return { status: 'PENDING' };
  const evidenceId = deepPackage.supplies.find(item => item.supplyType === 'NEWBORN')?.rules.find(rule => rule.category === 'SCORE')?.evidence.id;
  if (!evidenceId) return { status: 'PENDING' };
  const breakdown = [
    { label: '세대 월평균소득', points: incomePoints!, max: 3, evidenceId },
    { label: '미성년 자녀 수', points: childPoints!, max: 3, evidenceId },
    { label: '제주 연속 거주기간', points: residencePoints!, max: 3, evidenceId },
    { label: '청약통장 인정 납입횟수', points: paymentPoints!, max: 3, evidenceId },
  ];
  return { status: 'AVAILABLE', total: breakdown.reduce((sum, item) => sum + item.points, 0), max: 12, breakdown };
}

function assetCheck(input: AssessmentInput): { check: Check; evidence: string[] } {
  const amount = input.details.totalAssets;
  const recent = postBirthCount(input, '2023-03-28');
  if (amount === undefined) return { check: { value: null, fact: 'totalAssets', pass: '', fail: '세대 총자산을 확인해야 해요.' }, evidence: [] };
  if (amount <= 362_000_000) return { check: { value: true, fact: 'totalAssets', pass: '세대 총자산 기본기준 충족', fail: '' }, evidence: [] };
  const relaxed = recent === undefined ? undefined : recent >= 2 ? 431_000_000 : recent === 1 ? 397_000_000 : 362_000_000;
  if (relaxed === undefined) return { check: { value: null, fact: 'children', pass: '', fail: '출산가구 자산 완화 여부를 확인해야 해요.' }, evidence: [] };
  if (amount <= relaxed && recent! > 0) return {
    check: { value: false, fact: 'totalAssets', pass: '', fail: '기본 자산기준을 초과해요.', evidence: '출산가구 완화 자산기준 적용 증빙이 필요해요.' },
    evidence: ['특례: 출생·입양·임신 서류로 출산가구 자산기준 완화 적용을 확인해요.'],
  };
  return { check: { value: false, fact: 'totalAssets', pass: '', fail: '세대 총자산이 적용 가능한 공고 기준을 초과해요.' }, evidence: [] };
}

function incomeCheck(input: AssessmentInput, rules: AnnouncementRules, singlePercent: number, dualPercent: number, allowBirthRelaxation = false): Check {
  const size = input.details.incomeHouseholdSize ?? known(input.profile.household.memberCount);
  const income = input.details.householdIncome;
  const dual = input.details.dualIncome;
  const limit = dual === undefined ? undefined : incomeLimit(rules, size, dual ? dualPercent : singlePercent);
  if (income === undefined || dual === undefined || limit === undefined) return { value: null, fact: 'householdIncome', pass: '', fail: '세대 월평균소득과 맞벌이 여부를 확인해야 해요.' };
  if (income <= limit) return { value: true, fact: 'householdIncome', pass: `세대소득 ${dual ? dualPercent : singlePercent}% 기준 충족`, fail: '' };
  const recent = allowBirthRelaxation ? postBirthCount(input, '2023-03-28') : 0;
  if (allowBirthRelaxation && recent === undefined) return { value: null, fact: 'children', pass: '', fail: '출산가구 소득기준 완화 여부를 확인해야 해요.' };
  const points = recent! >= 2 ? 20 : recent === 1 ? 10 : 0;
  const relaxed = points ? incomeLimit(rules, size, (dual ? dualPercent : singlePercent) + points) : limit;
  if (points && relaxed !== undefined && income <= relaxed) return {
    value: false,
    fact: 'householdIncome',
    pass: '',
    fail: '기본 소득기준을 초과해요.',
    evidence: '출산가구 소득기준 완화 적용 증빙이 필요해요.',
  };
  return { value: false, fact: 'householdIncome', pass: '', fail: '세대 월평균소득이 해당 단계 기준을 초과해요.' };
}

function evaluateNewborn(input: AssessmentInput, rules: AnnouncementRules, deepPackage: SamdoDeepRulePackage): SamdoSupplyEvaluation {
  const supply = deepPackage.supplies.find(item => item.supplyType === 'NEWBORN')!;
  const assets = assetCheck(input);
  const checks = [
    ...baseChecks(input, 'NEWBORN'),
    { value: childUnderTwo(input) ?? null, fact: 'childUnderTwo', pass: '2세 미만 자녀 또는 태아 있음', fail: '공고일 현재 2세 미만 자녀 또는 태아가 없어요.' },
    { value: input.details.subscriptionAccountOpenedAt ? (completedMonths(input.details.subscriptionAccountOpenedAt, deepPackage.announcementDate) ?? -1) >= 6 : null, fact: 'accountMonths', pass: '청약통장 가입 6개월 이상', fail: '청약통장 가입기간이 6개월 미만이에요.' },
    { value: input.details.recognizedPaymentCount === undefined ? null : input.details.recognizedPaymentCount >= 6, fact: 'recognizedPaymentCount', pass: '청약통장 6회 이상 납입', fail: '청약통장 인정 납입횟수가 6회 미만이에요.' },
    assets.check,
    incomeCheck(input, rules, 140, 200, true),
  ];
  const priority = incomeCheck(input, rules, 100, 120);
  const general = incomeCheck(input, rules, 140, 150);
  const missing = checks.filter(check => check.value === null).map(check => check.fact);
  const evidenceRequired = unique([
    ...assets.evidence,
    input.details.children?.some(child => child.unborn) ? '임신진단서와 입주 시 출산 관련 서류가 필요해요.' : undefined,
    input.details.children?.some(child => !child.unborn) ? '가족관계증명서와 양육사실 증빙을 확인해요.' : undefined,
    ...checks.filter(check => check.value === false && check.evidence).map(check => `특례: ${check.evidence}`),
  ]);
  const eligibility = classify(checks, missing, evidenceRequired);
  const stage: SamdoStage | null = eligibility !== 'ELIGIBLE' || priority.value === null || general.value === null ? null
    : priority.value ? 'PRIORITY' : general.value ? 'GENERAL' : 'LOTTERY';
  const stageLabel = stage === 'PRIORITY' ? '1단계 우선공급(70%)' : stage === 'GENERAL' ? '2단계 일반공급(20%)' : stage === 'LOTTERY' ? '3단계 잔여 추첨공급' : '추가 정보 확인 후 단계 결정';
  return {
    supplyType: 'NEWBORN', supplyLabel: supply.label, eligibility, stage, stageLabel,
    officialScore: stage === 'PRIORITY' || stage === 'GENERAL' ? newbornScore(input, rules, deepPackage) : stage === 'LOTTERY' ? { status: 'NOT_APPLICABLE' } : { status: 'PENDING' },
    supplyCount: supply.supplyCount, applicationDate: deepPackage.applicationDates.special,
    matchedAdvantages: unique([
      ...checks.filter(check => check.value === true).map(check => check.pass),
      stage === 'PRIORITY' ? '공급물량 70% 우선공급 단계' : undefined,
      `${deepPackage.title.includes('2지구') ? '2지구' : '1지구'} 배정 ${supply.supplyCount}세대`,
    ]),
    cautions: unique(['가점 동점자는 추첨으로 선정해요.', '공급량은 추천 근거 중 하나일 뿐 당첨확률을 뜻하지 않아요.']),
    evidenceRequired,
    reasons: unique([stageLabel, ...checks.filter(check => check.value === true).map(check => check.pass)]),
    failedReasons: checks.filter(check => check.value === false && !check.evidence).map(check => check.fail),
    missingFacts: missing,
    evidence: supply.rules.map(rule => rule.evidence), autoRecommend: true,
  };
}

function evaluateGeneral(input: AssessmentInput, rules: AnnouncementRules, deepPackage: SamdoDeepRulePackage): SamdoSupplyEvaluation {
  const supply = deepPackage.supplies.find(item => item.supplyType === 'GENERAL')!;
  const assets = assetCheck(input);
  const checks = [...baseChecks(input, 'GENERAL'), assets.check, incomeCheck(input, rules, 100, 200, true)];
  const accountMonths = input.details.subscriptionAccountOpenedAt ? completedMonths(input.details.subscriptionAccountOpenedAt, deepPackage.announcementDate) : undefined;
  const firstRankFacts = [
    accountMonths === undefined ? null : accountMonths >= 6,
    input.details.recognizedPaymentCount === undefined ? null : input.details.recognizedPaymentCount >= 6,
    input.details.isHouseholdHead ?? null,
    input.details.householdNoWinningFiveYears ?? null,
  ];
  const explicitRank = input.details.firstRank;
  const firstRank = explicitRank === undefined ? (firstRankFacts.some(value => value === null) ? null : firstRankFacts.every(Boolean)) : explicitRank;
  const newborn = childUnderTwo(input);
  const newbornIncome = incomeCheck(input, rules, 100, 140);
  const priorityIncome = incomeCheck(input, rules, 100, 140);
  const missing = unique([
    ...checks.filter(check => check.value === null).map(check => check.fact),
    firstRank === null ? 'firstRank' : undefined,
  ]);
  const evidenceRequired = unique([
    ...assets.evidence,
    ...checks.filter(check => check.value === false && check.evidence).map(check => `특례: ${check.evidence}`),
    newborn && input.details.children?.some(child => child.unborn) ? '신생아 우선공급은 임신·출산 증빙을 확인해요.' : undefined,
  ]);
  const eligibility = classify(checks, missing, evidenceRequired);
  const stage: SamdoStage | null = eligibility !== 'ELIGIBLE' || firstRank === null ? null
    : newborn && newbornIncome.value === true ? 'NEWBORN_PRIORITY'
      : firstRank && priorityIncome.value === true ? 'FIRST_RANK_PRIORITY'
        : firstRank ? 'GENERAL' : 'SECOND_RANK';
  const noHomeMonths = input.details.noHomeSince ? completedMonths(input.details.noHomeSince, deepPackage.announcementDate) : undefined;
  const sequence = firstRank ? (noHomeMonths === undefined ? '1순위 내 무주택기간 확인 필요' : noHomeMonths >= 36 ? '1순위·무주택 3년 이상·저축총액 순차' : '1순위·저축총액 순차') : '2순위·동일지역 경쟁 시 추첨';
  const stageLabel = stage === 'NEWBORN_PRIORITY' ? '1단계 신생아 우선공급(50%)'
    : stage === 'FIRST_RANK_PRIORITY' ? '2단계 1순위 우선공급(30%)'
      : stage === 'GENERAL' ? '3단계 잔여 추첨공급(1순위)'
        : stage === 'SECOND_RANK' ? '3단계 잔여 추첨공급(2순위)' : '추가 정보 확인 후 단계 결정';
  return {
    supplyType: 'GENERAL', supplyLabel: supply.label, eligibility, stage, stageLabel,
    officialScore: { status: 'NOT_APPLICABLE' }, supplyCount: supply.supplyCount,
    applicationDate: firstRank === false ? deepPackage.applicationDates.generalSecond : deepPackage.applicationDates.generalFirst,
    matchedAdvantages: unique([
      ...checks.filter(check => check.value === true).map(check => check.pass),
      firstRank ? '일반공급 1순위' : undefined,
      firstRank && noHomeMonths !== undefined && noHomeMonths >= 36 ? '무주택기간 3년 이상' : undefined,
      input.details.recognizedDepositAmount !== undefined ? '저축총액 확인 가능' : undefined,
    ]),
    cautions: unique([sequence, '일반공급은 공식 점수제가 아니며 선정순차와 추첨을 적용해요.', '공급량을 당첨확률로 해석하지 않아요.']),
    evidenceRequired,
    reasons: unique([stageLabel, sequence, ...checks.filter(check => check.value === true).map(check => check.pass)]),
    failedReasons: checks.filter(check => check.value === false && !check.evidence).map(check => check.fail),
    missingFacts: missing,
    evidence: supply.rules.map(rule => rule.evidence), autoRecommend: true,
  };
}

function mapGeneric(result: ApplicationAssessmentResult, deepPackage: SamdoDeepRulePackage): SamdoSupplyEvaluation {
  const type = TYPE_MAP[result.supplyType];
  const supply = deepPackage.supplies.find(item => item.supplyType === type)!;
  const hasInputMissing = result.missingInformation.some(item => item.startsWith('input:'));
  // A separate review item must not hide an already-proven hard failure in the generic engine result.
  const eligibility: SamdoEligibility = result.failedConditions.length ? 'INELIGIBLE'
    : result.status === 'ELIGIBLE' ? 'ELIGIBLE' : result.status === 'INELIGIBLE' ? 'INELIGIBLE'
      : hasInputMissing ? 'CONDITIONAL' : 'EVIDENCE_REQUIRED';
  const score: SamdoOfficialScore = result.scoring === 'AVAILABLE' && result.score ? {
    status: 'AVAILABLE', total: result.score.total, max: result.score.max,
    breakdown: result.score.breakdown.map(item => ({ label: item.label, points: item.points, max: item.max, evidenceId: item.evidenceId })),
  } : result.scoring === 'NOT_APPLICABLE' ? { status: 'NOT_APPLICABLE' } : { status: 'PENDING' };
  const stage = result.stage as SamdoStage | null;
  return {
    supplyType: type, supplyLabel: supply.label, eligibility, stage,
    stageLabel: result.stageExplanation, officialScore: score, supplyCount: supply.supplyCount,
    applicationDate: deepPackage.applicationDates.special,
    matchedAdvantages: unique([
      ...result.satisfiedConditions.map(item => item.label),
      score.status === 'AVAILABLE' ? `공식 가점 ${score.total}/${score.max}점` : undefined,
    ]),
    cautions: humanizeAll(result.warnings),
    evidenceRequired: unique(result.requiredDocuments),
    reasons: unique([result.stageExplanation, ...result.satisfiedConditions.map(item => item.label)]),
    failedReasons: result.failedConditions.map(item => item.label),
    missingFacts: result.missingInformation,
    evidence: result.evidence, autoRecommend: true,
  };
}

const STATUS_WEIGHT: Record<SamdoEligibility, number> = { ELIGIBLE: 4, EVIDENCE_REQUIRED: 3, CONDITIONAL: 2, INELIGIBLE: 0 };
const STAGE_WEIGHT: Record<SamdoStage, number> = {
  PRIORITY: 6, NEWBORN_PRIORITY: 6, FIRST_RANK_PRIORITY: 5, GENERAL: 4, LOTTERY: 3, SECOND_RANK: 2, INFORMATION_ONLY: 0,
};
const ORDER: SamdoSupplyType[] = ['YOUTH', 'NEWLYWED', 'FIRST_HOME', 'NEWBORN', 'GENERAL'];

function compare(a: SamdoSupplyEvaluation, b: SamdoSupplyEvaluation): number {
  const score = (item: SamdoSupplyEvaluation) => item.officialScore.status === 'AVAILABLE' ? item.officialScore.total : -1;
  return STATUS_WEIGHT[b.eligibility] - STATUS_WEIGHT[a.eligibility]
    || STAGE_WEIGHT[b.stage ?? 'INFORMATION_ONLY'] - STAGE_WEIGHT[a.stage ?? 'INFORMATION_ONLY']
    || score(b) - score(a)
    || b.matchedAdvantages.length - a.matchedAdvantages.length
    || b.supplyCount - a.supplyCount
    || a.evidenceRequired.length - b.evidenceRequired.length
    || ORDER.indexOf(a.supplyType) - ORDER.indexOf(b.supplyType);
}

/** Existing assessment semantics are delegated unchanged for youth/newlywed/first-home. */
export function buildSamdoRecommendationForPackage(
  rules: AnnouncementRules,
  input: AssessmentInput,
  deepPackage: SamdoDeepRulePackage,
): SamdoRecommendation {
  if (rules.id !== deepPackage.baseRuleSetId
    || rules.provenance?.announcementId !== deepPackage.announcementId
    || rules.provenance?.documentId !== deepPackage.document.id) {
    throw new Error('Samdo rule package is not bound to this listing');
  }
  const generic = assessApplication(rules, input).map(result => mapGeneric(result, deepPackage));
  const all = [...generic, evaluateNewborn(input, rules, deepPackage), evaluateGeneral(input, rules, deepPackage)];
  const ranked = [...all].sort(compare).map((item, index) => ({ ...item, rank: index + 1 }));
  const auto = ranked.filter(item => item.autoRecommend);
  const recommendedType = auto.find(item => item.eligibility === 'ELIGIBLE') ?? null;
  return {
    listingId: deepPackage.listingId,
    sourceStatus: deepPackage.sourceStatus,
    recommendedType,
    alternatives: auto.filter(item => item !== recommendedType && ['ELIGIBLE', 'EVIDENCE_REQUIRED'].includes(item.eligibility)),
    lowerPriorityTypes: auto.filter(item => item.eligibility === 'CONDITIONAL'),
    rejectedTypes: auto.filter(item => item.eligibility === 'INELIGIBLE'),
    informationOnlyTypes: ranked.filter(item => !item.autoRecommend),
    evaluations: ranked,
  };
}

/** Backwards-compatible 1지구 entry point. */
export function buildSamdoRecommendation(rules: AnnouncementRules, input: AssessmentInput): SamdoRecommendation {
  return buildSamdoRecommendationForPackage(rules, input, SAMDO_DEEP_RULE_PACKAGE);
}

export function samdoScalarFacts(input: AssessmentInput): Record<string, Scalar | null> {
  return {
    currentResidence: input.details.currentResidence ?? null,
    residenceStartDate: input.details.residenceStartDate ?? null,
    accountOpenedAt: input.details.subscriptionAccountOpenedAt ?? null,
    recognizedPaymentCount: input.details.recognizedPaymentCount ?? null,
    recognizedDepositAmount: input.details.recognizedDepositAmount ?? null,
    householdIncome: input.details.householdIncome ?? null,
    totalAssets: input.details.totalAssets ?? null,
    parentAssets: input.details.parentAssets ?? null,
    dualIncome: input.details.dualIncome ?? null,
  };
}
