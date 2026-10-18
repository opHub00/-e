import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { SAMDO_PERSONAS } from '../eventKiosk/samdo/personas.test-data.ts';
import { SAMDO_NOTICE_ADAPTERS } from '../eventKiosk/noticePlatform/samdoAdapter.ts';
import { NoticePlatform } from './platform.ts';
import { createImportedPackageAdapter } from './importedPackageAdapter.ts';

const source = JSON.parse(readFileSync(new URL('../../data/assessment-rules/jj-panmun-2026000446.json', import.meta.url), 'utf8'));

test('real non-Samdo notice imports, assesses, retrieves source evidence, and compares without district code', () => {
  const adapter = createImportedPackageAdapter(source);
  const platform = new NoticePlatform([...SAMDO_NOTICE_ADAPTERS, adapter]);
  assert.equal(adapter.notice.managementNumber, '2026000446');
  assert.equal(adapter.notice.status, 'APPROVED');
  assert.equal(platform.getActiveNotices().length, 2, 'inactive real fixture must not appear in live catalog');
  const results = platform.assessNotices(SAMDO_PERSONAS[0].input, ['samdo-1', 'samdo-2', adapter.notice.id]);
  assert.equal(results.length, 3);
  assert.equal(results[2].evaluations.length, 2);
  assert.equal(results[2].noticeId, adapter.notice.id);
  assert.equal(results[2].sourceStatus, 'OFFICIAL_VERIFIED');
  assert.ok(platform.compareAssessmentResults(results).orderedNoticeIds.includes(adapter.notice.id));
  const chunks = platform.retrieveNoticeEvidence(adapter.notice.id, '신혼부부 소득 기준');
  assert.ok(chunks.length > 0);
  assert.ok(chunks.every(chunk => JSON.stringify(chunk.locator).includes(source.document.sha256)));
  assert.ok(platform.retrieveNoticeEvidence('samdo-1', '토지임대료').every(chunk => !JSON.stringify(chunk).includes(source.document.sha256)));
  assert.deepEqual(platform.assessNotice(SAMDO_PERSONAS[0].input, 'samdo-1'), results[0], 'adding a third notice must not alter Samdo');
});
