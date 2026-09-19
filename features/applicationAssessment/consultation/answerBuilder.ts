import { groupMissingInformation, missingLabel } from '../form.ts';
import type { ApplicationAssessmentResult, RuleSourceStatus, SupplyType } from '../types.ts';
import type {
  ConsultationAction,
  ConsultationEvidenceRef,
  ConsultationIntent,
  ConsultationMissingQuestion,
  ConsultationResolution,
  ConsultationResponse,
} from './types.ts';

const SUPPLY_LABEL: Record<SupplyType, string> = {
  youth: '청년 특별공급', newlywed: '신혼부부 특별공급', firstHome: '생애최초 특별공급',
};
const STAGE_LABEL = { PRIORITY: '우선공급', GENERAL: '일반공급', LOTTERY: '추첨공급' } as const;
const SOURCE_NOTICE: Record<RuleSourceStatus, string> = {
  REFERENCE: '참고 기준으로만 안내하며, 공고 원문 검증 전에는 판정을 확정할 수 없습니다.',
  DRAFT_SOURCE_VERIFIED: '제공된 모집공고 검토본을 기준으로 계산한 예상 결과입니다. 최종 공고 게시 후 기준이 달라질 수 있습니다.',
  OFFICIAL_VERIFIED: '공식 공고 기준으로 계산한 예상 결과이며, 최종 자격은 사업주체·청약기관 심사에서 확정됩니다.',
};

const PROFILE_FACTS = new Set([
  'householdMemberCount', 'maritalStatus', 'noHome', 'neverOwned', 'householdNoHome',
  'householdNeverOwned', 'noSpecialRestriction', 'hasAccount', 'incomeTaxPaymentYears',
  'workOrBusinessIncome',
]);

const QUESTION_BY_FACT: Record<string, string> = {
  age: '공고일 기준 나이를 계산할 수 있도록 생년월일을 알려주세요.',
  residence: '공고일 현재 거주지역을 알려주세요.',
  residenceMonths: '제주특별자치도에서 연속 거주를 시작한 날짜를 알려주세요.',
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
  incomeTaxPaymentYears: '신청자 본인의 소득세 납부기간을 프로필에서 확인해 주세요.',
  noHome: '현재 주택 소유 여부를 프로필에서 확인해 주세요.',
  neverOwned: '과거 주택 소유 이력을 프로필에서 확인해 주세요.',
  householdNoHome: '세대구성원의 현재 주택 소유 여부를 프로필에서 확인해 주세요.',
  householdNeverOwned: '세대구성원의 과거 주택 소유 이력을 프로필에서 확인해 주세요.',
  specialExceptions: '적용 가능성이 있는 특례 내용을 알려주세요.',
  exceptionsClear: '배우자 이력·출산·해외체류 등 특례 적용 가능성이 있는지 알려주세요.',
};

const PRIORITY = [
  'age', 'maritalStatus', 'noHome', 'neverOwned', 'householdNoHome', 'householdNeverOwned',
  'hasAccount', 'accountMonths', 'recognizedPaymentCount', 'recognizedDepositAmount',
  'monthlyIncome', 'householdIncome', 'totalAssets', 'parentAssets', 'incomeTaxPaymentYears',
  'residence', 'residenceMonths', 'overseasClear', 'exceptionsClear',
];

function priorityOf(key: string): number {
  const fact = key.replace(/^input:/, '');
  const index = PRIORITY.indexOf(fact);
  return index === -1 ? PRIORITY.length : index;
}

export function selectMissingQuestions(keys: string[]): ConsultationMissingQuestion[] {
  return [...new Set(keys)]
    .filter(key => key.startsWith('input:'))
    .sort((a, b) => priorityOf(a) - priorityOf(b))
    .map(key => {
      const fact = key.slice(6);
      return {
        key,
        prompt: QUESTION_BY_FACT[fact] ?? `${missingLabel(key)} 정보를 알려주세요.`,
        target: PROFILE_FACTS.has(fact) ? 'PROFILE' as const : 'ANSWER' as const,
      };
    })
    .filter((question, index, all) => all.findIndex(item => item.prompt === question.prompt) === index)
    .slice(0, 3);
}

function messageKeywords(message: string): string[] {
  const pairs: [RegExp, string][] = [
    [/부모/, '부모'], [/(통장|청약저축|납입)/, '청약'], [/(소득|월급)/, '소득'],
    [/자산/, '자산'], [/(주택|집|무주택)/, '주택'], [/(거주|제주)/, '거주'],
    [/(혼인|결혼|신혼)/, '혼인'], [/(자녀|아이)/, '자녀'], [/(소득세|근로)/, '소득세'],
  ];
  return pairs.filter(([pattern]) => pattern.test(message)).map(([, keyword]) => keyword);
}

function evidenceRefs(result: ApplicationAssessmentResult, intent: ConsultationIntent, message: string): ConsultationEvidenceRef[] {
  const ids = new Set<string>();
  if (intent === 'CHECK_SCORE' || intent === 'WHY_RESULT') result.score?.breakdown.forEach(item => ids.add(item.evidenceId));
  if (intent === 'CHECK_STAGE') result.stageConditions.forEach(item => ids.add(item.evidenceId));
  if (intent === 'CHECK_EXCEPTION') result.unknownConditions.forEach(item => ids.add(item.evidenceId));
  if (intent === 'CHECK_DOCUMENTS') result.evidence.forEach(item => ids.add(item.id));
  if (intent === 'CHECK_REQUIREMENT' || intent === 'CHECK_EXCEPTION') {
    const keywords = messageKeywords(message);
    result.evidence.filter(item => keywords.some(keyword => `${item.label} ${item.section} ${item.tableLabel ?? ''} ${item.textExcerpt ?? ''}`.includes(keyword))).forEach(item => ids.add(item.id));
  }
  if (!ids.size) [...result.failedConditions, ...result.unknownConditions, ...result.satisfiedConditions].slice(0, 4).forEach(item => ids.add(item.evidenceId));
  return result.evidence.filter(item => ids.has(item.id)).map(({ id, ...item }) => ({ evidenceId: id, ...item }));
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

function sourceNotice(status: RuleSourceStatus | undefined): string {
  return status ? SOURCE_NOTICE[status] : '공고 출처 상태를 확인할 수 없어 판정을 확정하지 않습니다.';
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
}): ConsultationResponse {
  const { result, intent } = input;
  const questions = selectMissingQuestions(result.missingInformation);
  const sections: string[] = [conclusion(result)];
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
    if (reasons.length) sections.push(`핵심 이유: ${reasons.join(', ')}`);
  }
  if (intent === 'CHECK_EXCEPTION') {
    sections.push(resolutionFor(result) === 'REVIEW_REQUIRED'
      ? '이 항목은 현재 검토본의 특례 조항과 증빙을 추가로 대조해야 합니다. 일반 기준으로 임의 판정하지 않습니다.'
      : '입력한 예외 조건을 포함해 기존 판정 규칙으로 다시 확인했습니다.');
  }
  if (questions.length) sections.push(`다음 확인사항: ${questions.map(item => item.prompt).join(' ')}`);
  const refs = evidenceRefs(result, intent, input.userMessage);
  if ((input.evidenceRequested || intent === 'WHY_RESULT') && refs.length) {
    const labels = refs.slice(0, 3).map(item => [item.section, item.tableLabel ?? item.label].filter(Boolean).join(' · '));
    sections.push(`판정근거: ${labels.join(', ')}`);
  }
  sections.push(sourceNotice(result.sourceStatus));
  return {
    message: sections.join('\n'), intent, resolution: resolutionFor(result), assessmentStatus: result.status,
    supplyType: result.supplyType, stage: result.stage, score: result.score, suggestedQuestions: questions,
    actions: actionsFor(result, questions), evidenceRefs: refs, sourceStatus: result.sourceStatus ?? null,
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
