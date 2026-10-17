import type { AdminOperationSnapshot } from '../productV3/admin/types.ts';
import {
  buildAiMonitoringViewModel,
  buildAssessmentMonitoringViewModel,
  buildNoticeAdminViewModel,
  buildRulePackageReviewViewModel,
} from '../productV3/admin/presentation.ts';
import type { ConsoleAuditEntry, ConsoleSnapshot, ConsoleValidation } from './contract.ts';

const validationOf = (errors: string[], missingEvidence: boolean): ConsoleValidation =>
  errors.length ? { status: 'FAIL', messages: errors }
    : missingEvidence ? { status: 'WARN', messages: ['원문 근거 확인 필요'] }
      : { status: 'PASS', messages: [] };

const auditFields = (value: unknown): ConsoleAuditEntry['before'] => {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  return Object.fromEntries(['id', 'status', 'version', 'sourceHash', 'updatedAt']
    .filter(key => ['string', 'number', 'boolean'].includes(typeof source[key]) || source[key] === null)
    .map(key => [key, source[key] as string | number | boolean | null]));
};

/** Converts only the backend's reviewed ViewModels and sanitized records for the console. */
export function buildConnectedConsoleSnapshot(
  state: AdminOperationSnapshot,
  ragChunkCounts: Record<string, number>,
  generatedAt: string,
  monitoringConnected: boolean,
): ConsoleSnapshot {
  const packages = new Map(state.rulePackages.map(pkg => [pkg.noticeId, pkg]));
  const assessment = buildAssessmentMonitoringViewModel(state.assessments);
  const ai = buildAiMonitoringViewModel(state.ai);
  const notices = state.notices.map(notice => {
    const pkg = packages.get(notice.id);
    const view = buildNoticeAdminViewModel(notice, pkg, state.ragVersions[notice.id]);
    const review = pkg ? buildRulePackageReviewViewModel(pkg) : null;
    return {
      id: view.noticeId, title: view.title, region: view.region, announcementDate: view.noticeDate, status: view.status,
      ruleVersion: view.rulePackageVersion, ragVersion: view.ragVersion,
      provenance: { fileName: view.sourceDocument, sha256: view.sourceHash, official: view.provenance.official },
      updatedAt: view.updatedAt, supplyTypes: view.supplyTypes, ruleCount: review?.ruleCount ?? 0,
      ragChunkCount: ragChunkCounts[view.noticeId] ?? 0,
      validation: validationOf(review?.validationErrors ?? [], review?.rules.some(rule => rule.missingEvidence) ?? false),
      history: state.audits.filter(item => item.entityId === view.noticeId).map(item => ({
        at: item.timestamp, actor: item.actor.id, summary: item.action,
      })),
    };
  });
  const rules = state.rulePackages.flatMap(pkg => {
    const view = buildRulePackageReviewViewModel(pkg);
    return view.rules.map(rule => ({
      id: rule.id, noticeId: view.noticeId, ruleType: rule.ruleType, supplyType: rule.supplyType,
      condition: rule.label, value: '', evidence: {
        section: rule.provenance.section, excerpt: rule.evidenceExcerpt ?? '근거 문장 확인 필요',
        locator: rule.evidenceLocator ? JSON.stringify(rule.evidenceLocator) : 'locator 없음',
      },
      validation: validationOf(view.validationErrors, rule.missingEvidence),
      status: view.status === 'ACTIVE' || view.status === 'APPROVED' ? 'APPROVED' as const : 'PENDING' as const,
    }));
  });
  const audit: ConsoleAuditEntry[] = state.audits.map(item => ({
    id: item.id, at: item.timestamp, actor: item.actor.id, action: item.action,
    entity: { type: item.entity, id: item.entityId, label: item.entityId },
    before: auditFields(item.before), after: auditFields(item.after),
  }));
  return {
    generatedAt,
    notices, rules,
    assessments: {
      date: generatedAt.slice(0, 10), byStatus: assessment.statusCounts,
      blockers: assessment.unresolvedFactFrequency,
    },
    ai: ai.recent.map(item => ({
      id: item.requestId, at: item.createdAt, question: item.sanitizedQuestion, mode: item.mode,
      provider: item.provider, fallbackReason: item.fallbackReason,
      groundingRejected: item.groundingResult === 'REJECTED', providerError: item.fallbackReason === 'provider_error' || item.fallbackReason === 'timeout',
      evidenceCount: item.ragEvidenceCount, latencyMs: item.latencyMs, evidence: [],
    })),
    audit,
    errors: monitoringConnected ? [] : [{ at: generatedAt, source: '운영 모니터링', message: 'Preview 운영 DB 연결 대기 · 집계 수치는 아직 수집되지 않았어요.' }],
  };
}
