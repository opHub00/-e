import type { KioskAnswers } from '../model.ts';
import type { AnswerStateMap } from '../questionPolicy.ts';
import { SAMDO_STAGE_LABELS } from '../samdo/presentation.ts';
import type { SamdoEligibility, SamdoRecommendation, SamdoRecommendationItem } from '../samdo/types.ts';
import { buildSamdoDualAssessment } from '../samdoDual/evaluate.ts';
import type { SamdoDistrictId, SamdoDualAssessment } from '../samdoDual/types.ts';
import { getUnresolvedAssessmentFacts } from '../samdoDual/unresolved.ts';
import { samdoInputFromAnswers } from '../samdoResult/samdoInput.ts';
import {
  applySamdoResolvedFact,
  buildSamdoResolutionCenter,
  type SamdoInputKind,
  type SamdoRefinementFactId,
  type SamdoResolutionItem,
} from '../samdoResult/samdoRefinement.ts';

/**
 * Assessment Copilot 화면 모델.
 *
 * 판정·다음 질문 순서·근거는 Codex 엔진이 정한다(buildSamdoDualAssessment · getUnresolvedAssessmentFacts ·
 * buildSamdoResolutionCenter). 여기서는 그 결과를 '지금 무엇을 확인하면 되는지'로 보여 줄 모양만 만든다.
 * 확률·점수 같은 당첨 가능성 표현은 만들지 않는다.
 */
export type CopilotTone = 'eligible' | 'review' | 'difficult';

export type CopilotSummary = {
  eligible: number;
  review: number;
  difficult: number;
  /** 아직 확인할 정보(모름으로 남긴 것 제외). */
  pending: number;
  districts: Array<{ id: SamdoDistrictId; label: string; headline: string; tone: CopilotTone }>;
};

export type CopilotQuestion = {
  factId: SamdoRefinementFactId;
  /** 사용자에게 묻는 문장. 예/아니요가 값의 의미와 맞도록 사실별로 정했다. */
  title: string;
  /** 왜 지금 묻는지(엔진 reason + 영향 범위). */
  why: string;
  /** 어디서 확인하는지(엔진 help). */
  help: string;
  inputKind: SamdoInputKind;
  unit?: string;
  /** 모를 때 고르는 말(정확히 몰라요 / 정확한 날짜를 몰라요 / 정확한 기간을 몰라요 / 기억나지 않아요 / 확인해 봐야 해요). */
  unknownLabel: string;
  answerKeys: string[];
  affects: { districts: string[]; supplyLabels: string[] };
};

export type CopilotProgress = { answered: number; pending: number; unknown: number };

export type CopilotRecommendationGroup = {
  districtId: SamdoDistrictId;
  label: string;
  recommended: string[];
  review: string[];
  difficult: string[];
};

const DISTRICT_LABEL: Record<SamdoDistrictId, string> = { 'samdo-1': '1지구', 'samdo-2': '2지구' };

const TONE: Record<SamdoEligibility, CopilotTone> = { ELIGIBLE: 'eligible', EVIDENCE_REQUIRED: 'review', CONDITIONAL: 'review', INELIGIBLE: 'difficult' };

/** 예/아니요 질문 문장. 값 true 의 뜻(applySamdoResolvedFact)과 같게 쓴다. */
const BOOLEAN_TITLE: Partial<Record<SamdoRefinementFactId, string>> = {
  currentResidence: '공고일 현재 제주에 살고 계세요?',
  longOverseasStay: '제주에 사는 동안 해외에 90일 넘게 계속 머문 적이 있나요?',
  firstRank: '청약통장 순위확인서에 이 공고 기준 1순위로 나오나요?',
  householdNoHome: '본인과 세대원 모두 지금 집이 없나요?',
  pastHomeOwnership: '본인이나 세대원이 예전에 집을 가진 적이 있나요?',
  specialSupplyHistory: '본인이나 세대원이 특별공급에 당첨된 적이 있나요?',
  reWinningRestriction: '재당첨 제한 대상인가요? (청약홈에 제한기간이 남아 있다고 나오나요?)',
  householdNoWinningFiveYears: '본인과 세대원 모두 최근 5년 안에 주택에 당첨된 적이 없나요?',
};

/** 사실 종류별 '모름' 표현(기존 행사 질문지와 같은 말). */
export function unknownLabelFor(factId: SamdoRefinementFactId, kind: SamdoInputKind): string {
  if (['longOverseasStay', 'pastHomeOwnership', 'specialSupplyHistory', 'householdNoWinningFiveYears'].includes(factId)) return '기억나지 않아요';
  if (factId === 'residenceMonths') return '정확한 기간을 몰라요';
  if (kind === 'DATE') return '정확한 날짜를 몰라요';
  if (kind === 'NUMBER') return '정확히 몰라요';
  return '확인해 봐야 해요';
}

function questionTitle(item: SamdoResolutionItem): string {
  if (item.inputKind === 'BOOLEAN') return BOOLEAN_TITLE[item.id] ?? `${item.label}에 해당하나요?`;
  if (item.inputKind === 'DATE') return `${item.label}이 언제인가요?`;
  return `${item.label}${item.unit === '원' ? '은 얼마인가요?' : item.unit ? `은 몇 ${item.unit}인가요?` : '을 알려 주세요.'}`;
}

const countsOf = (recommendation: SamdoRecommendation) => {
  const auto = recommendation.evaluations.filter(item => item.autoRecommend);
  return {
    eligible: auto.filter(item => item.eligibility === 'ELIGIBLE').length,
    review: auto.filter(item => item.eligibility === 'EVIDENCE_REQUIRED' || item.eligibility === 'CONDITIONAL').length,
    difficult: auto.filter(item => item.eligibility === 'INELIGIBLE').length,
  };
};

const focusOf = (recommendation: SamdoRecommendation): SamdoRecommendationItem | null =>
  recommendation.recommendedType ?? recommendation.alternatives[0] ?? recommendation.lowerPriorityTypes[0] ?? null;

function headlineOf(recommendation: SamdoRecommendation): { headline: string; tone: CopilotTone } {
  const focus = focusOf(recommendation);
  if (!focus) return { headline: '신청 가능한 유형 없음', tone: 'difficult' };
  const stage = focus.stage ? ` · ${SAMDO_STAGE_LABELS[focus.stage]}` : '';
  return { headline: `${focus.supplyLabel}${stage}`, tone: TONE[focus.eligibility] };
}

/** 현재 상태 요약(두 지구 합산 개수 + 지구별 한 줄). */
export function buildCopilotSummary(dual: SamdoDualAssessment, answerStates: AnswerStateMap): CopilotSummary {
  const totals = dual.districts.map(district => countsOf(district.recommendation));
  const pending = getUnresolvedAssessmentFacts(dual, answerStates).filter(fact => fact.state !== 'DOES_NOT_KNOW').length;
  return {
    eligible: totals.reduce((sum, item) => sum + item.eligible, 0),
    review: totals.reduce((sum, item) => sum + item.review, 0),
    difficult: totals.reduce((sum, item) => sum + item.difficult, 0),
    pending,
    districts: dual.districts.map(district => ({ id: district.district.id, label: DISTRICT_LABEL[district.district.id], ...headlineOf(district.recommendation) })),
  };
}

/**
 * 다음에 물을 질문. 엔진이 정한 순서(여러 지구·공급유형에 영향이 큰 것 먼저)를 그대로 따른다.
 * 이미 '모름'으로 답했거나 '나중에'로 미룬 것은 다시 묻지 않는다(같은 fact 재질문 0).
 */
export function nextCopilotQuestion(dual: SamdoDualAssessment, answerStates: AnswerStateMap, deferred: readonly string[] = []): CopilotQuestion | null {
  const definitions = new Map<string, SamdoResolutionItem>();
  for (const district of dual.districts) for (const item of buildSamdoResolutionCenter(district.recommendation, answerStates)) definitions.set(item.id, item);
  const fact = getUnresolvedAssessmentFacts(dual, answerStates).find(item => item.state !== 'DOES_NOT_KNOW' && !deferred.includes(item.factKey));
  if (!fact) return null;
  const item = definitions.get(fact.factKey);
  if (!item) return null;
  const districts = fact.districts.map(id => DISTRICT_LABEL[id]);
  const scope = fact.affectedSupplyLabels.length > 1
    ? `${districts.join('·')} ${fact.affectedSupplyLabels.length}개 공급유형의 자격에 함께 영향을 줘요.`
    : `${districts.join('·')} ${fact.affectedSupplyLabels[0] ?? ''} 판정에 영향을 줘요.`;
  return {
    factId: item.id,
    title: questionTitle(item),
    why: `${item.reason} ${scope}`.trim(),
    help: item.help,
    inputKind: item.inputKind,
    unit: item.unit,
    unknownLabel: unknownLabelFor(item.id, item.inputKind),
    answerKeys: item.answerKeys,
    affects: { districts, supplyLabels: fact.affectedSupplyLabels },
  };
}

/** 모름으로 남긴 질문과 나중에 답하기로 한 질문의 제목. '지금 할 일' 안내에 쓴다. */
export function copilotOpenItems(dual: SamdoDualAssessment, answerStates: AnswerStateMap, deferred: readonly string[] = []): { unknown: string[]; deferred: string[] } {
  const definitions = new Map<string, SamdoResolutionItem>();
  for (const district of dual.districts) for (const item of buildSamdoResolutionCenter(district.recommendation, answerStates)) definitions.set(item.id, item);
  const titleOf = (factKey: string) => { const item = definitions.get(factKey); return item ? questionTitle(item) : null; };
  const unresolved = getUnresolvedAssessmentFacts(dual, answerStates);
  const pick = (facts: typeof unresolved) => facts.map(fact => titleOf(fact.factKey)).filter((title): title is string => Boolean(title));
  return {
    unknown: pick(unresolved.filter(fact => fact.state === 'DOES_NOT_KNOW')),
    deferred: pick(unresolved.filter(fact => fact.state !== 'DOES_NOT_KNOW' && deferred.includes(fact.factKey))),
  };
}

export function copilotProgress(dual: SamdoDualAssessment, answerStates: AnswerStateMap): CopilotProgress {
  const unresolved = getUnresolvedAssessmentFacts(dual, answerStates);
  return {
    answered: Object.values(answerStates).filter(state => state === 'ANSWERED').length,
    pending: unresolved.filter(fact => fact.state !== 'DOES_NOT_KNOW').length,
    unknown: unresolved.filter(fact => fact.state === 'DOES_NOT_KNOW').length,
  };
}

/** 엔진 결과(추천/확인 필요/신청 어려움)를 대화 답변 문장으로. 확률·점수 표현은 쓰지 않는다. */
export function copilotRecommendationText(groups: CopilotRecommendationGroup[]): string {
  return groups.map(group => {
    const parts = [
      group.recommended.length ? `추천 ${group.recommended.join(', ')}` : '추천 없음',
      group.review.length ? `확인 필요 ${group.review.join(', ')}` : null,
      group.difficult.length ? `신청 어려움 ${group.difficult.join(', ')}` : null,
    ].filter(Boolean);
    return `${group.label}: ${parts.join(' · ')}`;
  }).join('\n');
}

export function copilotRecommendationGroups(dual: SamdoDualAssessment): CopilotRecommendationGroup[] {
  return dual.districts.map(district => {
    const rec = district.recommendation;
    // 요약 카드 개수와 같은 기준(엔진의 eligibility)으로 나눈다. 신청 가능한 유형은 엔진 추천 유형을 맨 앞에 둔다.
    const auto = rec.evaluations.filter(item => item.autoRecommend);
    const eligible = auto.filter(item => item.eligibility === 'ELIGIBLE').map(item => item.supplyLabel);
    const top = rec.recommendedType?.eligibility === 'ELIGIBLE' ? rec.recommendedType.supplyLabel : null;
    return {
      districtId: district.district.id,
      label: DISTRICT_LABEL[district.district.id],
      recommended: top ? [top, ...eligible.filter(label => label !== top)] : eligible,
      review: auto.filter(item => item.eligibility === 'EVIDENCE_REQUIRED' || item.eligibility === 'CONDITIONAL').map(item => item.supplyLabel),
      difficult: auto.filter(item => item.eligibility === 'INELIGIBLE').map(item => item.supplyLabel),
    };
  });
}

/* ── What-if: 현재 프로필과 분리된 가정 계산 ─────────────────────────────── */

export type CopilotWhatIfFact = { id: SamdoRefinementFactId; label: string; inputKind: SamdoInputKind; unit?: string };

/** 가정해 볼 수 있는 값(입력해 볼 만한 숫자·날짜·이력). */
export const WHAT_IF_FACTS: CopilotWhatIfFact[] = [
  { id: 'paymentCount', label: '청약통장 인정 납입횟수', inputKind: 'NUMBER', unit: '회' },
  { id: 'residenceMonths', label: '제주 연속 거주기간', inputKind: 'NUMBER', unit: '개월' },
  { id: 'depositAmount', label: '청약통장 인정 저축총액', inputKind: 'NUMBER', unit: '원' },
  { id: 'householdIncome', label: '세대 월평균소득', inputKind: 'NUMBER', unit: '원' },
  { id: 'totalAssets', label: '판정 대상 총자산', inputKind: 'NUMBER', unit: '원' },
  { id: 'reWinningRestriction', label: '재당첨 제한 대상', inputKind: 'BOOLEAN' },
];

export type CopilotWhatIfRow = {
  districtId: SamdoDistrictId;
  label: string;
  before: { headline: string; tone: CopilotTone };
  after: { headline: string; tone: CopilotTone };
  changed: boolean;
  newlyEligible: string[];
  noLongerEligible: string[];
};

export type CopilotWhatIf = { assumption: string; rows: CopilotWhatIfRow[] };

const eligibleLabels = (rec: SamdoRecommendation) => rec.evaluations.filter(item => item.autoRecommend && item.eligibility === 'ELIGIBLE').map(item => item.supplyLabel);

/**
 * 가정 결과. 입력 복사본에만 값을 넣고 같은 두 지구 판정 함수를 다시 돌린다.
 * 원본 answers·answerStates 는 바꾸지 않고, '내 정보에 적용' 같은 자동 반영도 하지 않는다.
 */
export function copilotWhatIf(answers: KioskAnswers, fact: CopilotWhatIfFact, value: string | number | boolean): CopilotWhatIf {
  const baseline = buildSamdoDualAssessment(samdoInputFromAnswers(answers));
  const assumed = applySamdoResolvedFact(answers, fact.id, value).answers;
  const simulated = buildSamdoDualAssessment(samdoInputFromAnswers(assumed));
  const valueText = typeof value === 'boolean' ? (value ? '예' : '아니요') : fact.unit === '원' ? `${Number(value).toLocaleString('ko-KR')}원` : `${value}${fact.unit ?? ''}`;
  return {
    assumption: `${fact.label} ${valueText}`,
    rows: baseline.districts.map((district, index) => {
      const before = headlineOf(district.recommendation);
      const afterRec = simulated.districts[index].recommendation;
      const after = headlineOf(afterRec);
      const beforeEligible = new Set(eligibleLabels(district.recommendation));
      const afterEligible = new Set(eligibleLabels(afterRec));
      return {
        districtId: district.district.id,
        label: DISTRICT_LABEL[district.district.id],
        before,
        after,
        changed: before.headline !== after.headline || before.tone !== after.tone,
        newlyEligible: [...afterEligible].filter(label => !beforeEligible.has(label)),
        noLongerEligible: [...beforeEligible].filter(label => !afterEligible.has(label)),
      };
    }),
  };
}

/* ── 대화 입력을 Copilot 동작으로(엔진 planner 가 오면 대체) ──────────────── */

export type CopilotIntent =
  | { kind: 'ASK_PENDING' }
  | { kind: 'WHY' }
  | { kind: 'DOES_NOT_KNOW' }
  | { kind: 'LATER' }
  | { kind: 'FIRST_TASK' }
  | { kind: 'RECOMMEND' }
  | { kind: 'WHAT_IF'; factId: SamdoRefinementFactId; value: number }
  | { kind: 'SERVER' };

/**
 * 화면 흐름 명령만 여기서 처리한다(질문 카드 열기·모름·나중에·왜·가정 열기). 내용 답변은 서버 상담으로 보낸다.
 * Codex 의 Copilot planner 가 생기면 이 함수 대신 planner 결과를 쓰면 된다.
 */
export function copilotIntent(text: string): CopilotIntent {
  const t = text.replace(/\s+/g, '');
  if (/(아직|안)알려준것.*물어|안알려준것만|빠진것만물어/.test(t)) return { kind: 'ASK_PENDING' };
  if (/왜.*(먼저|이걸|이것을|이질문).*물어|왜물어|왜이걸/.test(t)) return { kind: 'WHY' };
  if (/^(잘)?모르겠|^몰라|모르겠어요?$|기억(이)?안나/.test(t)) return { kind: 'DOES_NOT_KNOW' };
  if (/나중에(답|할)/.test(t)) return { kind: 'LATER' };
  const payment = /(청약)?통장.*?(\d+)\s*회.*(되면|이면|라면|면\??$)/.exec(text.replace(/\s+/g, ' '));
  if (payment) return { kind: 'WHAT_IF', factId: 'paymentCount', value: Number(payment[2]) };
  if (/가장먼저.*(할일|해야)|지금뭐부터|먼저해야할/.test(t)) return { kind: 'FIRST_TASK' };
  if (/(나한테|나에게|내게|내조건에?)맞는(청약|공급|유형)|(청약|공급유형)(을|를)?(찾아|추천해)/.test(t)) return { kind: 'RECOMMEND' };
  return { kind: 'SERVER' };
}
