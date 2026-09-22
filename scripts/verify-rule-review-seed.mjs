// Node-only verification; does not modify the source or generated fixture.
import { isDeepStrictEqual } from 'node:util';
import { SAMDO_REVIEW_SEED_PROVENANCE, SAMDO_STAGING_REVIEW_SEED } from '../features/assessmentRuleReview/fixtures/samdoReviewSeed.generated.ts';
import { verifyReviewSeedProvenance } from '../features/assessmentRuleReview/fixtures/provenance.ts';
import { loadReviewSeedInput, reviewSeedPaths } from './review-seed-input.mjs';

const { source, annotation, seed } = await loadReviewSeedInput(reviewSeedPaths(process.argv.slice(2)));
verifyReviewSeedProvenance(source, annotation, SAMDO_REVIEW_SEED_PROVENANCE);
// The checked-in fixture must still equal what the generic builder produces now.
if (!isDeepStrictEqual(seed, SAMDO_STAGING_REVIEW_SEED)) throw new Error('STALE_REVIEW_SEED:GENERATED_FIXTURE_DIFFERS');
console.log('Rule review seed provenance verified');
