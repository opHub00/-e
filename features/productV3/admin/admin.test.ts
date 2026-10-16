import assert from 'node:assert/strict';
import { test } from 'node:test';
import { noticePlatform } from '../../eventKiosk/noticePlatform/index.ts';
import { InMemoryAdminOperationStore } from './repository.ts';
import { buildProductV3AdminSeed } from './seed.ts';
import { AdminOperationService, sanitizeMonitoringQuestion } from './service.ts';

const mutation = { actor: { id: 'admin-1', role: 'admin' as const }, reason: 'Product V3 검수', at: '2026-10-16T10:00:00+09:00' };

test('admin lifecycle is fail-closed and every staging mutation is audited', async () => {
  const seed = buildProductV3AdminSeed(noticePlatform), store = new InMemoryAdminOperationStore(seed), service = new AdminOperationService(store, 'preview');
  const base = noticePlatform.rulePackage('samdo-1');
  const draft = { ...base, id: 'samdo-1-v3-draft', version: 'v3-draft', validationErrors: [] };
  await service.stageRulePackage(draft, mutation);
  await service.requestRuleReview(draft.id, { ...mutation, at: '2026-10-16T10:01:00+09:00' });
  await service.approveRulePackage(draft.id, { ...mutation, at: '2026-10-16T10:02:00+09:00' });
  await service.activateRulePackage(draft.id, { ...mutation, at: '2026-10-16T10:03:00+09:00' });
  assert.equal((await service.rulePackage(draft.id)).status, 'ACTIVE');
  assert.deepEqual((await service.audits()).map(item => item.action), ['STAGE_RULE_PACKAGE', 'REQUEST_RULE_REVIEW', 'APPROVE_RULE_PACKAGE', 'ACTIVATE_RULE_PACKAGE']);
  await assert.rejects(() => service.stageRulePackage(draft, mutation), /ACTIVE_RULE_PACKAGE_IMMUTABLE/);
  const production = new AdminOperationService(new InMemoryAdminOperationStore(seed), 'production');
  await assert.rejects(() => production.stageRulePackage(draft, mutation), /PRODUCTION_ADMIN_MUTATION_DISABLED/);
});

test('monitoring aggregates mode, latency, unresolved labels and removes private values', async () => {
  const store = new InMemoryAdminOperationStore(buildProductV3AdminSeed(noticePlatform)), service = new AdminOperationService(store, 'preview');
  await service.recordAi({ requestId: 'r1', createdAt: '2026-10-16T10:00:00Z', sanitizedQuestion: '내 소득 4500000 token=abcdefghijklmnopqrs 010-1234-5678', resolver: 'ASSESSMENT_AWARE', mode: 'fallback', provider: 'google-gemini', model: 'gemini', ragEvidenceCount: 2, groundingResult: 'REJECTED', fallbackReason: 'grounding_rejected', latencyMs: 100, noticeIds: ['samdo-1'] });
  await service.recordAi({ requestId: 'r2', createdAt: '2026-10-16T10:01:00Z', sanitizedQuestion: '일정 알려줘', resolver: 'EXACT', mode: 'llm', provider: 'google-gemini', model: 'gemini', ragEvidenceCount: 1, groundingResult: 'PASSED', fallbackReason: null, latencyMs: 300, noticeIds: ['samdo-1', 'samdo-2'] });
  await service.recordAssessment({ id: 'a1', createdAt: '2026-10-16T10:02:00Z', noticeIds: ['samdo-1'], statusCounts: { COMPLETE: 1, NEEDS_USER_INPUT: 2, INELIGIBLE: 1, UNAVAILABLE: 0 }, unresolvedCategories: ['재당첨 제한', '소득'] });
  const dashboard = await service.dashboard(), state = await store.read();
  assert.deepEqual({ total: dashboard.ai.total, llm: dashboard.ai.llm, fallback: dashboard.ai.fallback, avg: dashboard.ai.averageLatencyMs, p95: dashboard.ai.p95LatencyMs }, { total: 2, llm: 1, fallback: 1, avg: 200, p95: 300 });
  assert.equal(dashboard.assessments.total, 4);
  assert.equal(dashboard.assessments.unresolvedFactFrequency[0].count, 1);
  assert.doesNotMatch(state.ai[0].sanitizedQuestion, /4500000|abcdefghijklmnopqrs|010-1234-5678/);
  assert.match(sanitizeMonitoringQuestion('asset=99999999'), /정확한 값 제거/);
});
