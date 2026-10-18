import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { authorizeProductV3Admin } from './consoleApi.ts';
import { loadProductV3StagingSnapshot } from './stagingSnapshot.ts';
import { resolveProductV3StagingTarget } from '../../productV3/admin/stagingTarget.ts';
import { recordStagingAiTelemetry, recordStagingAssessmentTelemetry } from '../../productV3/admin/stagingTelemetry.ts';

const staging = {
  WANPANE_ENV: 'staging', VERCEL_ENV: 'preview', SUPABASE_STAGING_PROJECT_REF: 'aaaaaaaaaaaaaaaaaaaa',
  SUPABASE_PRODUCTION_PROJECT_REF: 'bbbbbbbbbbbbbbbbbbbb', SUPABASE_STAGING_URL: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',
  SUPABASE_STAGING_ANON_KEY: 'test-anon', SUPABASE_STAGING_SERVICE_ROLE_KEY: 'test-service-secret',
};

test('server target is explicit staging only; app public/production URL cannot silently win', () => {
  assert.equal(resolveProductV3StagingTarget({ ...staging, EXPO_PUBLIC_SUPABASE_URL: 'https://bbbbbbbbbbbbbbbbbbbb.supabase.co' }).ref, staging.SUPABASE_STAGING_PROJECT_REF);
  assert.throws(() => resolveProductV3StagingTarget({ ...staging, VERCEL_ENV: 'production' }), /PRODUCT_V3_STAGING_ONLY/);
  assert.throws(() => resolveProductV3StagingTarget({ ...staging, SUPABASE_STAGING_URL: 'https://bbbbbbbbbbbbbbbbbbbb.supabase.co' }), /PRODUCT_V3_STAGING_URL_MISMATCH/);
  assert.throws(() => resolveProductV3StagingTarget({ ...staging, SUPABASE_STAGING_PROJECT_REF: staging.SUPABASE_PRODUCTION_PROJECT_REF }), /PRODUCT_V3_STAGING_IDENTITY_REQUIRED/);
  assert.throws(() => resolveProductV3StagingTarget({ ...staging, SUPABASE_STAGING_SERVICE_ROLE_KEY: '' }), /PRODUCT_V3_STAGING_CREDENTIALS_REQUIRED/);
});

test('admin authorization sends the caller JWT only to the explicit staging project', async () => {
  let host = '';
  const fetcher = (async (url: URL) => { host = url.host; return Response.json({ role: 'admin' }); }) as typeof fetch;
  assert.equal(await authorizeProductV3Admin('caller-jwt', staging, fetcher), 'admin');
  assert.equal(host, 'aaaaaaaaaaaaaaaaaaaa.supabase.co');
});

test('operational snapshot is built exclusively from staging rows, including empty states and telemetry', async () => {
  const rows: Record<string, unknown[]> = {
    announcements: [{ id: 'notice-1', title: '실제 DB 공고', region_name: '제주', announcement_date: '2026-10-16', status: 'PUBLISHED', updated_at: '2026-10-16T00:00:00Z' }],
    announcement_documents: [{ id: 'doc-1', announcement_id: 'notice-1', file_name: 'official.hwp', sha256: 'a'.repeat(64), is_official: true }],
    assessment_rule_sets: [{ id: 'pkg-1', announcement_id: 'notice-1', version: '1.0', is_active: true, approved_at: '2026-10-16T00:00:00Z' }],
    assessment_rules: [{ id: 'rule-1', rule_set_id: 'pkg-1', category: 'ELIGIBILITY', supply_type: 'GENERAL', rule_key: 'internal.key' }],
    rule_evidence: [{ rule_id: 'rule-1', section: '신청자격', text_excerpt: '공식 근거', locator: { paragraph: 4 }, evidence_label: '무주택세대구성원' }],
    assessment_rule_review_versions: [], assessment_rule_reviews: [],
    product_v3_ai_monitoring: [{ request_id: 'r1', created_at: '2026-10-17T00:01:00Z', sanitized_question: '010-1234-5678', resolver: 'EXACT_STRUCTURED', mode: 'fallback', provider: null, rag_evidence_count: 1, grounding_result: 'REJECTED', fallback_reason: 'grounding_rejected', latency_ms: 25 }],
    product_v3_assessment_monitoring: [{ created_at: '2026-10-17T00:02:00Z', complete_count: 1, needs_user_input_count: 2, ineligible_count: 1, unavailable_count: 0, unresolved_labels: ['소득', 'score.key'] }],
    product_v3_assessment_events: [
      { request_id: 'r1', created_at: '2026-10-17T00:02:00Z', notice_id: 'samdo-1', supply_type: 'YOUTH', status: 'COMPLETE', unresolved_categories: [] },
      { request_id: 'r1', created_at: '2026-10-17T00:02:00Z', notice_id: 'samdo-2', supply_type: 'YOUTH', status: 'NEEDS_USER_INPUT', unresolved_categories: ['소득', 'score.key'] },
      { request_id: 'r1', created_at: '2026-10-17T00:02:00Z', notice_id: 'samdo-1', supply_type: 'GENERAL', status: 'NEEDS_USER_INPUT', unresolved_categories: [] },
      { request_id: 'r1', created_at: '2026-10-17T00:02:00Z', notice_id: 'samdo-2', supply_type: 'GENERAL', status: 'INELIGIBLE', unresolved_categories: [] },
    ],
    product_v3_admin_audit_log: [{ id: 'audit-1', actor_id: 'admin-1', action: 'APPROVE_RULE_PACKAGE', entity: 'RULE_PACKAGE', entity_id: 'pkg-1', created_at: '2026-10-17T00:03:00Z', before_snapshot: { status: 'IN_REVIEW' }, after_snapshot: { status: 'APPROVED' } }],
  };
  const seen: string[] = [];
  const fetcher = (async (url: URL, init?: RequestInit) => {
    assert.equal(url.host, 'aaaaaaaaaaaaaaaaaaaa.supabase.co');
    assert.equal((init?.headers as Record<string, string>).apikey, 'test-service-secret');
    const table = url.pathname.split('/').at(-1)!;
    seen.push(table);
    return Response.json(rows[table] ?? []);
  }) as typeof fetch;
  const snapshot = await loadProductV3StagingSnapshot(staging, fetcher, () => '2026-10-17T10:00:00Z');
  assert.equal(snapshot.notices.length, 1);
  assert.equal(snapshot.notices[0].status, 'ACTIVE');
  assert.equal(snapshot.notices[0].title, '실제 DB 공고');
  assert.equal(snapshot.notices[0].provenance.sha256, 'a'.repeat(64));
  assert.equal(snapshot.rules[0].condition, '무주택세대구성원');
  assert.deepEqual(snapshot.assessments.byStatus, { COMPLETE: 1, NEEDS_USER_INPUT: 2, INELIGIBLE: 1, UNAVAILABLE: 0 });
  assert.deepEqual(snapshot.assessments.blockers, [{ label: '기타 확인 필요', count: 1 }, { label: '소득', count: 1 }].sort((a, b) => a.label.localeCompare(b.label, 'ko')));
  assert.equal(snapshot.ai[0].mode, 'fallback');
  assert.equal(snapshot.audit[0].action, 'APPROVE_RULE_PACKAGE');
  assert.ok(snapshot.errors.some(error => error.source === 'RAG 메타데이터'));
  assert.equal(snapshot.errors.find(error => error.source === 'RAG 메타데이터')?.level, 'WARNING');
  assert.equal(seen.length, 11);
  assert.ok(!JSON.stringify(snapshot).includes('test-service-secret'));
  assert.ok(!JSON.stringify(snapshot).includes('score.key'));
  assert.ok(!JSON.stringify(snapshot).includes('010-1234-5678'));
});

test('stale Samdo staging source is a blocking operational error, not a RAG-only warning', async () => {
  const rows: Record<string, unknown[]> = {
    announcements: [{ id: 'samdo-db-1', title: '삼도이동 1지구 토지임대부 공공분양주택', status: 'PUBLISHED' }],
    announcement_documents: [{ id: 'old-doc', announcement_id: 'samdo-db-1', file_name: 'VER1.7.hwp', sha256: 'b'.repeat(64), is_official: false }],
    assessment_rule_sets: [{ id: 'old-rules', announcement_id: 'samdo-db-1', version: 'VER1.7', is_active: true }],
  };
  const fetcher = (async (url: URL) => Response.json(rows[url.pathname.split('/').at(-1)!] ?? [])) as typeof fetch;
  const snapshot = await loadProductV3StagingSnapshot(staging, fetcher);
  assert.equal(snapshot.errors.find(error => error.source === '공고 원문 버전 불일치')?.level, 'ERROR');
  assert.equal(snapshot.notices[0].ragVersion, null);
  assert.equal(snapshot.notices[0].ragChunkCount, 0);
});

test('one unavailable staging table fails closed; static seed is never substituted', async () => {
  const fetcher = (async () => new Response(null, { status: 404 })) as typeof fetch;
  await assert.rejects(loadProductV3StagingSnapshot(staging, fetcher), /PRODUCT_V3_STAGING_READ_FAILED/);
  const malformed = (async () => Response.json({ data: [] })) as typeof fetch;
  await assert.rejects(loadProductV3StagingSnapshot(staging, malformed), /PRODUCT_V3_STAGING_RESPONSE_INVALID/);
});

test('staging AI telemetry persists mode and timing but never the raw question or token', async () => {
  let payload: Record<string, unknown> = {};
  const fetcher = (async (url: URL, init?: RequestInit) => {
    assert.equal(url.host, 'aaaaaaaaaaaaaaaaaaaa.supabase.co');
    payload = JSON.parse(String(init?.body));
    return new Response(null, { status: 201 });
  }) as typeof fetch;
  await recordStagingAiTelemetry({ requestId: 'r1', createdAt: '2026-10-17T00:00:00Z', sanitizedQuestion: '010-1234-5678 token=secret123456789012345',
    resolver: 'EXACT_STRUCTURED', mode: 'deterministic', provider: null, model: null, ragEvidenceCount: 1,
    groundingResult: 'NOT_RUN', fallbackReason: null, latencyMs: 20, noticeIds: ['samdo-1', 'a'.repeat(64)] }, staging, fetcher);
  assert.equal(payload.sanitized_question, '질문 분류: EXACT_STRUCTURED');
  assert.deepEqual(payload.notice_ids, ['samdo-1']);
  assert.equal(payload.mode, 'deterministic');
  assert.equal(payload.latency_ms, 20);
  assert.ok(!JSON.stringify(payload).includes('010-1234-5678'));
  assert.ok(!JSON.stringify(payload).includes('secret123456789012345'));
  assert.ok(!JSON.stringify(payload).includes('a'.repeat(64)));
  await assert.rejects(recordStagingAiTelemetry({ requestId: 'r1', createdAt: '2026-10-17T00:00:00Z', sanitizedQuestion: 'x',
    resolver: 'EXACT_STRUCTURED', mode: 'deterministic', provider: null, model: null, ragEvidenceCount: 0,
    groundingResult: 'NOT_RUN', fallbackReason: null, latencyMs: 0, noticeIds: [] }, { ...staging, VERCEL_ENV: 'production' }, fetcher), /PRODUCT_V3_STAGING_ONLY/);
});

test('assessment telemetry stores only approved aggregate labels, not raw fact keys or profile', async () => {
  let payload: Record<string, unknown> = {};
  const fetcher = (async (_url: URL, init?: RequestInit) => { payload = JSON.parse(String(init?.body)); return new Response(null, { status: 201 }); }) as typeof fetch;
  await recordStagingAssessmentTelemetry({ id: 'a1', createdAt: '2026-10-17T00:00:00Z', noticeIds: ['samdo-1', 'a'.repeat(64)],
    statusCounts: { COMPLETE: 1, NEEDS_USER_INPUT: 2, INELIGIBLE: 0, UNAVAILABLE: 0 },
    unresolvedCategories: ['소득', 'score.applicantDisabled'] }, staging, fetcher);
  assert.deepEqual(payload.notice_ids, ['samdo-1']);
  assert.deepEqual(payload.unresolved_labels, ['소득', '기타 확인 필요']);
  assert.ok(!JSON.stringify(payload).includes('score.applicantDisabled'));
});
