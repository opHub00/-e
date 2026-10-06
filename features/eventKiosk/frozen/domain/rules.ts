export type Scalar = string | number | boolean;
export type FactValue = Scalar | readonly Scalar[];

export type SupplyType =
  | 'GENERAL'
  | 'COLLEGE_STUDENT'
  | 'YOUTH'
  | 'NEWLYWED'
  | 'NEWLYWED_SINGLE_PARENT'
  | 'NEWLYWED_NEWBORN_I'
  | 'FIRST_HOME'
  | 'MULTI_CHILD'
  | 'SENIOR'
  | 'HOUSING_BENEFIT'
  | 'ELDERLY_PARENT'
  | 'INSTITUTION_RECOMMENDATION';

export type SelectionMethod =
  | 'QUALIFICATION_ONLY'
  | 'PRIORITY'
  | 'OFFICIAL_SCORE'
  | 'LOTTERY'
  | 'MIXED';

export type RuleSourceStatus = 'REFERENCE' | 'DRAFT_SOURCE_VERIFIED' | 'OFFICIAL_VERIFIED';
export type RuleReviewStatus = 'EXTRACTED' | 'SOURCE_VERIFIED' | 'REVIEW_REQUIRED' | 'APPROVED_FOR_EVENT';

export type Evidence = {
  id: string;
  documentId: string;
  label: string;
  section: string;
  page?: number;
  sourceUrl?: string;
  excerpt?: string;
  locator?: {
    kind: 'PDF_PAGE' | 'HWPX_PARAGRAPH' | 'HWPX_TABLE_CELL';
    paragraph?: number;
    table?: number;
    row?: number;
    column?: number;
  };
};

export type Expression =
  | { all: Expression[] }
  | { any: Expression[] }
  | { not: Expression }
  | {
      fact: string;
      op: 'EQ' | 'NEQ' | 'GTE' | 'LTE' | 'IN' | 'CONTAINS' | 'EXISTS';
      value?: FactValue | { parameter: string };
    };

export type ConditionRule = {
  id: string;
  label: string;
  expression: Expression;
  evidenceId: string;
  missingInformationLabel?: string;
  onFailure: 'INELIGIBLE' | 'REVIEW_REQUIRED';
};

export type ScoreBand = {
  min?: number;
  max?: number;
  points: number;
};

export type OfficialScoreRule = {
  id: string;
  label: string;
  fact: string;
  bands: ScoreBand[];
  evidenceId: string;
};

export type PriorityTier = {
  rank: number;
  code: string;
  label: string;
  conditions: ConditionRule[];
  /** null means this tier has no official point table. */
  officialScore: OfficialScoreRule[] | null;
};

export type SupplyRuleSet = {
  supplyType: SupplyType;
  label: string;
  selectionMethod: SelectionMethod;
  candidateWhen?: Expression;
  eligibility: ConditionRule[];
  priorityTiers: PriorityTier[];
  /** All known tier failures mean the applicant cannot use this supply. */
  priorityExhaustion?: 'INELIGIBLE' | 'PENDING';
};

export type RulePackage = {
  schemaVersion: 1;
  id: string;
  version: string;
  listingId: string;
  announcementDate: string;
  sourceStatus: RuleSourceStatus;
  reviewStatus: RuleReviewStatus;
  reviewedAt: string;
  reviewedBy: string;
  parameters: Record<string, Scalar | null>;
  evidence: Evidence[];
  supplies: SupplyRuleSet[];
};

export type Listing = {
  id: string;
  sourceId: string;
  officialTitle: string;
  title: string;
  publisher: string;
  region: '제주특별자치도';
  locations: string[];
  housingKind: 'PUBLIC_RENTAL' | 'PURCHASED_RENTAL';
  announcementDate: string;
  applicationStartDate: string;
  applicationEndDate: string;
  officialUrl: string;
  sourceDocumentIds: string[];
  supplyTypes: SupplyType[];
  reviewStatus: RuleReviewStatus;
  summary: string;
};

export type SourceDocument = {
  id: string;
  sourceId: string;
  fileName: string;
  format: 'PDF' | 'HWPX';
  sha256: string;
  officialUrl: string;
  publisher: string;
  verifiedAt: string;
};

export type UnresolvedRule = {
  id: string;
  sourceId: string;
  supplyType: SupplyType;
  status: 'REVIEW_REQUIRED' | 'NEEDS_USER_INPUT';
  description: string;
  evidenceId: string;
};

export type FrozenListingDataset = {
  schemaVersion: 1;
  eventId: string;
  datasetVersion: string;
  region: '제주특별자치도';
  frozenAt: string;
  eventDate: string;
  sourceFingerprint: `sha256:${string}`;
  fingerprint: `sha256:${string}`;
  sourceDocuments: SourceDocument[];
  listings: Listing[];
  rulePackages: RulePackage[];
  unresolvedRules: UnresolvedRule[];
};
