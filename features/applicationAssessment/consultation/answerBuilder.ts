import { REGION_DEFINITIONS } from '../../discovery/regions.ts';
import { groupMissingInformation, missingLabel } from '../form.ts';
import type { ApplicationAssessmentResult, SupplyType } from '../types.ts';
import type {
  ConsultationAction,
  ConsultationEvidenceRef,
  ConsultationIntent,
  ConsultationMissingQuestion,
  ConsultationResolution,
  ConsultationResponse,
} from './types.ts';

const REGION_OR_RESIDENCE = new RegExp(`(거주|${REGION_DEFINITIONS.flatMap(region => region.aliases).join('|')})`);

const SUPPLY_LABEL: Record<SupplyType, string> = {
  youth: '청년 특별공급', newlywed: '신혼부부 특별공급', firstHome: '생애최초 특별공급',
};
const STAGE_LABEL = { PRIORITY: '우선공급', GENERAL: '일반공급', LOTTERY: '추첨공급' } as const;
const PROFILE_FACTS = new Set([
  'householdMemberCount', 'maritalStatus', 'noHome', 'neverOwned', 'householdNoHome',
  'householdNeverOwned', 'noSpecialRestriction', 'hasAccount', 'incomeTaxPaymentYears',
  'workOrBusinessIncome',
]);

const QUESTION_BY_FACT: Record<string, string> = {
  age: '공고일 기준 나이를 계산할 수 있도록 생년월일을 알려주세요.',
  residence: '공고일 현재 거주지역을 알려주세요.',
  residenceMonths: '공고에서 정한 거주지역에 계속 거주하기 시작한 날짜를 알려주세요.',
  overseasClear: '계속 90일 또는 연간 183일을 넘는 해외체류 이력이 있는지 알려주세요.',
  maritalStatus: '현재 혼인 여부를 프로필에서 확인해 주세요.',
  hasAccount: '청약통장 보유 여부를 프로필에서 확인해 주세요.',
  accountMonths: '청약통장 가입일 또는 공고일 기준 가입기간을 알려주세요.',
  recognizedPaymentCount: '청약통장 인정 납입횟수를 알려주세요.',
  recognizedDepositAmount: '선납금을 포함한 인정 저축액을 알려주세요.',
  monthlyIncome: '신청자 본인의 월평균소득을 알려주세요.',
  householdIncome: '공고 기준으로 산정한 세대 월평균소득을 알려주세요.',
  dualIncome: '맞벌이 여부를 알려주세요.',
  totalAssets: '공고 기준으로 산정한 총자산을 알려주세요.',
  parentAssets: '공고 기준으로 산정한 부모 총자산을 알려주세요.',
  realEstateAssets: '세대가 보유한 부동산(건물+토지) 가액 합계를 알려주세요. 없으면 없다고 답해 주세요.',
  vehicleValue: '세대가 보유한 자동차 중 가장 높은 차량가액을 알려주세요. 없으면 없다고 답해 주세요.',
  householdIncomeScoreEligible: '공고 기준으로 산정한 세대 월평균소득과 맞벌이 여부를 알려주세요.',
  newlywedMarriageScoreMonths: '신혼부부·예비신혼부부·한부모 중 어디에 해당하는지와, 신혼부부라면 혼인신고일을 알려주세요.',
  singleParentChildScoreMonths: '신혼부부·예비신혼부부·한부모 중 어디에 해당하는지와, 한부모라면 가장 어린 자녀의 생년월일을 알려주세요.',
  incomeTaxPaymentYears: '신청자 본인의 소득세 납부기간을 프로필에서 확인해 주세요.',
  noHome: '현재 주택 소유 여부를 프로필에서 확인해 주세요.',
  neverOwned: '과거 주택 소유 이력을 프로필에서 확인해 주세요.',
  householdNoHome: '세대구성원의 현재 주택 소유 여부를 프로필에서 확인해 주세요.',
  householdNeverOwned: '세대구성원의 과거 주택 소유 이력을 프로필에서 확인해 주세요.',
  specialExceptions: '적용 가능성이 있는 특례 내용을 알려주세요.',
  exceptionsClear: '배우자 이력·출산·해외체류 등 특례 적용 가능성이 있는지 알려주세요.',
  childbirthClear: '현재 자녀·태아·입양 자녀가 있나요?',
};

const OPTIONS_BY_FACT: Partial<Record<string, { label: string; value: string }[]>> = {
  overseasClear: [
    { label: '해외체류 없음', value: '해외체류 이력이 없어요' },
    { label: '해외체류 있음', value: '해외체류 이력이 있지만 정확한 기간은 확인이 필요해요' },
  ],
  dualIncome: [
    { label: '외벌이', value: '외벌이예요' },
    { label: '맞벌이', value: '맞벌이예요' },
  ],
  childbirthClear: [
    { label: '없어요', value: '자녀 없어' },
    { label: '있어요', value: '자녀 또는 태아가 있어요' },
  ],
};

const PRIORITY = [
  'age', 'maritalStatus', 'noHome', 'neverOwned', 'householdNoHome', 'householdNeverOwned',
  'hasAccount', 'accountMonths', 'recognizedPaymentCount', 'recognizedDepositAmount',
  'monthlyIncome', 'householdIncome', 'totalAssets', 'parentAssets', 'realEstateAssets', 'vehicleValue', 'incomeTaxPaymentYears',
  'residence', 'residenceMonths', 'overseasClear', 'exceptionsClear',
];

function priorityOf(key: string): number {
  const fact = key.replace(/^input:/, '');
  const index = PRIORITY.indexOf(fact);
  return index === -1 ? PRIORITY.length : index;
}

export function selectMissingQuestions(keys: string[], excluded: readonly string[] = []): ConsultationMissingQuestion[] {
  const excludedSet = new Set(excluded);
  return [...new Set(keys)]
    .filter(key => key.startsWith('input:') && !excludedSet.has(key))
    .sort((a, b) => priorityOf(a) - priorityOf(b))
    .map(key => {
      const fact = key.slice(6);
      return {
        key,
        prompt: QUESTION_BY_FACT[fact] ?? `${missingLabel(key)} 정보를 알려주세요.`,
        target: PROFILE_FACTS.has(fact) ? 'PROFILE' as const : 'ANSWER' as const,
        options: OPTIONS_BY_FACT[fact],
      };
    })
    .filter((question, index, all) => all.findIndex(item => item.prompt === question.prompt) === index)
    .slice(0, 3);
}

function messageKeywords(message: string): string[] {
  const pairs: [RegExp, string][] = [
    [/부모/, '부모'], [/(통장|청약저축|납입)/, '청약'], [/(소득|월급)/, '소득'],
    [/자산/, '자산'], [/(주택|집|무주택)/, '주택'], [REGION_OR_RESIDENCE, '거주'],
    [/(혼인|결혼|신혼)/, '혼인'], [/(자녀|아이)/, '자녀'], [/(소득세|근로)/, '소득세'],
  ];
  return pairs.filter(([pattern]) => pattern.test(message)).map(([, keyword]) => keyword);
}

function evidenceRefs(result: ApplicationAssessmentResult, intent: ConsultationIntent, message: string): ConsultationEvidenceRef[] {
  const ids: string[] = [];
  const add = (id: string) => { if (!ids.includes(id)) ids.push(id); };
  if (intent === 'CHECK_SCORE' || intent === 'WHY_RESULT') result.score?.breakdown.forEach(item => add(item.evidenceId));
  if (intent === 'CHECK_STAGE') result.stageConditions.forEach(item => add(item.evidenceId));
  if (intent === 'CHECK_EXCEPTION') result.unknownConditions.forEach(item => add(item.evidenceId));
  if (intent === 'CHECK_DOCUMENTS') result.evidence.forEach(item => add(item.id));
  if (intent === 'CHECK_REQUIREMENT' || intent === 'CHECK_EXCEPTION') {
    const keywords = messageKeywords(message);
    result.evidence.filter(item => keywords.some(keyword => `${item.label} ${item.section} ${item.tableLabel ?? ''} ${item.textExcerpt ?? ''}`.includes(keyword))).forEach(item => add(item.id));
  }
  if (!ids.length) [...result.failedConditions, ...result.unknownConditions, ...result.satisfiedConditions].forEach(item => add(item.evidenceId));
  const byId = new Map(result.evidence.map(item => [item.id, item]));
  const seenLocations = new Set<string>(), seenExcerpts = new Set<string>();
  const refs: ConsultationEvidenceRef[] = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (!item) continue;
    const location = `${item.section ?? ''}|${item.tableLabel ?? ''}`;
    const excerpt = item.textExcerpt?.trim() ?? '';
    if ((location !== '|' && seenLocations.has(location)) || (excerpt && seenExcerpts.has(excerpt))) continue;
    if (location !== '|') seenLocations.add(location);
    if (excerpt) seenExcerpts.add(excerpt);
    const { id: evidenceId, ...rest } = item;
    refs.push({ evidenceId, ...rest });
    if (refs.length === 5) break;
  }
  return refs;
}

function conditionSummary(result: ApplicationAssessmentResult): string[] {
  if (result.status === 'INELIGIBLE') return result.failedConditions.slice(0, 3).map(item => `${item.label}: 미충족`);
  if (result.status === 'NEEDS_MORE_INFORMATION') return result.unknownConditions.slice(0, 3).map(item => `${item.label}: 확인 필요`);
  return result.satisfiedConditions.slice(0, 3).map(item => `${item.label}: 충족`);
}

function scoreSummary(result: ApplicationAssessmentResult): string {
  if (result.scoring === 'NOT_APPLICABLE') return '이 유형은 가점제가 아니라 공급단계와 추첨 방식으로 선정하며, 별도 점수로 환산하지 않습니다.';
  if (!result.score) return '현재 정보로는 가점을 계산할 수 없습니다.';
  const breakdown = result.score.breakdown.map(item => `${item.label} ${item.points}점`).join(', ');
  return `예상 가점은 ${result.score.total} / ${result.score.max}점입니다. ${breakdown}`;
}

function conclusion(result: ApplicationAssessmentResult): string {
  const supply = SUPPLY_LABEL[result.supplyType];
  if (result.status === 'ELIGIBLE') return `현재 입력 기준으로 ${supply} 신청 가능으로 예상됩니다.`;
  if (result.status === 'INELIGIBLE') return `현재 입력 기준으로 ${supply} 신청이 어렵습니다.`;
  return `현재 입력만으로는 ${supply} 판정을 마칠 수 없습니다.`;
}

function resolutionFor(result: ApplicationAssessmentResult): ConsultationResolution {
  const grouped = groupMissingInformation(result.missingInformation);
  if (grouped.announcement.length || result.missingInformation.some(item => item.startsWith('review:'))) return 'REVIEW_REQUIRED';
  return result.status === 'NEEDS_MORE_INFORMATION' ? 'NEEDS_MORE_INFORMATION' : 'ASSESSED';
}

function actionsFor(result: ApplicationAssessmentResult, questions: ConsultationMissingQuestion[]): ConsultationAction[] {
  const actions: ConsultationAction[] = [];
  if (questions.some(item => item.target === 'ANSWER')) actions.push({ type: 'ANSWER_QUESTION', label: '추가 질문에 답하기' });
  if (questions.some(item => item.target === 'PROFILE')) actions.push({ type: 'EDIT_PROFILE', label: '프로필 정보 확인하기' });
  if (groupMissingInformation(result.missingInformation).announcement.length) actions.push({ type: 'REVIEW_ANNOUNCEMENT', label: '공고 기준 검토 상태 확인하기' });
  if (result.requiredDocuments.length) actions.push({ type: 'VIEW_DOCUMENTS', label: '필요서류 보기' });
  return actions;
}

export function buildConsultationResponse(input: {
  intent: ConsultationIntent;
  result: ApplicationAssessmentResult;
  evidenceRequested: boolean;
  userMessage: string;
  deferredFields?: string[];
  contextTransition?: string;
}): ConsultationResponse {
  const { result, intent } = input;
  const blockerKeys = [...result.failedConditions, ...result.unknownConditions]
    .flatMap(condition => Object.entries(condition.inputs))
    .filter(([, value]) => value === null)
    .map(([key]) => `input:${key}`);
  const questions = selectMissingQuestions([...blockerKeys, ...result.missingInformation], input.deferredFields);
  const summary = conclusion(result);
  const sections: string[] = input.contextTransition ? [input.contextTransition, summary] : [summary];
  let reason: string | undefined;
  if (intent === 'CHECK_SCORE' || (intent === 'WHY_RESULT' && result.score)) sections.push(scoreSummary(result));
  if (intent === 'CHECK_STAGE' || intent === 'CHECK_ELIGIBILITY' || intent === 'WHY_RESULT') {
    if (result.stage) sections.push(`공급단계는 ${STAGE_LABEL[result.stage]}입니다. ${result.stageExplanation}`);
    else sections.push(result.stageExplanation);
  }
  if (intent === 'CHECK_DOCUMENTS') {
    sections.push(result.requiredDocuments.length ? `필요서류: ${result.requiredDocuments.join(', ')}` : '현재 규칙에 등록된 필요서류가 없습니다. 공고 원문 확인이 필요합니다.');
  } else {
    const keywords = messageKeywords(input.userMessage);
    const conditions = [...result.failedConditions, ...result.unknownConditions, ...result.satisfiedConditions, ...result.stageConditions];
    const relevant = intent === 'CHECK_REQUIREMENT'
      ? conditions.filter(item => keywords.some(keyword => item.label.includes(keyword))).slice(0, 3)
      : [];
    const reasons = relevant.length
      ? relevant.map(item => `${item.label}: ${item.outcome === 'PASS' ? '충족' : item.outcome === 'FAIL' ? '미충족' : '확인 필요'}`)
      : conditionSummary(result);
    if (reasons.length) {
      reason = reasons.join(', ');
      sections.push(`핵심 이유: ${reason}`);
    }
  }
  if (intent === 'CHECK_EXCEPTION') {
    sections.push(resolutionFor(result) === 'REVIEW_REQUIRED'
      ? '이 항목은 현재 검토본의 특례 조항과 증빙을 추가로 대조해야 합니다. 일반 기준으로 임의 판정하지 않습니다.'
      : '입력한 예외 조건을 포함해 기존 판정 규칙으로 다시 확인했습니다.');
  }
  const nextStep = questions.length ? questions.map(item => item.prompt).join(' ') : undefined;
  if (nextStep) sections.push(`다음 확인사항: ${nextStep}`);
  const refs = evidenceRefs(result, intent, input.userMessage);
  if ((input.evidenceRequested || intent === 'WHY_RESULT') && refs.length) {
    const labels = refs.slice(0, 3).map(item => [item.section, item.tableLabel ?? item.label].filter(Boolean).join(' · '));
    sections.push(`판정근거: ${labels.join(', ')}`);
  }
  return {
    message: sections.join('\n'), summary, reason, nextStep, intent, resolution: resolutionFor(result), assessmentStatus: result.status,
    supplyType: result.supplyType, stage: result.stage, score: result.score, suggestedQuestions: questions,
    actions: actionsFor(result, questions), evidenceRefs: refs, sourceStatus: result.sourceStatus ?? null,
    unresolvedItems: (input.deferredFields ?? []).map(missingLabel),
    contextTransition: input.contextTransition,
  };
}

export function unsupportedConsultationResponse(intent: ConsultationIntent, reason: 'NO_RULES' | 'NO_SUPPLY' | 'INTERPRETATION_FAILED'): ConsultationResponse {
  const failed = reason === 'INTERPRETATION_FAILED';
  return {
    message: failed
      ? '질문의 정보를 안전하게 구조화하지 못했습니다. 생년월일, 청약통장 가입일처럼 확인 가능한 값을 다시 알려주세요.'
      : reason === 'NO_SUPPLY'
        ? '확인할 공급유형을 먼저 선택해 주세요. 등록된 규칙 없이 일반 상식으로 자격을 추정하지 않습니다.'
        : '이 공고에는 상담에 사용할 검증된 판정 규칙이 없습니다. 다른 공고 기준으로 대신 계산하지 않습니다.',
    intent,
    resolution: failed ? 'INTERPRETATION_FAILED' : 'CONSULTATION_UNSUPPORTED',
    assessmentStatus: null,
    supplyType: null,
    stage: null,
    suggestedQuestions: [],
    actions: reason === 'NO_RULES' ? [{ type: 'REVIEW_ANNOUNCEMENT', label: '지원 공고 확인하기' }] : [],
    evidenceRefs: [],
    sourceStatus: null,
  };
}

export function evidenceText(ref: ConsultationEvidenceRef): string {
  const location = [ref.section, ref.tableLabel, ref.label].filter(Boolean).join(' · ');
  return ref.textExcerpt ? `${location}: ${ref.textExcerpt}` : location;
}
