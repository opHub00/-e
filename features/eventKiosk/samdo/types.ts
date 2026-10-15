import type { AssessmentInput, Evidence, RuleSourceStatus } from '../../applicationAssessment/types.ts';

export type SamdoSupplyType =
  | 'YOUTH'
  | 'NEWLYWED'
  | 'FIRST_HOME'
  | 'NEWBORN'
  | 'GENERAL'
  | 'INSTITUTIONAL_RECOMMENDATION';

export type SamdoEligibility = 'ELIGIBLE' | 'CONDITIONAL' | 'INELIGIBLE' | 'EVIDENCE_REQUIRED';
export type SamdoStage =
  | 'PRIORITY'
  | 'GENERAL'
  | 'LOTTERY'
  | 'NEWBORN_PRIORITY'
  | 'FIRST_RANK_PRIORITY'
  | 'SECOND_RANK'
  | 'INFORMATION_ONLY';

export type SamdoOfficialScore =
  | { status: 'AVAILABLE'; total: number; max: number; breakdown: Array<{ label: string; points: number; max: number; evidenceId: string }> }
  | { status: 'NOT_APPLICABLE' }
  | { status: 'PENDING' };

export type SamdoRuleCategory =
  | 'APPLICANT'
  | 'NO_HOME'
  | 'HOUSEHOLD'
  | 'SUBSCRIPTION'
  | 'INCOME'
  | 'ASSETS'
  | 'RESIDENCE'
  | 'HOUSING_HISTORY'
  | 'RESTRICTION'
  | 'SPECIAL_SUPPLY_HISTORY'
  | 'CHILD_BIRTH'
  | 'STAGE'
  | 'SCORE';

export type SamdoRuleSummary = {
  id: string;
  category: SamdoRuleCategory;
  label: string;
  evidence: Evidence;
};

export type SamdoSupplyPackage = {
  supplyType: SamdoSupplyType;
  label: string;
  supplyCount: number;
  autoRecommend: boolean;
  assessmentMode: 'RULE_ENGINE' | 'DEDICATED' | 'INFORMATION_ONLY';
  rules: SamdoRuleSummary[];
};

export type SamdoDeepRulePackage = {
  id: string;
  baseRuleSetId: string;
  announcementId: string;
  version: string;
  listingId: string;
  title: string;
  sourceStatus: RuleSourceStatus;
  announcementDate: string;
  applicationDates: { special: string; generalFirst: string; generalSecond: string };
  schedule: {
    special: string;
    generalFirst: string;
    generalSecond: string;
    winnerAnnouncement: string;
    documentSubmission: { start: string; end: string };
    contract: { start: string; end: string };
  };
  document: { id: string; fileName: string; sha256: string; isOfficial: boolean };
  inventory: { total: number; units49: number; units59: number; special: number; general: number };
  supplies: SamdoSupplyPackage[];
};

export type SamdoSupplyEvaluation = {
  supplyType: SamdoSupplyType;
  supplyLabel: string;
  eligibility: SamdoEligibility;
  stage: SamdoStage | null;
  stageLabel: string;
  officialScore: SamdoOfficialScore;
  supplyCount: number;
  applicationDate: string;
  matchedAdvantages: string[];
  cautions: string[];
  evidenceRequired: string[];
  reasons: string[];
  failedReasons: string[];
  missingFacts: string[];
  evidence: Evidence[];
  autoRecommend: boolean;
};

export type SamdoRecommendationItem = SamdoSupplyEvaluation & { rank: number };

export type SamdoRecommendation = {
  listingId: string;
  sourceStatus: RuleSourceStatus;
  recommendedType: SamdoRecommendationItem | null;
  alternatives: SamdoRecommendationItem[];
  lowerPriorityTypes: SamdoRecommendationItem[];
  rejectedTypes: SamdoRecommendationItem[];
  informationOnlyTypes: SamdoRecommendationItem[];
  evaluations: SamdoRecommendationItem[];
};

export type SamdoPresentationItem = Omit<SamdoRecommendationItem, 'missingFacts'>;
export type SamdoPresentationRecommendation = {
  listingId: string;
  sourceStatus: RuleSourceStatus;
  recommendedType: SamdoPresentationItem | null;
  alternatives: SamdoPresentationItem[];
  lowerPriorityTypes: SamdoPresentationItem[];
  rejectedTypes: SamdoPresentationItem[];
  informationOnlyTypes: SamdoPresentationItem[];
  evaluations: SamdoPresentationItem[];
};

export type SamdoAssessmentInput = AssessmentInput;

export type SamdoQuestion = {
  id: string;
  factKey: string;
  scope: 'APPLICANT' | 'SPOUSE' | 'HOUSEHOLD';
  kind: 'BOOLEAN' | 'DATE' | 'NUMBER' | 'SELECT';
  title: string;
  hint: string;
  usedBy: SamdoSupplyType[];
  evidenceOnly: boolean;
};

export type SamdoQuestionPlan = {
  questions: SamdoQuestion[];
  evidenceOnly: SamdoQuestion[];
  excludedIneligible: SamdoSupplyType[];
};
