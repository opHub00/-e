import assert from 'node:assert/strict';
import test from 'node:test';
import { SAMDO_REVIEW_SEED } from '../fixtures/samdoReviewSeed.generated.ts';
import { canEditOperator, canEditScore, ruleConditionText } from './ruleFields.ts';
import { reviewProgressPresentation, reviewStatusPresentation } from './reviewPresentation.ts';

const candidate = (ruleId: string) => {
  const found = SAMDO_REVIEW_SEED.rules.find(rule => rule.ruleId === ruleId)?.originalCandidate;
  assert.ok(found, `fixture rule ${ruleId} must exist`);
  return found;
};

test('revalidation presents old approval as history, never current approval', () => {
  assert.deepEqual(reviewStatusPresentation('APPROVED', 'REVALIDATION_REQUIRED'), {
    currentLabel: '재확인 필요',
    tone: 'REVIEW_REQUIRED',
    previousLabel: '이전 문서 기준 · 승인',
  });
  assert.deepEqual(reviewStatusPresentation('APPROVED', 'IN_REVIEW'), {
    currentLabel: '승인', tone: 'plain', previousLabel: null,
  });
});

test('revalidation progress starts a new current-document cycle', () => {
  const summary = { totalRules: 7, pending: 6, approved: 1, edited: 0, held: 0, rejected: 0 };
  const progress = reviewProgressPresentation(summary, 'REVALIDATION_REQUIRED', 3, 2);
  assert.equal(progress.heading, '재검수 완료 0 / 7');
  assert.equal(progress.currentCompletedCount, 0);
  assert.equal(progress.previousDecisionCount, 1);
  assert.match(progress.decisionLine, /이전 문서 기준 검수 1건/);
  assert.match(progress.decisionLine, /현재 문서 승인 0건/);
});

test('boolean and text conditions use human wording without meaningless equality', () => {
  const booleanRule = candidate('youth.restrictions');
  const textRule = candidate('youth.residence');
  assert.equal(ruleConditionText(booleanRule), '예');
  assert.equal(ruleConditionText(textRule), '제주특별자치도');
  assert.equal(canEditOperator(booleanRule), false);
  assert.equal(canEditOperator(textRule), false);
  assert.equal(canEditScore(booleanRule), false);
  assert.equal(canEditScore(textRule), false);
});
