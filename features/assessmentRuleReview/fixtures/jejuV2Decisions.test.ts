import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildJejuV2CandidateView } from './jejuV2CandidateView.ts';
import { CandidateDecisionService, createJejuV2ReviewState, LocalCandidateDecisionStore,
  planJejuV2Decision, type CandidateAction } from './jejuV2Decisions.ts';

const candidate = buildJejuV2CandidateView();
const seed = () => createJejuV2ReviewState(candidate);
const actor = { id: 'approved-reviewer-id', role: 'reviewer' as const };
const at = '2026-10-21T02:00:00.000Z';
const provenance = { documentSha256: candidate.source.sha256, locator: '공고문 7쪽 표 2', excerpt: '공고문에서 직접 확인한 문장' };

test('candidate seed is review-only and never affects a public rule package', () => {
  const state = seed();
  assert.equal(state.ruleIds.length, 44);
  assert.equal(state.warningIds.length, 22);
  assert.equal(state.parameterIds.length, 5);
  assert.equal(state.lifecycle, 'REVIEW_CANDIDATE');
  assert.equal(state.publicationStatus, 'INACTIVE');
  assert.equal(state.approved, false); assert.equal(state.active, false);
  assert.equal(candidate.registrationStatus, 'NOT_REGISTERED');
});

test('all reviewer actions create one typed audit and leave the candidate unpublished', async () => {
  const store = new LocalCandidateDecisionStore(seed()), service = new CandidateDecisionService(store);
  const firstRule = candidate.rules[0]!.id, warning = candidate.warnings[0]!.id;
  const parameter = candidate.notInSource[0]!.parameterId, blocker = candidate.blocker.unresolvedId;
  const actions: CandidateAction[] = [
    { type: 'MOVE_TO_IN_REVIEW' },
    { type: 'ADD_REVIEW_NOTE', target: 'RULE', targetId: firstRule, note: '원문 범위를 다시 확인합니다.' },
    { type: 'MARK_RULE_REVIEWED', ruleId: firstRule, note: '현재 후보의 범위를 확인했습니다.' },
    { type: 'REVIEW_SCOPE', ruleId: firstRule, decision: 'REQUIRES_CHANGE', note: '부모 포함 범위를 재검토합니다.' },
    { type: 'RESOLVE_WARNING', warningId: warning, decision: 'REQUIRES_CHANGE', note: '원문과 다른 해석을 수정해야 합니다.' },
    { type: 'DECIDE_NOT_IN_SOURCE', parameterId: parameter, decision: 'KEEP_NULL', note: '원문 표가 비어 있어 null을 유지합니다.' },
    { type: 'RESOLVE_BLOCKER', blockerId: blocker, decision: 'KEEP_BLOCKED', note: '공고 근거가 없으므로 계속 차단합니다.' },
  ];
  for (const action of actions) await service.decide(action, actor, at);
  const { state, audits } = await store.read();
  assert.equal(state.revision, actions.length);
  assert.equal(audits.length, actions.length);
  assert.deepEqual(audits.map(item => item.action), actions.map(item => item.type));
  assert.ok(audits.every(item => item.actor.id === actor.id && item.candidateVersion === candidate.version &&
    item.timestamp === at && item.reason.length >= 3));
  assert.equal(state.blockerDecision?.decision, 'KEEP_BLOCKED');
  assert.equal(state.missingCellDecisions[parameter]?.decision, 'KEEP_NULL');
  assert.equal(candidate.notInSource[0]?.v2CandidateValue, null);
  assert.equal(state.lifecycle, 'IN_REVIEW');
  assert.equal(state.publicationStatus, 'INACTIVE');
  assert.equal(state.approved, false); assert.equal(state.active, false);
});

test('source/scope resolution needs pinned provenance; no guessed value or silent blocker clearance', () => {
  const started = planJejuV2Decision(seed(), { type: 'MOVE_TO_IN_REVIEW' }, actor, at).next;
  const unresolvedId = candidate.blocker.unresolvedId;
  assert.throws(() => planJejuV2Decision(started,
    { type: 'RESOLVE_BLOCKER', blockerId: unresolvedId, decision: 'RESOLVED_WITH_SOURCE', note: '원문에서 확인했습니다.' }, actor, at),
  /REVIEW_PROVENANCE_REQUIRED/);
  assert.throws(() => planJejuV2Decision(started,
    { type: 'RESOLVE_BLOCKER', blockerId: unresolvedId, decision: 'RESOLVED_WITH_SOURCE', note: '원문에서 확인했습니다.',
      provenance: { ...provenance, documentSha256: 'f'.repeat(64) } }, actor, at), /REVIEW_SOURCE_HASH_MISMATCH/);
  const result = planJejuV2Decision(started,
    { type: 'RESOLVE_BLOCKER', blockerId: unresolvedId, decision: 'RESOLVED_WITH_SOURCE', note: '원문에서 확인했습니다.', provenance }, actor, at);
  assert.equal(result.next.blockerDecision?.provenance?.documentSha256, candidate.source.sha256);
  assert.equal(result.next.approved, false); assert.equal(result.next.active, false);
});

test('non-reviewer, unknown target, premature decision, and approval-like action fail closed', () => {
  assert.throws(() => planJejuV2Decision(seed(), { type: 'MOVE_TO_IN_REVIEW' },
    { id: 'ordinary-user', role: 'ordinary' as 'reviewer' }, at), /REVIEW_ROLE_REQUIRED/);
  assert.throws(() => planJejuV2Decision(seed(),
    { type: 'ADD_REVIEW_NOTE', target: 'RULE', targetId: candidate.rules[0]!.id, note: '검수 메모입니다.' }, actor, at),
  /REVIEW_NOT_IN_PROGRESS/);
  const started = planJejuV2Decision(seed(), { type: 'MOVE_TO_IN_REVIEW' }, actor, at).next;
  assert.throws(() => planJejuV2Decision(started,
    { type: 'RESOLVE_WARNING', warningId: 'foreign-warning', decision: 'ACCEPTED_AS_SAFE', note: '다른 후보 경고입니다.' }, actor, at),
  /REVIEW_WARNING_NOT_FOUND/);
  assert.throws(() => planJejuV2Decision(started,
    { type: 'APPROVE_RULE_PACKAGE' } as unknown as CandidateAction, actor, at), /UNKNOWN_REVIEW_ACTION/);
  assert.throws(() => planJejuV2Decision(started,
    { type: 'RESOLVE_BLOCKER', blockerId: candidate.blocker.unresolvedId, decision: 'APPROVED', note: '허용되지 않는 상태' } as unknown as CandidateAction,
    actor, at), /INVALID_BLOCKER_DECISION/);
  assert.throws(() => planJejuV2Decision(started,
    { type: 'DECIDE_NOT_IN_SOURCE', parameterId: candidate.notInSource[0]!.parameterId, decision: 'ZERO', note: '원문 공란을 0으로 바꿈' } as unknown as CandidateAction,
    actor, at), /INVALID_MISSING_CELL_DECISION/);
});

test('audit failure rolls back both the decision and revision; stale writes also fail', async () => {
  const store = new LocalCandidateDecisionStore(seed(), () => { throw new Error('AUDIT_WRITE_FAILED'); });
  const service = new CandidateDecisionService(store);
  await assert.rejects(service.decide({ type: 'MOVE_TO_IN_REVIEW' }, actor, at), /AUDIT_WRITE_FAILED/);
  const unchanged = await store.read();
  assert.equal(unchanged.state.revision, 0); assert.equal(unchanged.state.lifecycle, 'REVIEW_CANDIDATE');
  assert.equal(unchanged.audits.length, 0);
  const planned = planJejuV2Decision(unchanged.state, { type: 'MOVE_TO_IN_REVIEW' }, actor, at);
  await assert.rejects(store.commit(1, planned.next, planned.audit), /STALE_REVIEW_REVISION/);
});
