import { canonicalSerialize, sha256Hex } from '../assessmentRuleReview/domain/hashing.ts';
import { componentMax, type ScoringFormula, type ScoringTarget } from './domain.ts';

export const SCORING_SEED_SCHEMA_VERSION = 1;

export type ScoringSeedPackage = {
  schemaVersion: 1;
  generatorVersion: 'scoring-seed-v1';
  sourcePackageHash: string;
  formula: {
    slug: string; version: string; name: string; description: string; target: ScoringTarget; scopeKey: string;
    status: 'IN_REVIEW'; publishedToUsers: false; legalBasis: string; interpretations: ScoringFormula['interpretations'];
    components: Array<ScoringFormula['components'][number] & { maxScore: number; bands: Array<ScoringFormula['components'][number]['bands'][number] & { order: number }> }>;
    testCases: Array<ScoringFormula['testCases'][number] & { order: number }>;
  };
};

export function buildScoringSeedPackage(formula: ScoringFormula): ScoringSeedPackage {
  if (formula.targets.length !== 1) throw new Error('SCORING_SEED_REQUIRES_SINGLE_TARGET');
  const normalized: Omit<ScoringSeedPackage, 'sourcePackageHash'> = {
    schemaVersion: SCORING_SEED_SCHEMA_VERSION,
    generatorVersion: 'scoring-seed-v1',
    formula: {
      slug: formula.id, version: formula.version, name: formula.name, description: formula.description,
      target: formula.targets[0], scopeKey: formula.targets[0], status: 'IN_REVIEW', publishedToUsers: false,
      legalBasis: formula.legalBasis, interpretations: formula.interpretations,
      components: [...formula.components].sort((a, b) => a.order - b.order).map(component => ({
        ...component, maxScore: componentMax(component), bands: component.bands.map((band, order) => ({ ...band, order })),
      })),
      testCases: formula.testCases.map((testCase, order) => ({ ...testCase, order })),
    },
  };
  return { ...normalized, sourcePackageHash: sha256Hex(canonicalSerialize(normalized)) };
}

export function verifyScoringSeedPackage(value: ScoringSeedPackage): void {
  const { sourcePackageHash, ...payload } = value;
  if (sha256Hex(canonicalSerialize(payload)) !== sourcePackageHash) throw new Error('STALE_SCORING_SEED_PACKAGE');
  if (value.formula.status !== 'IN_REVIEW' || value.formula.publishedToUsers) throw new Error('UNSAFE_SCORING_SEED_STATE');
  const itemKeys = value.formula.components.map(component => component.id).sort();
  for (const testCase of value.formula.testCases) {
    const inputKeys = Object.keys(testCase.inputs).sort();
    if (inputKeys.length !== itemKeys.length || inputKeys.some((key, index) => key !== itemKeys[index])
      || Object.values(testCase.inputs).some(input => typeof input !== 'number' || !Number.isFinite(input))) {
      throw new Error(`SCORING_TEST_INPUT_KEYS_MISMATCH:${testCase.id}`);
    }
  }
}
