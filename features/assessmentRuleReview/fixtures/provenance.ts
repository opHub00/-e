import type { ImportPackage } from '../../applicationAssessment/server/importPackage.ts';
import { hashCanonical } from '../domain/hashing.ts';

export const REVIEW_SEED_GENERATOR_VERSION = 'rule-review-seed-v2' as const;
export type ReviewSeedProvenance = {
  sourceFixtureHash: string;
  sourceFixtureVersion: string;
  generatorVersion: typeof REVIEW_SEED_GENERATOR_VERSION;
};

export function sourceFixtureHash(source: ImportPackage): string { return hashCanonical(source); }

export function verifyReviewSeedProvenance(source: ImportPackage, provenance: ReviewSeedProvenance): void {
  if (provenance.generatorVersion !== REVIEW_SEED_GENERATOR_VERSION || provenance.sourceFixtureVersion !== source.ruleSet.version ||
      provenance.sourceFixtureHash !== sourceFixtureHash(source)) throw new Error('STALE_REVIEW_SEED');
}
