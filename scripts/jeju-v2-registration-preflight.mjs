// Offline-only preflight. It cannot connect to Staging or execute a mutation.
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { buildJejuV2RegistrationPlan } from '../features/assessmentRuleReview/fixtures/jejuV2RegistrationPlan.ts';

const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== '--document')) throw new Error('Use: npm run preflight:jeju-v2-review -- [--document ORIGINAL.pdf]');
let digest = null;
if (args.length) {
  const path = args[1];
  if ((await stat(path)).size > 50_000_000) throw new Error('ORIGINAL_DOCUMENT_TOO_LARGE');
  digest = createHash('sha256').update(await readFile(path)).digest('hex');
}
console.log(JSON.stringify(buildJejuV2RegistrationPlan(digest), null, 2));
