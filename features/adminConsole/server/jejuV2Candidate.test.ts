import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildJejuV2CandidateView } from '../../assessmentRuleReview/fixtures/jejuV2CandidateView.ts';
import { handleProductV3ConsoleRequest } from './consoleApi.ts';

test('Jeju v2 candidate keeps source lineage, 18 diffs, 22 warnings and the unresolved gate', () => {
  const view = buildJejuV2CandidateView();
  assert.equal(view.status, 'REVIEW_CANDIDATE');
  assert.equal(view.publicationStatus, 'INACTIVE');
  assert.equal(view.registrationStatus, 'NOT_REGISTERED');
  assert.equal(view.approved, false); assert.equal(view.active, false);
  assert.equal(view.ruleCount, 44); assert.equal(view.changedRuleCount, 18);
  assert.equal(view.rules.filter(rule => rule.changed).length, 18);
  assert.equal(view.changes.length, 18); assert.equal(view.warningCount, 22);
  assert.deepEqual(view.warningCounts, { REQUIRES_ADMIN_DECISION: 11, RULE_SEMANTIC_RISK: 4,
    EVIDENCE_RISK: 3, SAFE_WARNING: 3, BLOCKER: 1 });
  assert.equal(view.blockerCount, 1); assert.equal(view.activation.allowed, false);
  assert.equal(view.reviewActions.available, false);
  assert.ok(view.source.sha256.match(/^[a-f0-9]{64}$/));
  assert.ok(view.changes.every(item => view.rules.some(rule => rule.id === item.ruleId && rule.changed)));
  assert.ok(view.warnings.every(item => item.reviewStatus === 'PENDING_REVIEW' && item.reviewerNote === null));
  assert.ok(view.blocker.affectedSupplyTypes.includes('newlywed'));
  assert.ok(view.blocker.locators.length > 0);
  assert.ok(view.boundaryComparisons.length > 0);
});

test('five NOT_IN_SOURCE cells are null and never shown as zero/default', () => {
  const view = buildJejuV2CandidateView();
  assert.equal(view.notInSource.length, 5);
  assert.equal(view.notInSource.filter(item => item.supplyType === 'newlywed').length, 2);
  assert.equal(view.notInSource.filter(item => item.supplyType === 'student').length, 3);
  for (const item of view.notInSource) {
    assert.equal(item.v2CandidateValue, null);
    assert.match(item.displayValue, /원문에 수치 없음 · NOT_IN_SOURCE/);
    assert.ok(item.source.locator);
  }
});

test('candidate Admin API is server authorized and never falls through to public snapshot or mutation', async () => {
  let loaded = 0;
  let snapshotLoaded = 0;
  const dependencies = { authorize: async (token: string) => token === 'reviewer' ? 'reviewer' as const : token === 'admin' ? 'admin' as const
    : token === 'expired' ? 'UNAUTHENTICATED' as const : null,
    loadSnapshot: async () => { snapshotLoaded++; throw new Error('not for candidate'); },
    loadJejuCandidate: async () => { loaded++; return buildJejuV2CandidateView(); } };
  const request = (token?: string, method = 'GET') => ({ method, headers: token ? { authorization: `Bearer ${token}` } : {}, query: { reviewCandidate: 'jeju-v2' } });
  assert.equal((await handleProductV3ConsoleRequest(request(), dependencies)).status, 401);
  assert.equal((await handleProductV3ConsoleRequest(request('expired'), dependencies)).status, 401);
  assert.equal((await handleProductV3ConsoleRequest(request('ordinary-user'), dependencies)).status, 403);
  assert.equal((await handleProductV3ConsoleRequest(request('reviewer'), dependencies)).status, 200);
  assert.equal((await handleProductV3ConsoleRequest(request('admin'), dependencies)).status, 200);
  assert.equal((await handleProductV3ConsoleRequest(request('reviewer', 'POST'), dependencies)).status, 405);
  assert.equal(loaded, 2); assert.equal(snapshotLoaded, 0);
});
