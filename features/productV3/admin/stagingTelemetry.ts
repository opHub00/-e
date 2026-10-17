import type { EventChatTelemetry } from '../../eventKiosk/server/eventChat.ts';
import type { AssessmentMonitoringRecord } from './types.ts';
import { resolveProductV3StagingTarget, sanitizeUnresolvedCategory } from './stagingTarget.ts';

const safeNoticeIds = (ids: string[]) => [...new Set(ids.filter(id => /^[a-z][a-z0-9-]{1,62}$/.test(id)))];

/** The free-form question is intentionally not persisted: redaction cannot reliably detect every PII shape. */
export async function recordStagingAiTelemetry(
  record: EventChatTelemetry,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const target = resolveProductV3StagingTarget(env);
  const response = await fetcher(new URL('/rest/v1/product_v3_ai_monitoring', target.url), {
    method: 'POST',
    headers: { apikey: target.serviceRoleKey, authorization: `Bearer ${target.serviceRoleKey}`, 'content-type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({
      request_id: record.requestId, created_at: record.createdAt,
      sanitized_question: `질문 분류: ${/^[A-Z_]{2,40}$/.test(record.resolver) ? record.resolver : 'OTHER'}`,
      resolver: record.resolver, mode: record.mode, provider: record.provider, model: record.model,
      rag_evidence_count: record.ragEvidenceCount, grounding_result: record.groundingResult,
      fallback_reason: record.fallbackReason, latency_ms: record.latencyMs,
      notice_ids: safeNoticeIds(record.noticeIds),
    }),
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error(`PRODUCT_V3_STAGING_AI_WRITE_FAILED:${response.status}`);
}

/** Assessment callers pass aggregate status counts only, never a UserProfile. */
export async function recordStagingAssessmentTelemetry(
  record: AssessmentMonitoringRecord,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const target = resolveProductV3StagingTarget(env);
  const response = await fetcher(new URL('/rest/v1/product_v3_assessment_monitoring', target.url), {
    method: 'POST',
    headers: { apikey: target.serviceRoleKey, authorization: `Bearer ${target.serviceRoleKey}`, 'content-type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({
      id: record.id, created_at: record.createdAt,
      notice_ids: safeNoticeIds(record.noticeIds),
      complete_count: record.statusCounts.COMPLETE,
      needs_user_input_count: record.statusCounts.NEEDS_USER_INPUT,
      ineligible_count: record.statusCounts.INELIGIBLE,
      unavailable_count: record.statusCounts.UNAVAILABLE,
      unresolved_labels: [...new Set(record.unresolvedCategories.map(sanitizeUnresolvedCategory))],
    }),
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error(`PRODUCT_V3_STAGING_ASSESSMENT_WRITE_FAILED:${response.status}`);
}
