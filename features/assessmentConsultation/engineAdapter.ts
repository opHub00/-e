import { knownValue, type ApplicantProfileV2 } from '../profile/domain.ts';
import { groupMissingInformation, missingLabel } from '../applicationAssessment/form.ts';
import { ApplicationAssessmentConsultationEngine } from '../applicationAssessment/consultation/engine.ts';
import { createConsultationSession } from '../applicationAssessment/consultation/session.ts';
import type {
  ConsultationAction as DomainAction,
  ConsultationEvidenceRef,
  ConsultationResponse as DomainResponse,
  ConsultationSession as DomainSession,
} from '../applicationAssessment/consultation/types.ts';
import type { AnnouncementRules, ApplicationAssessmentResult, Evidence, Scalar } from '../applicationAssessment/types.ts';
import type {
  ConsultationAction,
  ConsultationAssessment,
  ConsultationEngine,
  ConsultationQuestion,
  ConsultationSession,
  ConsultationTurn,
} from './contract.ts';
import type { AssessmentConsultationSeed } from './seedStore.ts';

type Input = {
  rules: AnnouncementRules;
  listingId: string;
  profile: ApplicantProfileV2;
  seed?: AssessmentConsultationSeed | null;
};

let turnSequence = 0;
const turnId = () => `consultation-${++turnSequence}`;
const unique = <T,>(items: T[]) => [...new Set(items)];
const displayValue = (value: Scalar | null) => value === null ? '확인 전'
  : typeof value === 'boolean' ? (value ? '예' : '아니요')
  : ({ single: '미혼', married: '기혼', 'no-home': '무주택', 'owns-home': '주택 보유' }[String(value)] ?? String(value));

/** Fact values use engine semantics, so inverse booleans need fact-specific wording. */
export function formatProfileFact(key: string, value: Scalar | null): { label: string; valueText: string } | null {
  const inverse: Record<string, { label: string; yes: string; no: string }> = {
    noHome: { label: '현재 주택 상태', yes: '무주택', no: '주택 보유' },
    neverOwned: { label: '과거 주택소유 이력', yes: '없음', no: '있음' },
    householdNoHome: { label: '세대 주택 상태', yes: '무주택', no: '주택 보유' },
    householdNeverOwned: { label: '세대 과거 주택소유 이력', yes: '없음', no: '있음' },
    noSpecialRestriction: { label: '특별공급 제한', yes: '없음', no: '있음' },
  };
  const direct: Record<string, string> = {
    maritalStatus: '혼인정보', hasAccount: '청약통장 보유', incomeTaxPaymentYears: '소득세 납부기간',
    workOrBusinessIncome: '근로·사업소득 요건', householdMemberCount: '세대원 수',
  };
  if (inverse[key] && typeof value === 'boolean') return { label: inverse[key].label, valueText: value ? inverse[key].yes : inverse[key].no };
  if (!direct[key]) return null;
  if (key === 'hasAccount' && typeof value === 'boolean') return { label: direct[key], valueText: value ? '있음' : '없음' };
  if (key === 'workOrBusinessIncome' && typeof value === 'boolean') return { label: direct[key], valueText: value ? '충족' : '미충족' };
  return { label: direct[key], valueText: displayValue(value) };
}

export function mapAssessmentToUi(result: ApplicationAssessmentResult): ConsultationAssessment {
  const groups = groupMissingInformation(result.missingInformation);
  return {
    status: result.status,
    supplyType: result.supplyType,
    stage: result.stage,
    scoring: result.scoring,
    score: result.score ? { total: result.score.total, max: result.score.max } : null,
    blocking: result.failedConditions.map(item => item.label),
    pending: unique([
      ...result.unknownConditions.map(item => item.label),
      ...result.stageConditions.filter(item => item.outcome === 'UNKNOWN').map(item => item.label),
      ...groups.answers,
      ...groups.profile,
    ]).slice(0, 3),
  };
}

function toEvidence(refs: ConsultationEvidenceRef[]): Evidence[] {
  return refs.map(({ evidenceId, ...ref }) => ({ id: evidenceId, ...ref }));
}

function toQuestion(question: DomainResponse['suggestedQuestions'][number]): ConsultationQuestion {
  return { key: question.key, prompt: question.prompt, source: question.target, interaction: 'ANSWER', options: question.options };
}

function mapActions(actions: DomainAction[], result: ApplicationAssessmentResult | null): ConsultationAction[] {
  const mapped: ConsultationAction[] = [];
  for (const action of actions) {
    if (action.type === 'EDIT_PROFILE') mapped.push({ kind: 'OPEN_PROFILE', label: action.label });
    if (action.type === 'VIEW_DOCUMENTS' || action.type === 'REVIEW_ANNOUNCEMENT') mapped.push({ kind: 'OPEN_ASSESSMENT', label: action.label });
  }
  if (result && !mapped.some(action => action.kind === 'OPEN_ASSESSMENT')) mapped.push({ kind: 'OPEN_ASSESSMENT', label: '맞춤판정 자세히 보기' });
  if (result?.status === 'ELIGIBLE' && !mapped.some(action => action.kind === 'OPEN_PREPARATION')) mapped.push({ kind: 'OPEN_PREPARATION', label: '준비 단계로 이어가기' });
  return mapped;
}

function reusedProfileFacts(result: ApplicationAssessmentResult | null, profile: ApplicantProfileV2): string[] {
  if (!result) return [];
  const inputs = [...result.satisfiedConditions, ...result.failedConditions, ...result.unknownConditions, ...result.stageConditions]
    .flatMap(condition => Object.entries(condition.inputs));
  const knownProfileFacts = new Set<string>();
  if (knownValue(profile.family.marriageStatus) !== undefined) knownProfileFacts.add('maritalStatus');
  if (knownValue(profile.housing.currentOwnership) !== undefined) knownProfileFacts.add('noHome');
  if (knownValue(profile.housing.previousOwnership) !== undefined) knownProfileFacts.add('neverOwned');
  if (knownValue(profile.housing.householdHasHome) !== undefined) knownProfileFacts.add('householdNoHome');
  if (knownValue(profile.housing.householdDisqualifyingPreviousOwnership) !== undefined) knownProfileFacts.add('householdNeverOwned');
  if (knownValue(profile.housing.hasSpecialSupplyRestriction) !== undefined) knownProfileFacts.add('noSpecialRestriction');
  if (knownValue(profile.subscriptionAccount.hasAccount) !== undefined) knownProfileFacts.add('hasAccount');
  if (knownValue(profile.income.incomeTaxPaymentYears) !== undefined) knownProfileFacts.add('incomeTaxPaymentYears');
  if (knownValue(profile.income.workOrBusinessIncomeEligible) !== undefined) knownProfileFacts.add('workOrBusinessIncome');
  if (knownValue(profile.household.memberCount) !== undefined) knownProfileFacts.add('householdMemberCount');
  return unique(inputs
    .filter(([key, value]) => knownProfileFacts.has(key) && value !== null)
    .map(([key, value]) => formatProfileFact(key, value))
    .filter((item): item is { label: string; valueText: string } => item !== null)
    .map(item => `${item.label}: ${item.valueText}`))
    .slice(0, 4);
}

export function mapConsultationResultToUiContract(input: {
  response: DomainResponse;
  result: ApplicationAssessmentResult | null;
  profile: ApplicantProfileV2;
}): ConsultationTurn {
  const groups = input.result ? groupMissingInformation(input.result.missingInformation) : { answers: [], profile: [], announcement: [] };
  const unresolved = input.response.resolution === 'REVIEW_REQUIRED'
    ? unique([...groups.announcement, ...(input.result?.missingInformation.filter(item => item.startsWith('review:')).map(missingLabel) ?? []), ...(input.response.unresolvedItems ?? [])])
    : input.response.resolution === 'CONSULTATION_UNSUPPORTED'
      ? ['이 공고에 사용할 판정 규칙이 등록되지 않았습니다.']
      : input.response.resolution === 'INTERPRETATION_FAILED'
        ? ['질문에서 판정에 사용할 정보를 안전하게 구조화하지 못했습니다.']
        : input.response.unresolvedItems ?? [];
  return {
    id: turnId(), role: 'assistant', message: input.response.message,
    summary: input.response.summary, reason: input.response.reason, nextStep: input.response.nextStep,
    activeSupplyType: input.response.supplyType ?? undefined,
    contextTransition: input.response.contextTransition,
    assessment: input.result ? mapAssessmentToUi(input.result) : undefined,
    suggestedQuestions: input.response.suggestedQuestions.slice(0, 3).map(toQuestion),
    actions: mapActions(input.response.actions, input.result),
    evidenceRefs: toEvidence(input.response.evidenceRefs),
    unresolved: unresolved.length ? unresolved : undefined,
    reusedProfileFacts: reusedProfileFacts(input.result, input.profile),
  };
}

function initialTurn(input: Input, seededFrom?: 'ASSESSMENT_RESULT'): ConsultationTurn {
  if (seededFrom && input.seed) {
    return {
      id: turnId(), role: 'assistant',
      message: '방금 본 판정 결과와 입력한 정보를 그대로 이어받았어요. 결과의 이유, 가점, 공고 근거를 물어보세요.',
      assessment: mapAssessmentToUi(input.seed.result),
      suggestedQuestions: [
        { key: 'why', prompt: input.seed.result.score ? `왜 ${input.seed.result.score.total}점이에요?` : '왜 이 공급단계예요?', source: 'ANSWER', interaction: 'ASK' },
        { key: 'evidence', prompt: '공고 근거 보여줘', source: 'ANSWER', interaction: 'ASK' },
        { key: 'documents', prompt: '필요한 서류는?', source: 'ANSWER', interaction: 'ASK' },
      ],
      activeSupplyType: input.seed.supplyType,
      actions: [{ kind: 'OPEN_ASSESSMENT', label: '맞춤판정 자세히 보기' }],
      reusedProfileFacts: reusedProfileFacts(input.seed.result, input.seed.profile),
    };
  }
  return {
    id: turnId(), role: 'assistant',
    message: '이 공고의 등록된 판정 규칙을 기준으로 신청 가능 여부, 공급단계, 가점과 근거를 확인해 드릴게요.',
    suggestedQuestions: [
      { key: 'eligibility', prompt: '내가 신청 가능해?', source: 'ANSWER', interaction: 'ASK' },
      { key: 'score', prompt: '가점과 공급단계 알려줘', source: 'ANSWER', interaction: 'ASK' },
      { key: 'documents', prompt: '필요한 서류는?', source: 'ANSWER', interaction: 'ASK' },
    ],
    activeSupplyType: input.rules.supplies[0]?.type,
  };
}

export function createAssessmentConsultationUiEngine(input: Input): ConsultationEngine {
  const supplyType = input.seed?.supplyType ?? input.rules.supplies[0]?.type ?? null;
  const profile = input.seed?.profile ?? input.profile;
  const domainEngine = new ApplicationAssessmentConsultationEngine({ rules: input.rules });
  let domainSession: DomainSession | null = null;
  return {
    async start({ seededFrom }) {
      domainSession = createConsultationSession({
        announcementId: input.rules.provenance?.announcementId ?? input.rules.id,
        listingId: input.listingId,
        supplyType,
        userProfileSnapshot: profile,
        collectedAnswers: input.seed?.answers,
      });
      if (input.seed) {
        domainSession.lastAssessmentResult = structuredClone(input.seed.result);
        domainSession.missingFields = [...input.seed.result.missingInformation];
      }
      const session: ConsultationSession = {
        announcementTitle: input.rules.title,
        listingId: input.listingId,
        sourceStatus: input.rules.sourceStatus ?? 'REFERENCE',
        activeSupplyType: supplyType ?? undefined,
        seededFrom,
        turns: [initialTurn(input, seededFrom)],
      };
      return session;
    },
    async ask({ message, answering }) {
      if (!domainSession) throw new Error('CONSULTATION_SESSION_NOT_STARTED');
      const interpretedMessage = answering?.value && answering.value !== message ? answering.value : message;
      const sent = await domainEngine.sendMessage(domainSession, interpretedMessage);
      domainSession = sent.session;
      return mapConsultationResultToUiContract({ response: sent.response, result: sent.session.lastAssessmentResult, profile });
    },
  };
}
