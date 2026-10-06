import { BUCKET_LABELS, missingCaution, type KioskBucket, type KioskEvaluation, type KioskOutcome } from './evaluate.ts';
import { HOUSEHOLD_TYPES, type HouseholdType } from './model.ts';

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

const itemOf = (outcome: KioskOutcome): SummaryItem => ({
  title: outcome.listing.title,
  supply: outcome.supplyLabel,
  bucket: outcome.bucket,
  stage: outcome.stageLabel,
  note: outcome.cautions[0] ?? null,
});

export function buildSummary(input: {
  eventId: string;
  householdType: HouseholdType | null;
  evaluation: KioskEvaluation;
  favoriteIds: string[];
}): ResultSummary {
  const recommended = input.evaluation.outcomes.filter(outcome => outcome.bucket === 'eligible').slice(0, 3);
  const favorites = input.favoriteIds
    .map(id => input.evaluation.outcomes.find(outcome => outcome.id === id))
    .filter((outcome): outcome is KioskOutcome => Boolean(outcome));
  const focus = favorites.length ? favorites : recommended;
  const cautions = [...new Set(focus.flatMap(outcome => [...outcome.failed, ...outcome.missing.map(missingCaution)]))].slice(0, 4);
  return {
    v: 1,
    event: input.eventId,
    date: input.evaluation.evaluatedAt.slice(0, 10),
    household: HOUSEHOLD_TYPES.find(type => type.key === input.householdType)?.label ?? null,
    counts: { ...input.evaluation.counts },
    recommended: recommended.map(itemOf),
    favorites: favorites.map(itemOf),
    cautions,
  };
}

export const bucketLabel = (bucket: KioskBucket): string => BUCKET_LABELS[bucket];
