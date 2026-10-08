import type { EvaluationResult } from '../frozen/domain/evaluation.ts';
import type { FrozenListingDataset } from '../frozen/domain/rules.ts';
import { buildRuleFactInventory } from '../adaptiveAssessment.ts';
import { selectionMethodLabel, type KioskEvidence, type KioskOutcome } from '../evaluate.ts';
import { factLabel, humanize, humanizeAll } from '../presentation.ts';

/**
 * 판정 결과(EvaluationResult)를 방문자가 읽는 설명으로 바꾼다.
 *
 * 판정은 다시 하지 않는다. 엔진이 낸 결과를 나누고, 이름을 붙이고, 순서를 정할 뿐이다.
 * 여기서 나오는 모든 문장은 presentation.ts 를 거쳐 기계용 키가 남지 않는다.
 */
export type ExplanationTone = 'good' | 'warn' | 'bad' | 'neutral';

export type ScoreExplanation =
  | { status: 'AVAILABLE'; title: string; body: string; total: number; max: number; items: { label: string; points: number; max: number }[] }
  | { status: 'NOT_APPLICABLE'; title: string; body: string }
  | { status: 'PENDING'; title: string; body: string; needs: string[] };

export type SourceExplanation = { title: string; section: string; page?: number; excerpt?: string; url?: string };

export type ListingExplanation = {
  verdict: { tone: ExplanationTone; title: string; body: string };
  /** 결론을 가장 잘 설명하는 세 줄. 카드·상담 첫 답에 쓴다. */
  reasons: string[];
  satisfied: string[];
  /** 엔진이 '충족하지 못함'으로 확정한 조건. */
  unmet: string[];
  /** 방문자가 답하면 판정이 바뀔 수 있는 정보. */
  toConfirm: string[];
  /** 말로 답할 수 없고 서류로 확인해야 하는 것. */
  documents: string[];
  priority: { label: string | null; body: string };
  score: ScoreExplanation;
  notes: string[];
  sources: SourceExplanation[];
  nextSteps: string[];
};

const evidenceOnlyCache = new WeakMap<FrozenListingDataset, Set<string>>();
/** 서류로만 확인할 수 있는 사실. 질문지(adaptiveAssessment)가 정한 분류를 그대로 쓴다. */
export function evidenceOnlyFacts(dataset: FrozenListingDataset): Set<string> {
  let cached = evidenceOnlyCache.get(dataset);
  if (!cached) {
    cached = new Set(buildRuleFactInventory(dataset).filter(row => row.classification === 'EVIDENCE_ONLY').map(row => row.factKey));
    evidenceOnlyCache.set(dataset, cached);
  }
  return cached;
}

const RAW_FACT = /^(?:applicant|spouse|household|family|profile|event|score)\.|^(?:input|rule|fact|review):/;

function scoreExplanation(result: EvaluationResult, evidenceOnly: Set<string>): ScoreExplanation {
  const score = result.officialScore;
  if (score.status === 'AVAILABLE') {
    return {
      status: 'AVAILABLE',
      title: `공식 배점 ${score.total} / ${score.max}점`,
      body: '모집공고 배점표의 항목별 점수를 더한 값이에요. 완판e 추천도와는 다른 값이에요.',
      total: score.total,
      max: score.max,
      items: score.breakdown.map(item => ({ label: humanize(item.label), points: item.points, max: item.max })),
    };
  }
  if (score.status === 'NOT_APPLICABLE') {
    return {
      status: 'NOT_APPLICABLE',
      title: '해당 없음',
      body: `이 공급은 공식 배점표가 아니라 ${selectionMethodLabel(result.selectionMethod)} 방식으로 정해요. 점수가 0점이라는 뜻이 아니에요.`,
    };
  }
  const needs = humanizeAll(score.missingInformation.map(fact => factLabel(fact)));
  const documentsOnly = score.missingInformation.length > 0 && score.missingInformation.every(fact => evidenceOnly.has(fact));
  return {
    status: 'PENDING',
    title: documentsOnly ? '서류 확인 필요' : '정보·서류 확인 필요',
    body: needs.length
      ? `${documentsOnly ? '증빙 서류로' : '아래 정보를'} 확인하면 공식 배점을 계산할 수 있어요. 0점으로 처리하지 않았어요.`
      : '자격과 순위가 먼저 정해져야 공식 배점을 계산할 수 있어요. 0점으로 처리하지 않았어요.',
    needs,
  };
}

function priorityExplanation(result: EvaluationResult): ListingExplanation['priority'] {
  const priority = result.priority;
  if (priority.status === 'DETERMINED') {
    const label = humanize(priority.label);
    return { label, body: `입력하신 조건으로는 ${label}에 해당해요.` };
  }
  if (result.selectionMethod === 'LOTTERY') return { label: '추첨', body: '이 공급은 순위 없이 추첨으로 정해요.' };
  return { label: null, body: humanize(priority.reason) };
}

function sourcesOf(evidence: KioskEvidence[], fallbackUrl: string | null): SourceExplanation[] {
  const items = evidence.map(item => ({
    title: humanize(item.label),
    section: humanize(item.section),
    ...(item.page === undefined ? {} : { page: item.page }),
    ...(item.textExcerpt ? { excerpt: item.textExcerpt } : {}),
    ...(item.sourceUrl ? { url: item.sourceUrl } : {}),
  }));
  if (!items.length && fallbackUrl) return [{ title: '모집공고 원문', section: '공고문', url: fallbackUrl }];
  return items;
}

export function explainResult(
  result: EvaluationResult,
  evidenceOnly: Set<string>,
  context: { evidence?: KioskEvidence[]; sourceUrl?: string | null } = {},
): ListingExplanation {
  const satisfied = humanizeAll(result.matchedRules.map(rule => rule.label));
  const unmet = humanizeAll(result.failedRules.filter(rule => rule.outcome === 'FAIL').map(rule => rule.label));

  const reviewDocs = result.failedRules.filter(rule => rule.outcome === 'REVIEW').map(rule => rule.label);
  const evidenceFacts = result.unresolvedFacts.filter(fact => evidenceOnly.has(fact)).map(fact => factLabel(fact));
  const documents = humanizeAll([...reviewDocs, ...evidenceFacts]);

  // missingInformation 에는 사람용 라벨과 기계용 키가 섞여 있다. 서류로만 확인할 키는 서류 쪽으로 보낸다.
  const askable = result.missingInformation.filter(item => !(RAW_FACT.test(item) && evidenceOnly.has(item)));
  const toConfirm = humanizeAll(askable).filter(item => !documents.includes(item));

  const score = scoreExplanation(result, evidenceOnly);
  const priority = priorityExplanation(result);

  let verdict: ListingExplanation['verdict'];
  let reasons: string[];
  switch (result.eligibility) {
    case 'ELIGIBLE':
      verdict = {
        tone: 'good',
        title: '신청할 수 있어요',
        body: `입력하신 정보로 이 공급의 신청 자격 조건${satisfied.length ? ` ${satisfied.length}개` : ''}를 확인했어요.${priority.label ? ` ${priority.body}` : ''}`,
      };
      reasons = satisfied.slice(0, 3);
      break;
    case 'INELIGIBLE':
      verdict = { tone: 'bad', title: '이 공급은 신청이 어려워요', body: '아래 조건을 충족하지 못해서 신청이 어려워요. 다른 공급유형을 함께 살펴보세요.' };
      reasons = unmet.slice(0, 3);
      break;
    case 'REVIEW_REQUIRED':
      verdict = { tone: 'warn', title: '서류로 확인해야 판정할 수 있어요', body: '자동으로 확정할 수 없는 조건이 있어요. 아래 서류로 확인하면 결과가 정해져요.' };
      reasons = [...documents, ...toConfirm].slice(0, 3);
      break;
    default:
      verdict = { tone: 'warn', title: '몇 가지만 확인하면 판정할 수 있어요', body: '아래 정보를 알면 신청할 수 있는지 판정할 수 있어요. 모르는 값을 불리하게 가정하지 않았어요.' };
      reasons = [...toConfirm, ...documents].slice(0, 3);
  }

  const nextSteps: string[] = [];
  if (result.eligibility === 'ELIGIBLE') nextSteps.push('모집공고의 접수 일정과 제출 서류를 확인하세요.');
  if (toConfirm.length) nextSteps.push(`${toConfirm[0]}${toConfirm.length > 1 ? ` 외 ${toConfirm.length - 1}개` : ''}를 확인하면 결과가 더 정확해져요.`);
  if (documents.length) nextSteps.push(`${documents[0]}${documents.length > 1 ? ` 외 ${documents.length - 1}개` : ''}는 증빙 서류로 확인해야 해요.`);
  if (result.eligibility === 'INELIGIBLE') nextSteps.push('결과 목록에서 신청 가능한 다른 공급을 확인해 보세요.');

  return {
    verdict,
    reasons,
    satisfied,
    unmet,
    toConfirm,
    documents,
    priority,
    score,
    notes: humanizeAll(result.warnings),
    sources: sourcesOf(context.evidence ?? [], context.sourceUrl ?? null),
    nextSteps,
  };
}

/** 규칙이 없는 공고처럼 판정 결과 자체가 없는 경우. */
function explainUnavailable(outcome: KioskOutcome): ListingExplanation {
  return {
    verdict: { tone: 'neutral', title: '지금은 판정할 수 없어요', body: '완판e가 이 공고의 신청 조건을 아직 확인하지 않았어요. 모집공고 원문을 직접 확인해 주세요.' },
    reasons: [],
    satisfied: [],
    unmet: [],
    toConfirm: [],
    documents: [],
    priority: { label: null, body: '판정 전이라 순위를 정하지 않았어요.' },
    score: { status: 'PENDING', title: '정보 확인 필요', body: '판정 전이라 공식 배점을 계산하지 않았어요.', needs: [] },
    notes: [],
    sources: sourcesOf(outcome.evidence, outcome.listing.sourceUrl),
    nextSteps: ['모집공고 원문에서 신청 자격을 확인해 주세요.'],
  };
}

/** 카드·요약에 쓰는 짧은 주의 목록. 확정된 부족 조건 → 확인할 정보 → 서류 순서. */
export function cautionLines(explanation: ListingExplanation): string[] {
  return [
    ...explanation.unmet,
    ...explanation.toConfirm.map(item => `확인 필요 · ${item}`),
    ...explanation.documents.map(item => `서류 확인 · ${item}`),
  ];
}

export function explainOutcome(outcome: KioskOutcome, evidenceOnly: Set<string>): ListingExplanation {
  if (!outcome.result) return explainUnavailable(outcome);
  return explainResult(outcome.result, evidenceOnly, { evidence: outcome.evidence, sourceUrl: outcome.listing.sourceUrl });
}
