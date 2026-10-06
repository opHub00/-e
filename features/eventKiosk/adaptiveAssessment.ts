import type { EvaluationResult } from './frozen/domain/evaluation.ts';
import type { Expression, FrozenListingDataset, SupplyRuleSet } from './frozen/domain/rules.ts';
import type { AdaptiveInfo, KioskAnswers } from './model.ts';

export type FactClassification = 'CORE' | 'CONDITIONAL' | 'EVIDENCE_ONLY';
export type FactScope = 'APPLICANT' | 'SPOUSE' | 'HOUSEHOLD';
export type FactCoverage = 'FULL' | 'PARTIAL' | 'NONE';
export type FactRequirement = 'REQUIRED' | 'CONDITIONAL';
export type FactDataType = 'BOOLEAN' | 'NUMBER' | 'DATE' | 'ENUM';

export type FactInventoryRow = {
  factKey: string;
  dataType: FactDataType;
  requirement: FactRequirement;
  combinations: string[];
  kioskAnswers: FactCoverage;
  uiInput: FactCoverage;
  scope: FactScope;
  classification: FactClassification;
  question: string;
};

export type AdaptiveQuestionKind = 'BOOLEAN' | 'NUMBER' | 'SELECT';
export type AdaptiveQuestion = {
  id: keyof AdaptiveInfo;
  kind: AdaptiveQuestionKind;
  title: string;
  hint: string;
  unit?: string;
  unitScale?: number;
  options?: ReadonlyArray<{ value: string | null; label: string; hint?: string }>;
  sourceFacts: string[];
  combinations: string[];
};

export type AdaptiveQuestionPlan = {
  questions: AdaptiveQuestion[];
  evidenceOnlyFacts: string[];
  excludedIneligible: string[];
};

const BOOLEAN_FACTS = new Set([
  'applicant.isJejuResident', 'household.allNoHome', 'household.dualIncome',
  'event.eligibleResident', 'event.currentProgramTenant', 'event.collegeStudent',
  'event.jobSeekerWithinTwoYears', 'event.isHousingBenefitRecipient',
  'event.marriageBeforeMoveIn', 'event.supportedSingleParent', 'event.lhCollegeIncomeEligible',
]);

const ENUM_FACTS = new Set([
  'profile.composition', 'applicant.maritalStatus', 'event.benefitCategory',
  'event.generalRentalPriorityCategory',
]);

const FULL_COVERAGE = new Set([
  'applicant.age', 'applicant.currentHomeCount', 'applicant.isJejuResident',
  'applicant.maritalStatus', 'applicant.monthlyIncomeKrw', 'applicant.recognizedPaymentCount',
  'applicant.residenceMonths', 'family.marriageMonths', 'household.allNoHome',
  'household.dependentCount', 'household.memberCount', 'household.monthlyIncomeKrw',
  'household.totalAssetsKrw', 'profile.composition', 'event.marriageBeforeMoveIn',
  'event.supportedSingleParent',
]);

const PARTIAL_COVERAGE = new Set([
  'applicant.totalAssetsKrw', 'event.applicantParentTotalAssetsKrw', 'household.childUnder7Count',
  'household.dualIncome', 'household.minorChildCount', 'household.newbornCountWithinTwoYears',
  'household.post20230328ChildCount',
]);

const EVIDENCE_ONLY_FACTS = new Set([
  'event.applicantDisabilityPoints', 'event.generalRentalPriorityCategory',
  'event.lhCollegeIncomeEligible', 'event.rentBurdenPercent', 'score.applicantDisabled',
  'score.housingVulnerable', 'score.parentNoHome', 'score.severeDisability',
  'score.supportsSeniorParent', 'score.youthIncomeUnderHalf',
]);

const QUESTION_TEXT: Record<string, string> = {
  'applicant.age': '신청자의 정확한 생년월일은 언제인가요?',
  'applicant.currentHomeCount': '신청자 본인이 현재 보유한 주택이 있나요?',
  'applicant.isJejuResident': '현재 제주특별자치도에 거주하고 있나요?',
  'applicant.maritalStatus': '현재 혼인 상태는 어떻게 되나요?',
  'applicant.monthlyIncomeKrw': '신청자 본인의 월평균 소득은 얼마인가요?',
  'applicant.recognizedPaymentCount': '청약통장 인정 납입 횟수는 몇 회인가요?',
  'applicant.residenceMonths': '제주에 계속 거주한 기간은 몇 개월인가요?',
  'applicant.totalAssetsKrw': '신청자 본인의 총자산은 얼마인가요?',
  'event.applicantDisabilityPoints': '공고 기준 장애인 가점은 몇 점인가요?',
  'event.applicantParentMaxVehicleValueKrw': '본인과 부모님의 차량 중 가장 높은 차량가액은 얼마인가요?',
  'event.applicantParentMonthlyIncomeKrw': '본인과 부모님의 월평균 소득 합계는 얼마인가요?',
  'event.applicantParentTotalAssetsKrw': '본인과 부모님의 총자산 합계는 얼마인가요?',
  'event.benefitCategory': '현재 해당하는 복지급여 또는 지원 자격이 있나요?',
  'event.collegeStudent': '현재 대학생이거나 입학·복학 예정인가요?',
  'event.currentProgramTenant': '현재 동일 지자체 청년매입임대에 계약·거주 중인가요?',
  'event.eligibleResident': '국적 또는 외국인등록 기준상 신청 가능한 거주자인가요?',
  'event.generalRentalPriorityCategory': '일반 매입임대의 공식 우선순위 증빙이 있나요?',
  'event.isHousingBenefitRecipient': '현재 주거급여 수급자인가요?',
  'event.jobSeekerWithinTwoYears': '졸업·중퇴 후 2년 이내의 취업준비생인가요?',
  'event.lhCollegeIncomeEligible': '본인·부모 합산 소득이 공고 기준 이하임을 확인했나요?',
  'event.marriageBeforeMoveIn': '입주 전까지 혼인 사실을 증명할 수 있나요?',
  'event.rentBurdenPercent': '월 소득 대비 임차료 부담률은 몇 퍼센트인가요?',
  'event.supportedSingleParent': '한부모가족 증명서를 발급받을 수 있나요?',
  'event.workHistoryMonths': '소득이 있는 업무에 종사한 기간은 몇 개월인가요?',
  'family.marriageMonths': '혼인신고일은 언제인가요?',
  'household.allNoHome': '본인과 세대원 모두 현재 무주택인가요?',
  'household.childUnder7Count': '자녀의 정확한 생년월일은 언제인가요?',
  'household.dependentCount': '신청자를 제외한 부양가족은 몇 명인가요?',
  'household.dualIncome': '신청자와 배우자 모두 소득이 있나요?',
  'household.maxVehicleValueKrw': '세대가 보유한 차량 중 가장 높은 차량가액은 얼마인가요?',
  'household.memberCount': '신청자를 포함한 세대원은 몇 명인가요?',
  'household.minorChildCount': '자녀의 정확한 생년월일은 언제인가요?',
  'household.monthlyIncomeKrw': '세대 전체 월평균 소득은 얼마인가요?',
  'household.newbornCountWithinTwoYears': '자녀의 정확한 생년월일은 언제인가요?',
  'household.post20230328ChildCount': '자녀의 정확한 생년월일은 언제인가요?',
  'household.totalAssetsKrw': '세대 전체 총자산은 얼마인가요?',
  'profile.composition': '가구 형태는 어떻게 되나요?',
  'score.applicantDisabled': '신청자 본인이 등록장애인인가요?',
  'score.benefit.jpdcMultiChild': '현재 해당하는 복지급여 또는 지원 자격이 있나요?',
  'score.benefit.jpdcNewlywed': '현재 해당하는 복지급여 또는 지원 자격이 있나요?',
  'score.benefit.jpdcYouth': '현재 해당하는 복지급여 또는 지원 자격이 있나요?',
  'score.housingVulnerable': '주거취약계층 증빙을 받을 수 있나요?',
  'score.parentNoHome': '부모님이 모두 무주택인가요?',
  'score.severeDisability': '세대에 중증장애인이 있나요?',
  'score.supportsSeniorParent': '만 65세 이상 직계존속을 부양하고 있나요?',
  'score.youthIncomeUnderHalf': '청년 소득이 공고 기준의 50% 이하인가요?',
};

const QUESTION_DEFINITIONS: Record<keyof AdaptiveInfo, Omit<AdaptiveQuestion, 'sourceFacts' | 'combinations'>> = {
  eligibleResident: { id: 'eligibleResident', kind: 'BOOLEAN', title: QUESTION_TEXT['event.eligibleResident'], hint: '대한민국 국민 또는 공고가 인정하는 등록 외국인 기준입니다.' },
  currentProgramTenant: { id: 'currentProgramTenant', kind: 'BOOLEAN', title: QUESTION_TEXT['event.currentProgramTenant'], hint: '현재 계약 중이거나 거주 중인 경우를 포함합니다.' },
  collegeStudent: { id: 'collegeStudent', kind: 'BOOLEAN', title: QUESTION_TEXT['event.collegeStudent'], hint: '재학, 입학 예정, 복학 예정 여부를 확인해 주세요.' },
  jobSeekerWithinTwoYears: { id: 'jobSeekerWithinTwoYears', kind: 'BOOLEAN', title: QUESTION_TEXT['event.jobSeekerWithinTwoYears'], hint: '졸업 또는 중퇴한 날부터 공고일까지의 기간입니다.' },
  benefitCategory: {
    id: 'benefitCategory', kind: 'SELECT', title: QUESTION_TEXT['event.benefitCategory'], hint: '해당하는 가장 구체적인 항목 하나를 골라 주세요.',
    options: [
      { value: 'NONE', label: '해당 없음' }, { value: 'BASIC_LIVELIHOOD', label: '생계급여' },
      { value: 'BASIC_MEDICAL', label: '의료급여' }, { value: 'BASIC_HOUSING', label: '주거급여' },
      { value: 'BASIC_EDUCATION', label: '교육급여' }, { value: 'NEAR_POOR', label: '차상위계층' },
      { value: 'SUPPORTED_SINGLE_PARENT', label: '지원대상 한부모' },
      { value: null, label: '잘 모르겠어요' },
    ],
  },
  vehicleValueKrw: { id: 'vehicleValueKrw', kind: 'NUMBER', title: QUESTION_TEXT['household.maxVehicleValueKrw'], hint: '보험개발원 차량기준가액 등 확인 가능한 금액을 입력해 주세요.', unit: '만원', unitScale: 10_000 },
  applicantTotalAssetsKrw: { id: 'applicantTotalAssetsKrw', kind: 'NUMBER', title: QUESTION_TEXT['applicant.totalAssetsKrw'], hint: '세대 합계가 아니라 신청자 본인 명의 자산만 입력해 주세요.', unit: '만원', unitScale: 10_000 },
  parentMonthlyIncomeKrw: { id: 'parentMonthlyIncomeKrw', kind: 'NUMBER', title: '부모님의 월평균 소득 합계는 얼마인가요?', hint: '학생·청년 공급에서 본인과 부모 소득을 합산할 때 사용합니다.', unit: '만원', unitScale: 10_000 },
  parentVehicleValueKrw: { id: 'parentVehicleValueKrw', kind: 'NUMBER', title: '부모님 차량 중 가장 높은 차량가액은 얼마인가요?', hint: '학생·청년 공급의 부모 자산기준에만 사용합니다.', unit: '만원', unitScale: 10_000 },
  workHistoryMonths: { id: 'workHistoryMonths', kind: 'NUMBER', title: QUESTION_TEXT['event.workHistoryMonths'], hint: '근로·사업 등 소득이 발생한 기간을 합산해 주세요.', unit: '개월' },
  parentNoHome: { id: 'parentNoHome', kind: 'BOOLEAN', title: QUESTION_TEXT['score.parentNoHome'], hint: '공식 가점은 제출 서류로 최종 확인합니다.' },
  applicantDisabilityPoints: { id: 'applicantDisabilityPoints', kind: 'NUMBER', title: QUESTION_TEXT['event.applicantDisabilityPoints'], hint: '서류로 확인되는 공식 점수를 입력해야 합니다.', unit: '점' },
  youthIncomeUnderHalfThreshold: { id: 'youthIncomeUnderHalfThreshold', kind: 'BOOLEAN', title: QUESTION_TEXT['score.youthIncomeUnderHalf'], hint: '공고 소득표와 증빙서류 확인이 필요합니다.' },
  housingVulnerable: { id: 'housingVulnerable', kind: 'BOOLEAN', title: QUESTION_TEXT['score.housingVulnerable'], hint: '관련 기관의 증빙서류로 최종 확인합니다.' },
  severeDisabilityInHousehold: { id: 'severeDisabilityInHousehold', kind: 'BOOLEAN', title: QUESTION_TEXT['score.severeDisability'], hint: '장애 정도와 세대원 관계를 서류로 확인합니다.' },
  supportsSeniorParent: { id: 'supportsSeniorParent', kind: 'BOOLEAN', title: QUESTION_TEXT['score.supportsSeniorParent'], hint: '주민등록과 부양기간 증빙으로 최종 확인합니다.' },
  applicantRegisteredDisabled: { id: 'applicantRegisteredDisabled', kind: 'BOOLEAN', title: QUESTION_TEXT['score.applicantDisabled'], hint: '장애인등록증 등 서류로 최종 확인합니다.' },
  rentBurdenPercent: { id: 'rentBurdenPercent', kind: 'NUMBER', title: QUESTION_TEXT['event.rentBurdenPercent'], hint: '소득과 임대차계약서를 기준으로 계산해야 합니다.', unit: '%' },
  generalRentalPriorityCategory: {
    id: 'generalRentalPriorityCategory', kind: 'SELECT', title: QUESTION_TEXT['event.generalRentalPriorityCategory'], hint: '공식 서류 확인 전에는 임의로 고르지 마세요.',
    options: [{ value: 'NONE', label: '해당 없음' }, { value: 'PRIORITY_1', label: '1순위 증빙 가능' }, { value: 'UDO_PRIORITY_2', label: '우도 2순위 증빙 가능' }],
  },
  lhCollegeIncomeEligible: { id: 'lhCollegeIncomeEligible', kind: 'BOOLEAN', title: QUESTION_TEXT['event.lhCollegeIncomeEligible'], hint: '소득증빙과 공고의 가구원수별 기준표로 확인합니다.' },
};

const FACT_TO_ADAPTIVE: Record<string, ReadonlyArray<keyof AdaptiveInfo>> = {
  'applicant.totalAssetsKrw': ['applicantTotalAssetsKrw'],
  'household.maxVehicleValueKrw': ['vehicleValueKrw'],
  'event.eligibleResident': ['eligibleResident'],
  'event.currentProgramTenant': ['currentProgramTenant'],
  'event.collegeStudent': ['collegeStudent'],
  'event.jobSeekerWithinTwoYears': ['jobSeekerWithinTwoYears'],
  'event.benefitCategory': ['benefitCategory'],
  'event.isHousingBenefitRecipient': ['benefitCategory'],
  'event.workHistoryMonths': ['workHistoryMonths'],
  'event.applicantParentMonthlyIncomeKrw': ['parentMonthlyIncomeKrw'],
  'event.applicantParentTotalAssetsKrw': ['applicantTotalAssetsKrw'],
  'event.applicantParentMaxVehicleValueKrw': ['vehicleValueKrw', 'parentVehicleValueKrw'],
  'score.benefit.jpdcMultiChild': ['benefitCategory'],
  'score.benefit.jpdcNewlywed': ['benefitCategory'],
  'score.benefit.jpdcYouth': ['benefitCategory'],
};

function factsInExpression(expression: Expression | undefined, target: Set<string>): void {
  if (!expression) return;
  if ('fact' in expression) target.add(expression.fact);
  else if ('not' in expression) factsInExpression(expression.not, target);
  else for (const child of 'all' in expression ? expression.all : expression.any) factsInExpression(child, target);
}

function supplyFacts(supply: SupplyRuleSet): Array<{ key: string; context: 'candidate' | 'eligibility' | 'priority' | 'score' }> {
  const rows: Array<{ key: string; context: 'candidate' | 'eligibility' | 'priority' | 'score' }> = [];
  const addExpression = (expression: Expression | undefined, context: typeof rows[number]['context']) => {
    const facts = new Set<string>();
    factsInExpression(expression, facts);
    for (const key of facts) rows.push({ key, context });
  };
  addExpression(supply.candidateWhen, 'candidate');
  for (const rule of supply.eligibility) addExpression(rule.expression, 'eligibility');
  for (const tier of supply.priorityTiers) {
    for (const rule of tier.conditions) addExpression(rule.expression, 'priority');
    for (const score of tier.officialScore ?? []) rows.push({ key: score.fact, context: 'score' });
  }
  return rows;
}

function scopeOf(key: string): FactScope {
  if (key.startsWith('spouse.')) return 'SPOUSE';
  if (key.includes('Parent') || key === 'event.benefitCategory' || key === 'event.isHousingBenefitRecipient' || key === 'event.marriageBeforeMoveIn' || key === 'event.supportedSingleParent') return 'HOUSEHOLD';
  if (key.startsWith('household.') || key.startsWith('family.') || key.startsWith('profile.') || key.startsWith('score.')) return 'HOUSEHOLD';
  return 'APPLICANT';
}

function dataTypeOf(key: string): FactDataType {
  if (BOOLEAN_FACTS.has(key)) return 'BOOLEAN';
  if (ENUM_FACTS.has(key)) return 'ENUM';
  return key.endsWith('birthDate') || key.endsWith('Date') ? 'DATE' : 'NUMBER';
}

function coverageOf(key: string): FactCoverage {
  if (FULL_COVERAGE.has(key)) return 'FULL';
  if (PARTIAL_COVERAGE.has(key)) return 'PARTIAL';
  return 'NONE';
}

export function buildRuleFactInventory(dataset: FrozenListingDataset): FactInventoryRow[] {
  const usage = new Map<string, { combinations: Set<string>; contexts: Set<string> }>();
  for (const rulePackage of dataset.rulePackages) {
    for (const supply of rulePackage.supplies) {
      const combination = `${rulePackage.listingId}:${supply.supplyType}`;
      for (const row of supplyFacts(supply)) {
        const current = usage.get(row.key) ?? { combinations: new Set<string>(), contexts: new Set<string>() };
        current.combinations.add(combination);
        current.contexts.add(row.context);
        usage.set(row.key, current);
      }
    }
  }
  return [...usage.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([factKey, value]) => {
    const coverage = coverageOf(factKey);
    return {
      factKey,
      dataType: dataTypeOf(factKey),
      requirement: value.contexts.has('eligibility') ? 'REQUIRED' : 'CONDITIONAL',
      combinations: [...value.combinations].sort(),
      kioskAnswers: coverage,
      uiInput: coverage,
      scope: scopeOf(factKey),
      classification: EVIDENCE_ONLY_FACTS.has(factKey) ? 'EVIDENCE_ONLY' : factKey.startsWith('event.') || factKey.startsWith('score.') ? 'CONDITIONAL' : 'CORE',
      question: QUESTION_TEXT[factKey] ?? `${factKey} 값을 확인해 주세요.`,
    };
  });
}

function adaptiveValueKnown(answers: KioskAnswers, id: keyof AdaptiveInfo): boolean {
  const value = answers.adaptive[id];
  return value !== null;
}

export function createAdaptiveQuestionPlan(
  results: EvaluationResult[],
  answers: KioskAnswers,
  answeredKeys: readonly string[] = [],
): AdaptiveQuestionPlan {
  const answered = new Set(answeredKeys);
  const byQuestion = new Map<keyof AdaptiveInfo, { facts: Set<string>; combinations: Set<string> }>();
  const evidenceOnlyFacts = new Set<string>();
  const excludedIneligible: string[] = [];

  for (const result of results) {
    if (result.eligibility === 'INELIGIBLE') {
      excludedIneligible.push(result.evaluationId);
      continue;
    }
    for (const fact of result.unresolvedFacts) {
      if (EVIDENCE_ONLY_FACTS.has(fact)) {
        evidenceOnlyFacts.add(fact);
        continue;
      }
      for (const id of FACT_TO_ADAPTIVE[fact] ?? []) {
        if (adaptiveValueKnown(answers, id) || answered.has(`adaptive.${id}`)) continue;
        const current = byQuestion.get(id) ?? { facts: new Set<string>(), combinations: new Set<string>() };
        current.facts.add(fact);
        current.combinations.add(result.evaluationId);
        byQuestion.set(id, current);
      }
    }
  }

  const questions = [...byQuestion.entries()].map(([id, usage]) => ({
    ...QUESTION_DEFINITIONS[id],
    sourceFacts: [...usage.facts].sort(),
    combinations: [...usage.combinations].sort(),
  }));
  return { questions, evidenceOnlyFacts: [...evidenceOnlyFacts].sort(), excludedIneligible };
}

export function inventoryCoverage(rows: FactInventoryRow[]): { full: number; partial: number; none: number; percent: number } {
  const full = rows.filter(row => row.uiInput === 'FULL').length;
  const partial = rows.filter(row => row.uiInput === 'PARTIAL').length;
  const none = rows.length - full - partial;
  return { full, partial, none, percent: Math.round((full / rows.length) * 1000) / 10 };
}
