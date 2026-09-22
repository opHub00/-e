import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { allowed, FORBIDDEN, scanAnnouncementHardcodes } from './announcement-hardcode-guard.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('generic pipeline modules name no announcement, region or announcement amount', async () => {
  const result = await scanAnnouncementHardcodes(root);
  assert.ok(result.scanned > 200, `scanned ${result.scanned} files`);
  assert.deepEqual(result.violations, [], result.violations.map(item => `${item.path}:${item.line} [${item.rule}] ${item.text}`).join('\n'));
  assert.deepEqual(result.stale, [], 'stale allowlist entries');
});

test('the guard catches new hard-codes in generic modules and exempts only the fixture layers', () => {
  assert.ok(FORBIDDEN.some(rule => rule.pattern.test("value: '제주특별자치도'")));
  assert.ok(FORBIDDEN.some(rule => rule.pattern.test('const RUN = "samdo-v5"')));
  assert.ok(FORBIDDEN.some(rule => rule.pattern.test("'362백만원'")));
  assert.ok(FORBIDDEN.some(rule => rule.pattern.test("title: '힐스테이트 고덕엘리스트'")), 'second announcement name');
  assert.ok(FORBIDDEN.some(rule => rule.pattern.test("value: '평택시'")), 'second announcement region');
  assert.ok(FORBIDDEN.some(rule => rule.pattern.test('lte(215_500_000)')), 'second announcement amount');
  assert.equal(FORBIDDEN.some(rule => rule.pattern.test("'만 19세', '6회', '600만원'")), false, 'statutory values are allowed');
  assert.equal(allowed('features/applicationAssessment/engine.ts'), null);
  assert.equal(allowed('features/assessmentRuleReview/seed/buildAssessmentReviewSeed.ts'), null);
  assert.equal(allowed('features/ruleExtraction/server/v3/tasks.ts'), null);
  assert.equal(allowed('scripts/seed-rule-review-staging.mjs'), null);
  assert.ok(allowed('features/assessmentRuleReview/fixtures/buildSamdoReviewSeed.ts'));
  assert.ok(allowed('features/applicationAssessment/reference/samdoReferenceRules.ts'));
});
