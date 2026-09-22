import type { ImportPackage } from '../../applicationAssessment/server/importPackage.ts';
import type { RuleReviewWorkspaceSeed } from '../server/types.ts';
import type { ReviewSeedAnnotation } from '../seed/annotations.ts';
import { buildAssessmentReviewSeed } from '../seed/buildAssessmentReviewSeed.ts';

/**
 * Test/dev fixture only: a curated handful of Samdo rules for in-memory review
 * tests and the browser demo seed. The staging seed covers every materialized
 * rule and comes straight from buildAssessmentReviewSeed().
 */
export const SAMDO_CURATED_RULE_KEYS = [
  'youth.age', 'youth.income', 'newlywed.assets', 'firstHome.deposit', 'youth.residence', 'youth.overseas', 'youth.restrictions',
] as const;

/** Pure fixture transformation. File access belongs only to the generator/verification scripts. */
export function buildSamdoReviewSeed(samdo: ImportPackage, annotation: ReviewSeedAnnotation): RuleReviewWorkspaceSeed {
  return buildAssessmentReviewSeed(samdo, annotation, { ruleKeys: SAMDO_CURATED_RULE_KEYS });
}
