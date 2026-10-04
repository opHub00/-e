import type { AssessmentPortfolioStatus } from './portfolio.ts';
import type { SupplyType } from './types.ts';

export type CoverageAnnouncement = {
  id: string;
  source: string;
  externalId: string | null;
  title: string;
  status: string;
};

export type CoverageMeasurement = {
  measured: boolean;
  count: number | null;
  total: number;
  totalRate: number | null;
  previousCount: number | null;
  previousDropRate: number | null;
  methodology: string;
};

export type CoverageFunnelInput = {
  total: number;
  documents: number;
  parsing: number | null;
  extraction: number | null;
  ruleSets: number;
  reviewed: number;
  activePublicApproved: number;
  listingBindings: number;
  deterministic: number;
  portfolioExposable: number;
};

export type CoverageFunnel = Record<
  'TOTAL' | 'DOCUMENT' | 'PARSING' | 'EXTRACTION' | 'RULE_SET' | 'HUMAN_REVIEW'
  | 'ACTIVE_PUBLIC_APPROVED' | 'LISTING_BINDING' | 'DETERMINISTIC' | 'PORTFOLIO',
  CoverageMeasurement
>;

export type CoveragePortfolioRun = {
  profileId: string;
  listingId: string;
  supplyType: SupplyType;
  status: AssessmentPortfolioStatus;
  missingUserFields: string[];
  missingAnnouncementFields: string[];
  unavailableReason?: string;
};

export type MissingFieldCoverage = {
  field: string;
  affectedListings: number;
  affectedResults: number;
  supplyTypes: SupplyType[];
  becomesCalculableCount: number;
};

const TEST_MARKERS = /(^|[^a-z0-9])(test|fixture|demo)([^a-z0-9]|$)|테스트|시연용/i;

/** Runtime rows are counted separately from explicit test/demo fixtures. LOCAL_DRAFT alone is not a test marker. */
export function isTestFixtureAnnouncement(announcement: CoverageAnnouncement): boolean {
  return [announcement.source, announcement.externalId ?? '', announcement.title].some(value => TEST_MARKERS.test(value));
}

const measured = (count: number | null, total: number, previous: number | null, methodology: string): CoverageMeasurement => ({
  measured: count !== null,
  count,
  total,
  totalRate: count === null ? null : total === 0 ? 0 : count / total,
  previousCount: previous,
  previousDropRate: count === null || previous === null || previous === 0 ? null : (previous - count) / previous,
  methodology,
});

export function buildCoverageFunnel(input: CoverageFunnelInput): CoverageFunnel {
  const total = measured(input.total, input.total, input.total, 'Operational announcements after explicit test/fixture exclusion.');
  const document = measured(input.documents, input.total, input.total, 'Announcement has at least one immutable source document row.');
  const parsing = measured(input.parsing, input.total, input.documents, input.parsing === null
    ? 'NOT_MEASURED: parsed artifact status is not persisted in the current registry.'
    : 'Announcement has a persisted successful parsing artifact.');
  const extractionPrevious = input.parsing ?? input.documents;
  const extraction = measured(input.extraction, input.total, extractionPrevious, input.extraction === null
    ? 'NOT_MEASURED: extraction job lineage is absent for the observed RuleSets.'
    : 'Announcement has a successful extraction job.');
  const ruleSet = measured(input.ruleSets, input.total, input.extraction ?? extractionPrevious, 'Announcement has at least one RuleSet version.');
  const review = measured(input.reviewed, input.total, input.ruleSets, 'RuleSet has approved_at and an APPROVED administrator decision.');
  const active = measured(input.activePublicApproved, input.total, input.reviewed, 'RuleSet is active, public and approved.');
  const binding = measured(input.listingBindings, input.total, input.activePublicApproved, 'Active RuleSet has an explicit listing binding to its own id.');
  const deterministic = measured(input.deterministic, input.total, input.listingBindings, 'Bound active RuleSet decodes under the current deterministic schema.');
  const portfolio = measured(input.portfolioExposable, input.total, input.deterministic, 'Decoded RuleSet contains at least one currently supported supply type.');
  return { TOTAL: total, DOCUMENT: document, PARSING: parsing, EXTRACTION: extraction, RULE_SET: ruleSet,
    HUMAN_REVIEW: review, ACTIVE_PUBLIC_APPROVED: active, LISTING_BINDING: binding,
    DETERMINISTIC: deterministic, PORTFOLIO: portfolio };
}

export function aggregatePortfolioRuns(runs: readonly CoveragePortfolioRun[]) {
  const statuses: Record<AssessmentPortfolioStatus, number> = {
    COMPLETE: 0, NEEDS_USER_INPUT: 0, INELIGIBLE: 0, UNAVAILABLE: 0,
  };
  const byProfile: Record<string, Record<AssessmentPortfolioStatus, number>> = {};
  const unavailableByReason: Record<string, number> = {};
  const unavailableListings = new Set<string>();
  for (const run of runs) {
    statuses[run.status] += 1;
    byProfile[run.profileId] ??= { COMPLETE: 0, NEEDS_USER_INPUT: 0, INELIGIBLE: 0, UNAVAILABLE: 0 };
    byProfile[run.profileId][run.status] += 1;
    if (run.status === 'UNAVAILABLE') {
      unavailableListings.add(run.listingId);
      const reason = run.unavailableReason ?? 'OTHER';
      unavailableByReason[reason] = (unavailableByReason[reason] ?? 0) + 1;
    }
  }
  const interpreted = statuses.COMPLETE + statuses.NEEDS_USER_INPUT + statuses.INELIGIBLE;
  return { total: runs.length, statuses, byProfile, unavailableByReason, unavailableListings: unavailableListings.size,
    interpreted, interpretedRate: runs.length ? interpreted / runs.length : null };
}

const normalizedField = (field: string) => field.replace(/^input:/, '');

export function aggregateCoverageMissingFields(runs: readonly CoveragePortfolioRun[]): MissingFieldCoverage[] {
  const groups = new Map<string, { listings: Set<string>; results: number; supplies: Set<SupplyType>; calculable: number }>();
  for (const run of runs.filter(item => item.status === 'NEEDS_USER_INPUT')) {
    const fields = [...new Set(run.missingUserFields.map(normalizedField))];
    for (const field of fields) {
      const group = groups.get(field) ?? { listings: new Set(), results: 0, supplies: new Set(), calculable: 0 };
      group.listings.add(run.listingId);
      group.results += 1;
      group.supplies.add(run.supplyType);
      if (fields.length === 1 && run.missingAnnouncementFields.length === 0) group.calculable += 1;
      groups.set(field, group);
    }
  }
  return [...groups.entries()].map(([field, group]) => ({
    field,
    affectedListings: group.listings.size,
    affectedResults: group.results,
    supplyTypes: [...group.supplies].sort(),
    becomesCalculableCount: group.calculable,
  })).sort((a, b) => b.becomesCalculableCount - a.becomesCalculableCount
    || b.affectedResults - a.affectedResults || a.field.localeCompare(b.field));
}

export type CoverageOperationsMetrics = {
  totalActiveListings: number;
  assessableListings: number;
  unavailableListings: number;
  activeRuleSetCoverageRate: number | null;
  listingBindingCoverageRate: number | null;
  unavailableByReason: Record<string, number>;
  missingFactTopN: MissingFieldCoverage[];
  assessmentSuccessRate: number | null;
  staleResultCount: number | null;
};

export function coverageOperationsMetrics(input: {
  funnel: CoverageFunnel;
  portfolio: ReturnType<typeof aggregatePortfolioRuns>;
  missing: MissingFieldCoverage[];
}): CoverageOperationsMetrics {
  return {
    totalActiveListings: input.funnel.ACTIVE_PUBLIC_APPROVED.count ?? 0,
    assessableListings: input.funnel.DETERMINISTIC.count ?? 0,
    unavailableListings: input.portfolio.unavailableListings,
    activeRuleSetCoverageRate: input.funnel.ACTIVE_PUBLIC_APPROVED.totalRate,
    listingBindingCoverageRate: input.funnel.LISTING_BINDING.totalRate,
    unavailableByReason: input.portfolio.unavailableByReason,
    missingFactTopN: input.missing.slice(0, 10),
    assessmentSuccessRate: input.portfolio.interpretedRate,
    staleResultCount: null,
  };
}
