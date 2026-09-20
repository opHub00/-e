// Node-only verification; does not modify the source or generated fixture.
import { readFile } from 'node:fs/promises';
import { SAMDO_REVIEW_SEED_PROVENANCE } from '../features/assessmentRuleReview/fixtures/samdoReviewSeed.generated.ts';
import { verifyReviewSeedProvenance } from '../features/assessmentRuleReview/fixtures/provenance.ts';

const source = JSON.parse(await readFile(new URL('../data/assessment-rules/samdo-2026-v1.7.json', import.meta.url), 'utf8'));
verifyReviewSeedProvenance(source, SAMDO_REVIEW_SEED_PROVENANCE);
console.log('Rule review seed provenance verified');
