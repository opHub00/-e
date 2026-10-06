import type { BatchAssessment } from '../engine/batch.ts';
import { buildHouseholdFacts } from '../engine/facts.ts';
import type { UserProfile } from '../domain/profile.ts';
import type { FrozenListingDataset } from '../domain/rules.ts';
import type { EvaluationResult } from '../domain/evaluation.ts';

export type AssessmentContext = {
  schemaVersion: 1;
  dataset: {
    id: string;
    version: string;
    frozenAt: string;
    fingerprint: string;
  };
  createdAt: string;
  householdSummary: {
    composition: UserProfile['household']['composition'];
    memberCount: number;
    spousePresent: boolean;
    childCount: number;
    applicantAgeBand: string;
    monthlyIncomeBand: string;
    totalAssetsBand: string;
  };
  assessments: Array<{
    listingId: string;
    listingTitle: string;
    supplyType: EvaluationResult['supplyType'];
    supplyLabel: string;
    eligibility: EvaluationResult['eligibility'];
    priority: EvaluationResult['priority'];
    officialScore: EvaluationResult['officialScore'];
    wanpanScore: EvaluationResult['wanpanScore'];
    missingInformation: string[];
    matchedRules: Array<Pick<EvaluationResult['matchedRules'][number], 'ruleId' | 'label' | 'evidenceId'>>;
    failedRules: Array<Pick<EvaluationResult['failedRules'][number], 'ruleId' | 'label' | 'outcome' | 'evidenceId'>>;
    warnings: string[];
    confidence: EvaluationResult['confidence'];
  }>;
  evidence: Array<{
    id: string;
    listingId: string;
    label: string;
    section: string;
    page?: number;
    sourceUrl?: string;
  }>;
  privacy: {
    directIdentifiersIncluded: false;
    excluded: readonly ['profileId', 'personIds', 'names', 'birthDates', 'exactIncome', 'exactAssets'];
  };
  instruction: string;
};

export function createAssessmentContext(
  profile: UserProfile,
  dataset: FrozenListingDataset,
  assessment: BatchAssessment,
): AssessmentContext {
  if (assessment.datasetId !== dataset.eventId || assessment.datasetVersion !== dataset.datasetVersion) {
    throw new Error('Assessment and dataset versions do not match');
  }
  if (assessment.profileId !== profile.profileId) throw new Error('Assessment and profile do not match');
  const facts = buildHouseholdFacts(profile, dataset.eventDate);
  const evidence = dataset.rulePackages.flatMap(rulePackage => rulePackage.evidence.map(item => ({
    id: item.id,
    listingId: rulePackage.listingId,
    label: item.label,
    section: item.section,
    ...(item.page === undefined ? {} : { page: item.page }),
    ...(item.sourceUrl === undefined ? {} : { sourceUrl: item.sourceUrl }),
  })));
  return {
    schemaVersion: 1,
    dataset: {
      id: dataset.eventId,
      version: dataset.datasetVersion,
      frozenAt: dataset.frozenAt,
      fingerprint: dataset.fingerprint,
    },
    createdAt: assessment.evaluatedAt,
    householdSummary: {
      composition: profile.household.composition,
      memberCount: numberFact(facts['household.memberCount']),
      spousePresent: facts['spouse.exists'] === true,
      childCount: numberFact(facts['household.childCount']),
      applicantAgeBand: ageBand(facts['applicant.age']),
      monthlyIncomeBand: moneyBand(facts['household.monthlyIncomeKrw'], [4_000_000, 7_000_000, 10_000_000]),
      totalAssetsBand: moneyBand(facts['household.totalAssetsKrw'], [200_000_000, 350_000_000, 500_000_000]),
    },
    assessments: assessment.results.map(result => ({
      listingId: result.listingId,
      listingTitle: result.listingTitle,
      supplyType: result.supplyType,
      supplyLabel: result.supplyLabel,
      eligibility: result.eligibility,
      priority: structuredClone(result.priority),
      officialScore: structuredClone(result.officialScore),
      wanpanScore: structuredClone(result.wanpanScore),
      missingInformation: [...result.missingInformation],
      matchedRules: result.matchedRules.map(rule => ({ ruleId: rule.ruleId, label: rule.label, evidenceId: rule.evidenceId })),
      failedRules: result.failedRules.map(rule => ({ ruleId: rule.ruleId, label: rule.label, outcome: rule.outcome, evidenceId: rule.evidenceId })),
      warnings: [...result.warnings],
      confidence: structuredClone(result.confidence),
    })),
    evidence,
    privacy: {
      directIdentifiersIncluded: false,
      excluded: ['profileId', 'personIds', 'names', 'birthDates', 'exactIncome', 'exactAssets'],
    },
    instruction: '자격·순위·공식점수를 새로 계산하거나 추측하지 말고 assessments의 deterministic 결과만 설명한다. missingInformation과 warnings를 명시하고 evidence id로 근거를 연결한다.',
  };
}

function numberFact(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

function ageBand(value: unknown): string {
  if (typeof value !== 'number') return 'UNKNOWN';
  if (value < 20) return 'UNDER_20';
  if (value < 30) return '20_29';
  if (value < 40) return '30_39';
  if (value < 50) return '40_49';
  if (value < 65) return '50_64';
  return '65_PLUS';
}

function moneyBand(value: unknown, thresholds: [number, number, number]): string {
  if (typeof value !== 'number') return 'UNKNOWN';
  if (value <= thresholds[0]) return 'BAND_1';
  if (value <= thresholds[1]) return 'BAND_2';
  if (value <= thresholds[2]) return 'BAND_3';
  return 'BAND_4';
}
