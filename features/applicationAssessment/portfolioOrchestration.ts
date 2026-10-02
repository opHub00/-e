import type { AssessmentPortfolioItem, MissingProfileFactImpact, PortfolioCandidatePriority, PortfolioListingSummary } from './portfolioContract.ts';
import type { PersistedUserAssessmentResult, AssessmentResultFreshness } from './resultPersistence.ts';
import { detectAssessmentResultStaleness } from './resultPersistence.ts';
import { staleReasonToUiState, type AssessmentResultFreshnessStatus } from './serverExecution.ts';
import type { SupplyType } from './types.ts';

export const DEFAULT_PORTFOLIO_LIMIT = 8;
export const MAX_PORTFOLIO_LIMIT = 12;

export type PortfolioCandidate = {
  listing: PortfolioListingSummary;
  supplyType: SupplyType;
  priority: PortfolioCandidatePriority;
  ruleSetId: string;
  ruleSetVersion: string;
  sourceDocumentHash: string | null;
};

export type PortfolioCandidateSource = Omit<PortfolioCandidate, 'priority'>;

const priorityRank: Record<PortfolioCandidatePriority, number> = {
  SAVED: 0, PREFERRED_REGION: 1, OTHER_ACTIVE: 2,
};

const normalizeRegion = (value: string) => value.replace(/\s+/g, '').toLowerCase();

export function selectPortfolioCandidates(input: {
  candidates: PortfolioCandidateSource[];
  savedListingIds: readonly string[];
  preferredRegions: readonly string[];
  limit?: number;
}): { candidates: PortfolioCandidate[]; truncated: boolean; total: number } {
  const saved = new Set(input.savedListingIds);
  const regions = input.preferredRegions.map(normalizeRegion).filter(Boolean);
  const deduplicated = new Map<string, PortfolioCandidate>();
  for (const candidate of input.candidates) {
    const key = `${candidate.listing.listingId}:${candidate.supplyType}`;
    if (deduplicated.has(key)) continue;
    const listingRegion = normalizeRegion(candidate.listing.region ?? '');
    const priority: PortfolioCandidatePriority = saved.has(candidate.listing.listingId)
      ? 'SAVED'
      : listingRegion && regions.some(region => listingRegion === region || listingRegion.includes(region) || region.includes(listingRegion))
        ? 'PREFERRED_REGION'
        : 'OTHER_ACTIVE';
    deduplicated.set(key, { ...candidate, priority });
  }
  const all = [...deduplicated.values()].sort((a, b) =>
    priorityRank[a.priority] - priorityRank[b.priority]
      || (b.listing.announcementDate ?? '').localeCompare(a.listing.announcementDate ?? '')
      || a.listing.listingId.localeCompare(b.listing.listingId)
      || a.supplyType.localeCompare(b.supplyType));
  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_PORTFOLIO_LIMIT, MAX_PORTFOLIO_LIMIT));
  return { candidates: all.slice(0, limit), truncated: all.length > limit, total: all.length };
}

export function freshnessForResult(
  result: PersistedUserAssessmentResult,
  current: AssessmentResultFreshness,
): AssessmentResultFreshnessStatus {
  return staleReasonToUiState(result.stale.reason ?? detectAssessmentResultStaleness(result, current) ?? undefined);
}

export function portfolioItemFromResult(input: {
  candidate: PortfolioCandidate;
  result: PersistedUserAssessmentResult;
  freshness: AssessmentResultFreshnessStatus;
}): AssessmentPortfolioItem {
  const { candidate, result } = input;
  return {
    listingId: candidate.listing.listingId,
    announcementId: candidate.listing.announcementId,
    supplyType: candidate.supplyType,
    listing: candidate.listing,
    priority: candidate.priority,
    analysisStatus: result.portfolioStatus,
    eligibilityStatus: result.eligibilityStatus,
    scoringStatus: result.scoringStatus,
    score: result.score?.total ?? null,
    scoreMax: result.score?.max ?? null,
    stage: result.stage,
    missingUserFields: [...result.missingUserFields],
    missingAnnouncementFields: [...result.missingAnnouncementFields],
    freshness: input.freshness,
    calculatedAt: result.calculatedAt,
    provenance: {
      resultId: result.id,
      ruleSetId: result.ruleSetId,
      ruleSetVersion: result.ruleSetVersion,
      sourceDocumentId: result.sourceDocumentId,
      sourceDocumentHash: result.sourceDocumentHash,
      profileRevision: result.profileRevision,
      engineVersion: result.engineVersion,
    },
  };
}

const fieldName = (value: string) => value.startsWith('input:') ? value.slice(6) : value;

export function aggregateMissingProfileFacts(items: readonly AssessmentPortfolioItem[]): MissingProfileFactImpact[] {
  const grouped = new Map<string, { listings: Set<string>; resultIds: Set<string>; oneMissing: number; total: number }>();
  for (const item of items) {
    const unique = new Set(item.missingUserFields.map(fieldName).filter(Boolean));
    for (const field of unique) {
      const group = grouped.get(field) ?? { listings: new Set(), resultIds: new Set(), oneMissing: 0, total: 0 };
      group.listings.add(item.listingId);
      if (item.provenance.resultId) group.resultIds.add(item.provenance.resultId);
      group.total += 1;
      if (unique.size === 1 && item.analysisStatus === 'NEEDS_USER_INPUT') group.oneMissing += 1;
      grouped.set(field, group);
    }
  }
  return [...grouped.entries()].map(([field, group]) => ({
    field,
    affectedListingCount: group.listings.size,
    affectedResultIds: [...group.resultIds].sort(),
    priority: group.oneMissing * 1000 + group.listings.size,
    completionImpact: { becomesCalculableCount: group.oneMissing, reducesMissingCount: group.total },
  })).sort((a, b) => b.priority - a.priority || a.field.localeCompare(b.field));
}

export function summarizeFreshness(items: readonly AssessmentPortfolioItem[]) {
  const byReason: Partial<Record<Exclude<AssessmentResultFreshnessStatus, 'FRESH'>, number>> = {};
  for (const item of items) if (item.freshness !== 'FRESH') byReason[item.freshness] = (byReason[item.freshness] ?? 0) + 1;
  const stale = items.filter(item => item.freshness !== 'FRESH').length;
  return { fresh: items.length - stale, stale, byReason };
}

export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(values.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < values.length) {
      const index = cursor++;
      try { results[index] = { status: 'fulfilled', value: await operation(values[index], index) }; }
      catch (reason) { results[index] = { status: 'rejected', reason }; }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, values.length || 1)) }, worker));
  return results;
}
