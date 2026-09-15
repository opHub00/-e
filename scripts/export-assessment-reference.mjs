import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { samdoReferenceRules } from '../features/applicationAssessment/referenceRules.ts';
import { serializeRuleSet } from '../features/applicationAssessment/data/ruleCodec.ts';

// Offline development export. IDs are dedicated fixture IDs, never management-number mappings.
const payload = serializeRuleSet(samdoReferenceRules, {
  announcementId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  ruleSetId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', documentId: null,
});
const json = JSON.stringify(payload, null, 2) + '\n';
if (process.argv[2]) {
  const path = resolve(process.argv[2]);
  await writeFile(path, json, { encoding: 'utf8', flag: 'wx' });
  console.log(`REFERENCE import payload created: ${path}`);
} else process.stdout.write(json);
