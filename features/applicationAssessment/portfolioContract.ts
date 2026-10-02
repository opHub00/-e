import type { AssessmentPortfolioStatus } from './portfolio.ts';
import type { PersistedUserAssessmentResult } from './resultPersistence.ts';
import type { AssessmentResultFreshnessStatus } from './serverExecution.ts';
import type { Stage, Status, SupplyType } from './types.ts';

export type PortfolioCandidatePriority = 'SAVED' | 'PREFERRED_REGION' | 'OTHER_ACTIVE';

export type PortfolioListingSummary = {
  listingId: string;
  announcementId: string;
  title: string;
  region: string | null;
  announcementDate: string | null;
};

export type PortfolioProvenanceReference = {
  resultId: string | null;
  ruleSetId: string | null;
  ruleSetVersion: string | null;
  sourceDocumentId: string | null;
  sourceDocumentHash: string | null;
  profileRevision: number;
  engineVersion: string;
};

export type AssessmentPortfolioItem = {
  listingId: string;
  announcementId: string;
  supplyType: SupplyType;
  listing: PortfolioListingSummary;
  priority: PortfolioCandidatePriority;
  analysisStatus: AssessmentPortfolioStatus;
  eligibilityStatus: Status | null;
  scoringStatus: PersistedUserAssessmentResult['scoringStatus'];
  score: number | null;
  scoreMax: number | null;
  stage: Stage | null;
  missingUserFields: string[];
  missingAnnouncementFields: string[];
  freshness: AssessmentResultFreshnessStatus;
  calculatedAt: string | null;
  provenance: PortfolioProvenanceReference;
  failureCode?: string;
};

export type MissingProfileFactImpact = {
  field: string;
  affectedListingCount: number;
  affectedResultIds: string[];
  priority: number;
  completionImpact: {
    becomesCalculableCount: number;
    reducesMissingCount: number;
  };
};

export type PortfolioFreshnessSummary = {
  fresh: number;
  stale: number;
  byReason: Partial<Record<Exclude<AssessmentResultFreshnessStatus, 'FRESH'>, number>>;
};

export type AssessmentPortfolioSnapshot = {
  userId: string;
  profileRevision: number;
  generatedAt: string;
  limit: number;
  truncated: boolean;
  items: AssessmentPortfolioItem[];
  missingProfileFacts: MissingProfileFactImpact[];
  freshness: PortfolioFreshnessSummary;
};

export type PortfolioRefreshSummary = {
  considered: number;
  reused: number;
  recalculated: number;
  failed: number;
};

export type PortfolioRefreshResponse = {
  portfolio: AssessmentPortfolioSnapshot;
  refresh: PortfolioRefreshSummary;
};

