// Regenerates the browser-safe review seed from the Node-only Samdo fixture.
// The fixture reads the rule package from disk, which the web bundle cannot do.
import { writeFile } from 'node:fs/promises';
import { samdoReviewSeed } from '../features/assessmentRuleReview/server/samdoReviewFixture.test-data.ts';

const target = new URL('../features/assessmentRuleReview/ui/samdoReviewSeed.generated.ts', import.meta.url);
const header = `/**
 * Browser-safe copy of the Samdo review seed.
 *
 * \`samdoReviewFixture.test-data.ts\` reads the rule package with \`readFileSync\`, which
 * cannot run in the web bundle. This module is generated from that same fixture so the
 * console shows real Samdo rules, evidence and conflicts rather than invented data.
 * Regenerate with \`npm run gen:rule-review-seed\` whenever the fixture changes.
 */
import type { RuleReviewWorkspaceSeed } from '../server/types.ts';

export const SAMDO_REVIEW_SEED: RuleReviewWorkspaceSeed = `;

await writeFile(target, `${header}${JSON.stringify(samdoReviewSeed(), null, 2)};\n`);
console.log(`wrote ${target.pathname}`);
