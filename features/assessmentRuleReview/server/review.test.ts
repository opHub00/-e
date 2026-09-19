import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReviewSummary, getRuleDetail, listReviewRules } from './dto.ts';
import { hashReviewCandidate, RuleReviewService } from './service.ts';
import { samdoReviewSeed } from './samdoReviewFixture.test-data.ts';
import type { ReviewMutation, RuleReviewWorkspaceSeed } from './types.ts';
import { materializeCandidateReviewSeed } from './materialize.ts';
import type { CandidateRulePackage } from '../../ruleExtraction/server/candidate.ts';

const mutation = (service: RuleReviewService, reason = '검수 테스트', actor = 'reviewer:test'): ReviewMutation => ({ expectedRevision: service.snapshot().revision, actor, reason, at: '2026-09-20T00:00:00.000Z' });
const evidence = (service: RuleReviewService, ruleId: string) => service.snapshot().rules.find(rule => rule.ruleId === ruleId)!.originalCandidate.evidence[0].id;
function reviewEvidence(service: RuleReviewService, ruleId: string) { service.reviewEvidence(ruleId, evidence(service, ruleId), 'VALID', mutation(service, '원문 근거 확인')); }

test('Samdo-derived candidate keeps immutable original, edit diff and audit history', () => {
  const service = new RuleReviewService(samdoReviewSeed()); service.startReview(mutation(service));
  const original = service.snapshot().rules.find(rule => rule.ruleId === 'firstHome.deposit')!; reviewEvidence(service, original.ruleId);
  const edited = structuredClone(original.originalCandidate); edited.scope = 'HOUSEHOLD';
  service.approveRuleWithEdit(original.ruleId, edited, ['SEMANTIC_EVIDENCE_MISMATCH'], mutation(service, '원문 대조 후 scope 수정'), '600만원은 청약저축액');
  const after = service.snapshot().rules.find(rule => rule.ruleId === original.ruleId)!;
  assert.equal(after.reviewStatus, 'APPROVED_WITH_EDIT'); assert.equal(after.originalCandidate.scope, 'APPLICANT'); assert.equal(after.editedRuleSnapshot?.scope, 'HOUSEHOLD');
  assert.deepEqual(after.editDiff.map(item => item.path), ['scope']); assert.equal(after.originalCandidateHash, hashReviewCandidate(original.originalCandidate));
  assert.ok(service.snapshot().auditLog.some(item => item.action === 'APPROVE_RULE_WITH_EDIT' && item.actor === 'reviewer:test'));
});

test('Samdo review lifecycle remains blocked until exception, conflict, unresolved and evidence are resolved', () => {
  const service = new RuleReviewService(samdoReviewSeed()); service.startReview(mutation(service));
  for (const rule of service.snapshot().rules) reviewEvidence(service, rule.ruleId);
  for (const rule of service.snapshot().rules) {
    if (rule.ruleId === 'firstHome.deposit') { const edited = structuredClone(rule.originalCandidate); edited.scope = 'HOUSEHOLD'; service.approveRuleWithEdit(rule.ruleId, edited, ['SEMANTIC_EVIDENCE_MISMATCH'], mutation(service, '저축액 scope 수정')); }
    else if (rule.ruleId === 'youth.restrictions') service.rejectRule(rule.ruleId, mutation(service, '불필요한 extra 제외'));
    else service.approveRule(rule.ruleId, mutation(service, '원문과 일치'));
  }
  let gate = service.gate(); assert.equal(gate.canActivate, false); assert.ok(gate.blockers.some(item => item.code === 'ORPHAN_EXCEPTION')); assert.ok(gate.blockers.some(item => item.code === 'CONFLICT')); assert.ok(gate.blockers.some(item => item.code === 'UNRESOLVED'));
  service.linkException('youth.overseas', { status: 'LINKED', baseRuleId: 'youth.residence', relationType: 'LIMITED_BY' }, mutation(service, '지역우선 거주기간 제한으로 연결'));
  service.resolveConflict('samdo.region.priority-date', { type: 'CANDIDATE', candidateId: 'continuous-one-year', reason: '표2와 본문을 대조해 계속거주 기준 채택' }, mutation(service));
  service.resolveUnresolved('samdo.management-number-mapping', '관리번호 매핑은 이 version의 판정 scope에서 제외하고 별도 확인', mutation(service));
  gate = service.completeReview(mutation(service)); assert.equal(gate.canActivate, true); assert.equal(gate.status, 'ACTIVATION_ELIGIBLE');
  assert.equal(service.snapshot().sourceStatus, 'DRAFT_SOURCE_VERIFIED');
});

test('activation gate blocks unresolved, held, rejected critical, missing evidence, orphan and stale document', () => {
  const cases: [string, (service: RuleReviewService) => void, string][] = [
    ['unresolved', service => service.startReview(mutation(service)), 'UNRESOLVED'],
    ['conflict', service => { service.startReview(mutation(service)); service.resolveUnresolved('samdo.management-number-mapping', '별도 확인', mutation(service)); }, 'CONFLICT'],
    ['held critical', service => { service.startReview(mutation(service)); service.holdRule('youth.age', mutation(service, '판단 보류')); }, 'HELD_RULE'],
    ['rejected critical', service => { service.startReview(mutation(service)); service.rejectRule('youth.age', mutation(service, '추출 오류')); }, 'REJECTED_CRITICAL_RULE'],
    ['missing evidence', service => { service.startReview(mutation(service)); service.approveRule('youth.age', mutation(service, '근거 없이 승인 시도')); }, 'THROWS'],
    ['orphan exception', service => service.startReview(mutation(service)), 'ORPHAN_EXCEPTION'],
    ['document changed', service => { service.startReview(mutation(service)); service.invalidateDocument('b'.repeat(64), 'OFFICIAL_VERIFIED', mutation(service, '공식 문서 수신')); }, 'DOCUMENT_REVALIDATION_REQUIRED'],
  ];
  for (const [name, act, code] of cases) { const service = new RuleReviewService(samdoReviewSeed()); if (code === 'THROWS') assert.throws(() => act(service), /CRITICAL_RULE_REQUIRES_VALID_EVIDENCE/, name); else { act(service); assert.ok(service.gate().blockers.some(item => item.code === code), name); } }
});

test('stale revision and unsafe bulk approval are rejected; safe non-critical bulk is allowed only after evidence review', () => {
  const service = new RuleReviewService(samdoReviewSeed()); const stale = mutation(service); service.startReview(stale);
  assert.throws(() => service.holdRule('youth.age', stale), /STALE_REVIEW_REVISION/);
  reviewEvidence(service, 'youth.age'); assert.throws(() => service.bulkApproveSafe(['youth.age'], mutation(service)), /BULK_APPROVAL_UNSAFE/);
  reviewEvidence(service, 'youth.restrictions'); service.bulkApproveSafe(['youth.restrictions'], mutation(service, '비critical safe 후보 일괄 승인'));
  assert.equal(service.snapshot().rules.find(rule => rule.ruleId === 'youth.restrictions')?.reviewStatus, 'APPROVED');
});

test('conflict custom value requires valid evidence and exception relation endpoints are validated', () => {
  const service = new RuleReviewService(samdoReviewSeed()); service.startReview(mutation(service));
  assert.throws(() => service.resolveConflict('samdo.region.priority-date', { type: 'CUSTOM', value: '2년', evidenceIds: [], reason: '근거 없음' }, mutation(service)), /VALID_EVIDENCE/);
  assert.throws(() => service.linkException('youth.overseas', { status: 'LINKED', baseRuleId: 'missing', relationType: 'LIMITED_BY' }, mutation(service)), /RULE_NOT_FOUND/);
  service.linkException('youth.overseas', { status: 'HELD' }, mutation(service, '생업 목적 예외 확인 대기')); assert.ok(service.gate().blockers.some(item => item.code === 'HELD_RULE'));
});

test('summary, blocker-first list and detail DTO hide storage shape while preserving review history', () => {
  const service = new RuleReviewService(samdoReviewSeed()); service.startReview(mutation(service)); reviewEvidence(service, 'youth.age'); service.approveRule('youth.age', mutation(service, '나이 근거 확인'));
  const snapshot = service.snapshot(), summary = buildReviewSummary(snapshot), list = listReviewRules(snapshot), detail = getRuleDetail(snapshot, 'youth.age');
  assert.equal(summary.sourceStatus, 'DRAFT_SOURCE_VERIFIED'); assert.equal(summary.totalRules, 7); assert.equal(list[0].priority, 'CRITICAL_BLOCKER');
  assert.equal(detail.semanticRole, 'YOUTH_AGE'); assert.equal(detail.reviewState, 'APPROVED'); assert.ok(detail.history.some(item => item.action === 'APPROVE_RULE'));
  assert.ok(listReviewRules(snapshot, { supplyType: 'newlywed', criticality: 'CRITICAL' }).every(item => item.supplyType === 'newlywed' && item.critical));
});

test('critical reject remains missing instead of disappearing from required coverage', () => {
  const service = new RuleReviewService(samdoReviewSeed()); service.startReview(mutation(service)); service.rejectRule('youth.income', mutation(service, '잘못 추출된 필수 소득 rule'));
  const gate = service.gate(); assert.ok(gate.blockers.some(item => item.code === 'REJECTED_CRITICAL_RULE')); assert.ok(gate.blockers.some(item => item.code === 'MISSING_CRITICAL_RULE' && item.message.includes('youth:INCOME')));
});

test('official source hash never inherits draft approval', () => {
  const service = new RuleReviewService(samdoReviewSeed()); service.startReview(mutation(service)); reviewEvidence(service, 'youth.age'); service.approveRule('youth.age', mutation(service, '검토본 승인'));
  service.invalidateDocument('c'.repeat(64), 'OFFICIAL_VERIFIED', mutation(service, '공식 공고 수신'));
  const snapshot = service.snapshot(); assert.equal(snapshot.lifecycleStatus, 'REVALIDATION_REQUIRED'); assert.equal(snapshot.rules.find(rule => rule.ruleId === 'youth.age')?.reviewStatus, 'APPROVED');
  assert.equal(service.gate().status, 'REVALIDATION_REQUIRED'); assert.ok(service.gate().blockers.some(item => item.code === 'DOCUMENT_REVALIDATION_REQUIRED'));
});

test('workspace rejects duplicate identities and wrong rule version', () => {
  const seed = samdoReviewSeed(); seed.rules.push(structuredClone(seed.rules[0])); assert.throws(() => new RuleReviewService(seed), /INVALID_RULE_IDENTITY/);
  const wrong = samdoReviewSeed(); wrong.rules[0].ruleVersionId = 'other'; assert.throws(() => new RuleReviewService(wrong), /INVALID_RULE_IDENTITY/);
});

test('failed mutation rolls back all in-memory changes and does not append audit', () => {
  const service = new RuleReviewService(samdoReviewSeed()); service.startReview(mutation(service));
  const before = service.snapshot();
  assert.throws(() => service.approveRuleWithEdit('firstHome.deposit', { ...before.rules.find(rule => rule.ruleId === 'firstHome.deposit')!.originalCandidate, ruleKey: 'forged' },
    ['SEMANTIC_EVIDENCE_MISMATCH'], mutation(service, 'invalid identity')), /EDIT_IDENTITY_OR_DOCUMENT_MISMATCH/);
  assert.deepEqual(service.snapshot(), before);
});

test('v4.1 candidate materializer requires safety output and keeps candidate evidence immutable', () => {
  const hash = 'd'.repeat(64), candidate: CandidateRulePackage = { schemaVersion: 1, promptVersion: 'assessment-rule-extraction-v3', sourceStatus: 'REFERENCE', reviewStatus: 'REVIEW_REQUIRED',
    announcement: { canonicalId: 'e'.repeat(64), title: 'Samdo candidate test', announcementDate: '2026-09-14' }, document: { documentId: `sha256:${hash}`, sha256: hash, parserVersion: 'test' },
    candidateRules: [{ candidateRuleId: 'candidate:youth-income', supplyType: 'YOUTH', stage: 'COMMON', category: 'incomeThreshold', ruleKey: 'youth.income',
      condition: { input: 'monthlyIncome', operator: 'lte', value: 5338708, values: [] }, score: null, maxScore: null, requiredInputs: ['monthlyIncome'], relatedExceptionRuleKeys: [],
      evidence: [{ documentId: `sha256:${hash}`, blockId: 'b000001', tableId: null, row: null, column: null, snippet: '청년 본인 소득 140% 이하', locator: { kind: 'HWP_RECORD', pageNumber: null, stream: 'BodyText/Section0', recordOffset: 1, recordLevel: 0 } }],
      confidence: 'HIGH', confidenceReason: 'candidate only', reviewStatus: 'REVIEW_REQUIRED' }], unresolvedItems: [], conflicts: [], extractionWarnings: [] };
  assert.throws(() => materializeCandidateReviewSeed({ candidatePackage: candidate, ruleVersionId: 'version', version: 'candidate-v1', document: { id: 'document-db-id', parsedDocumentId: `sha256:${hash}`, fileName: 'samdo.hwp', versionLabel: 'VER1.7' },
    safetyByCandidateId: {}, semanticRoleByCandidateId: { 'candidate:youth-income': 'YOUTH.INCOME_LIMIT' }, requiredCategories: [] }), /MISSING_V41_SAFETY_RESULT/);
  const seed = materializeCandidateReviewSeed({ candidatePackage: candidate, ruleVersionId: 'version', version: 'candidate-v1', document: { id: 'document-db-id', parsedDocumentId: `sha256:${hash}`, fileName: 'samdo.hwp', versionLabel: 'VER1.7' },
    safetyByCandidateId: { 'candidate:youth-income': { status: 'REVIEW_REQUIRED', criticalRole: 'INCOME', confidence: 'REVIEW_REQUIRED', issues: [{ code: 'INCOME_EVIDENCE_CONTEXT_MISMATCH', category: 'EVIDENCE_SEMANTIC_MISMATCH' }] } },
    semanticRoleByCandidateId: { 'candidate:youth-income': 'YOUTH.INCOME_LIMIT' }, scopeByCandidateId: { 'candidate:youth-income': 'APPLICANT' }, requiredCategories: [{ supplyType: 'YOUTH', category: 'INCOME' }] });
  assert.equal(seed.sourceStatus, 'REFERENCE'); assert.deepEqual(seed.rules[0].safetyBlockers, ['SEMANTIC_EVIDENCE_MISMATCH']); assert.equal(seed.rules[0].originalCandidate.value, 5338708);
  const service = new RuleReviewService(seed); const before = service.snapshot().rules[0].originalCandidate; candidate.candidateRules[0].condition.value = 1;
  assert.deepEqual(service.snapshot().rules[0].originalCandidate, before);
});
