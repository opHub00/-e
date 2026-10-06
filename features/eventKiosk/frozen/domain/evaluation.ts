import type { RuleSourceStatus, SelectionMethod, SupplyType } from './rules.ts';

export type Eligibility = 'ELIGIBLE' | 'INELIGIBLE' | 'NEEDS_MORE_INFORMATION' | 'REVIEW_REQUIRED';

export type Priority =
  | { status: 'DETERMINED'; rank: number; code: string; label: string }
  | { status: 'PENDING'; reason: string }
  | { status: 'NOT_APPLICABLE'; reason: string };

export type OfficialScore =
  | {
      status: 'AVAILABLE';
      total: number;
      max: number;
      breakdown: Array<{
        ruleId: string;
        label: string;
        input: number;
        points: number;
        max: number;
        evidenceId: string;
      }>;
    }
  | { status: 'PENDING'; reason: string; missingInformation: string[] }
  | { status: 'NOT_APPLICABLE'; reason: string };

export type WanpanScore = {
  score: number;
  max: 100;
  methodVersion: 'WANPAN_FIT_2026_10_V1';
  disclaimer: string;
  breakdown: Array<{
    key: 'ELIGIBILITY' | 'PRIORITY' | 'INFORMATION_READINESS' | 'OFFICIAL_COMPETITIVENESS';
    label: string;
    points: number;
    max: number;
    explanation: string;
  }>;
};

export type RuleTrace = {
  ruleId: string;
  label: string;
  outcome: 'PASS' | 'FAIL' | 'UNKNOWN' | 'REVIEW';
  evidenceId: string;
  inputs: Record<string, unknown>;
  missingFacts: string[];
};

export type Confidence = {
  level: 'HIGH' | 'MEDIUM' | 'LOW';
  score: number;
  reasons: string[];
};

export type EvaluationResult = {
  evaluationId: string;
  listingId: string;
  listingTitle: string;
  rulePackageId: string;
  rulePackageVersion: string;
  sourceStatus: RuleSourceStatus;
  supplyType: SupplyType;
  supplyLabel: string;
  selectionMethod: SelectionMethod;
  eligibility: Eligibility;
  priority: Priority;
  officialScore: OfficialScore;
  wanpanScore: WanpanScore;
  missingInformation: string[];
  matchedRules: RuleTrace[];
  failedRules: RuleTrace[];
  warnings: string[];
  confidence: Confidence;
  evidenceIds: string[];
  evaluatedAt: string;
};
