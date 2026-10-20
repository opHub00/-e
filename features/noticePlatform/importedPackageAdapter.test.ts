import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { SAMDO_PERSONAS } from '../eventKiosk/samdo/personas.test-data.ts';
import { SAMDO_NOTICE_ADAPTERS } from '../eventKiosk/noticePlatform/samdoAdapter.ts';
import { NoticePlatform } from './platform.ts';
import { createImportedPackageAdapter } from './importedPackageAdapter.ts';

const source = JSON.parse(readFileSync(new URL('../../data/assessment-rules/jj-panmun-2026000446.json', import.meta.url), 'utf8'));

test('real non-Samdo notice imports as a draft but cannot enter public assessment or RAG', () => {
  const adapter = createImportedPackageAdapter(source);
  const platform = new NoticePlatform([...SAMDO_NOTICE_ADAPTERS, adapter]);
  assert.equal(adapter.notice.managementNumber, '2026000446');
  assert.equal(adapter.notice.status, 'DRAFT');
  assert.equal(adapter.rulePackage.status, 'DRAFT');
  assert.ok(adapter.rulePackage.validationErrors.includes('SOURCE_REVIEW_REQUIRED'));
  assert.equal(adapter.lifecycle.publicationStatus, 'INACTIVE');
  assert.equal(platform.getActiveNotices().length, 2, 'inactive real fixture must not appear in live catalog');
  assert.throws(() => platform.assessNotice(SAMDO_PERSONAS[0].input, adapter.notice.id), /REVIEW_REQUIRED/);
  assert.throws(() => platform.assessNotices(SAMDO_PERSONAS[0].input, ['samdo-1', adapter.notice.id]), /REVIEW_REQUIRED/);
  assert.throws(() => platform.retrieveNoticeEvidence(adapter.notice.id, '신혼부부 소득 기준'), /REVIEW_REQUIRED/);
  assert.throws(() => platform.getNoticePresentation(adapter.notice.id), /REVIEW_REQUIRED/);
  const results = platform.assessNotices(SAMDO_PERSONAS[0].input, ['samdo-1', 'samdo-2']);
  assert.equal(results.length, 2);
  assert.ok(platform.retrieveNoticeEvidence('samdo-1', '토지임대료').every(chunk => !JSON.stringify(chunk).includes(source.document.sha256)));
  assert.deepEqual(platform.assessNotice(SAMDO_PERSONAS[0].input, 'samdo-1'), results[0], 'adding a third notice must not alter Samdo');
});
