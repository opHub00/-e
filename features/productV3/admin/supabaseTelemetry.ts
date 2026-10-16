import type { AiMonitoringRecord, AssessmentMonitoringRecord } from './types.ts';
import { sanitizeMonitoringQuestion } from './service.ts';

type Result = { data: unknown; error: { message?: string; code?: string } | null };
type InsertBuilder = { insert: (value: Record<string, unknown>) => PromiseLike<Result> };
export type ProductV3TelemetryClient = { from: (table: string) => InsertBuilder };

const fail = (error: Result['error']) => { if (error) throw new Error(error.code || error.message || 'PRODUCT_V3_TELEMETRY_WRITE_FAILED'); };

/** Server-only writer. Callers must pass the sanitized contracts, never a raw profile or token. */
export class SupabaseProductV3TelemetrySink {
  private readonly client: ProductV3TelemetryClient;
  constructor(client: ProductV3TelemetryClient) { this.client = client; }
  async recordAi(record: AiMonitoringRecord) {
    const { error } = await this.client.from('product_v3_ai_monitoring').insert({ request_id: record.requestId, created_at: record.createdAt,
      sanitized_question: sanitizeMonitoringQuestion(record.sanitizedQuestion), resolver: record.resolver, mode: record.mode, provider: record.provider, model: record.model,
      rag_evidence_count: record.ragEvidenceCount, grounding_result: record.groundingResult, fallback_reason: record.fallbackReason,
      latency_ms: record.latencyMs, notice_ids: record.noticeIds });
    fail(error);
  }
  async recordAssessment(record: AssessmentMonitoringRecord) {
    const { error } = await this.client.from('product_v3_assessment_monitoring').insert({ id: record.id, created_at: record.createdAt,
      notice_ids: record.noticeIds, complete_count: record.statusCounts.COMPLETE, needs_user_input_count: record.statusCounts.NEEDS_USER_INPUT,
      ineligible_count: record.statusCounts.INELIGIBLE, unavailable_count: record.statusCounts.UNAVAILABLE, unresolved_labels: record.unresolvedCategories });
    fail(error);
  }
}
