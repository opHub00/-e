import type { ImportPackage } from '../../applicationAssessment/server/importPackage.ts';
import { hashCanonical } from '../domain/hashing.ts';
import type { ReviewSeedAnnotation } from '../seed/annotations.ts';

/** v3: the seed is built by the generic builder and also depends on the review annotations. */
export const REVIEW_SEED_GENERATOR_VERSION = 'rule-review-seed-v3' as const;
export type ReviewSeedProvenance = {
  sourceFixtureHash: string;
  sourceFixtureVersion: string;
  annotationHash: string;
  generatorVersion: typeof REVIEW_SEED_GENERATOR_VERSION;
};

export function sourceFixtureHash(source: ImportPackage): string { return hashCanonical(source); }
export function annotationHash(annotation: ReviewSeedAnnotation): string { return hashCanonical(annotation); }

export function verifyReviewSeedProvenance(source: ImportPackage, annotation: ReviewSeedAnnotation, provenance: ReviewSeedProvenance): void {
  if (provenance.generatorVersion !== REVIEW_SEED_GENERATOR_VERSION || provenance.sourceFixtureVersion !== source.ruleSet.version ||
      provenance.sourceFixtureHash !== sourceFixtureHash(source) || provenance.annotationHash !== annotationHash(annotation)) throw new Error('STALE_REVIEW_SEED');
}
