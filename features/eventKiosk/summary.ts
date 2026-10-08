import { BUCKET_LABELS, missingCaution, type KioskBucket, type KioskEvaluation, type KioskOutcome } from './evaluate.ts';
import { HOUSEHOLD_TYPES, type HouseholdType } from './model.ts';
import { humanize, humanizeAll } from './experience/labels.ts';
import { cautionLines, explainOutcome } from './experience/explain.ts';

/** Privacy-reduced payload stored behind an opaque, expiring result token. */
export type SummaryItem = {
  title: string;
  supply: string;
  bucket: KioskBucket;
  stage: string | null;
  note: string | null;
};

export type ResultSummary = {
  v: 1;
  event: string;
  date: string;
  household: string | null;
  counts: Record<KioskBucket, number>;
  recommended: SummaryItem[];
  favorites: SummaryItem[];
  cautions: string[];
};

/** 설명 계층과 같은 기준(부족 → 확인 필요 → 서류)으로 한 줄 메모를 고른다. 데이터셋이 없으면 기존 문구를 정리해 쓴다. */
const noteOf = (outcome: KioskOutcome, evidenceOnly?: Set<string>): string | null => {
  if (evidenceOnly) return cautionLines(explainOutcome(outcome, evidenceOnly))[0] ?? null;
  return outcome.cautions[0] ? humanize(outcome.cautions[0]) : null;
};

const itemOf = (outcome: KioskOutcome, evidenceOnly?: Set<string>): SummaryItem => ({
  title: outcome.listing.title,
  supply: outcome.supplyLabel,
  bucket: outcome.bucket,
  stage: outcome.stageLabel ? humanize(outcome.stageLabel) : null,
  // 휴대폰 요약에도 기계용 키가 나가지 않게 사람용 문구로 바꿔 담는다.
  note: noteOf(outcome, evidenceOnly),
});

export function buildSummary(input: {
  eventId: string;
  householdType: HouseholdType | null;
  evaluation: KioskEvaluation;
  favoriteIds: string[];
  /** 서류로만 확인하는 사실. 넘기면 메모·주의사항을 상세 화면과 같은 기준으로 만든다. */
  evidenceOnly?: Set<string>;
}): ResultSummary {
  const recommended = input.evaluation.outcomes.filter(outcome => outcome.bucket === 'eligible').slice(0, 3);
  const favorites = input.favoriteIds
    .map(id => input.evaluation.outcomes.find(outcome => outcome.id === id))
    .filter((outcome): outcome is KioskOutcome => Boolean(outcome));
  const focus = favorites.length ? favorites : recommended;
  const cautions = (input.evidenceOnly
    ? humanizeAll(focus.flatMap(outcome => cautionLines(explainOutcome(outcome, input.evidenceOnly!))))
    : humanizeAll(focus.flatMap(outcome => [...outcome.failed, ...outcome.missing.map(item => missingCaution(humanize(item)))]))).slice(0, 4);
  return {
    v: 1,
    event: input.eventId,
    date: input.evaluation.evaluatedAt.slice(0, 10),
    household: HOUSEHOLD_TYPES.find(type => type.key === input.householdType)?.label ?? null,
    counts: { ...input.evaluation.counts },
    recommended: recommended.map(outcome => itemOf(outcome, input.evidenceOnly)),
    favorites: favorites.map(outcome => itemOf(outcome, input.evidenceOnly)),
    cautions,
  };
}

export const bucketLabel = (bucket: KioskBucket): string => BUCKET_LABELS[bucket];
