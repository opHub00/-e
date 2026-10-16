import type { Notice, RulePackage } from '../../noticePlatform/types.ts';
import type { AdminDashboardViewModel, AiMonitoringRecord, AiMonitoringViewModel, AssessmentMonitoringRecord, AssessmentMonitoringViewModel, NoticeAdminViewModel, RulePackageReviewViewModel } from './types.ts';

const round = (value: number) => Math.round(value * 100) / 100;
const percentile95 = (values: number[]) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1] : 0;

export function buildNoticeAdminViewModel(notice: Notice, rulePackage: RulePackage | undefined, ragVersion: string | undefined): NoticeAdminViewModel {
  return { noticeId: notice.id, title: notice.title, complex: notice.complex.name, region: notice.listing.region, noticeDate: notice.noticeDate,
    supplyTypes: notice.supplyTypes.map(item => item.label), status: notice.status, sourceDocument: notice.sourceDocument.fileName,
    sourceHash: notice.sourceDocument.sha256, provenance: { managementNumber: notice.managementNumber, official: notice.sourceDocument.official },
    rulePackageVersion: rulePackage?.version ?? null, ragVersion: ragVersion ?? null, createdAt: notice.createdAt, updatedAt: notice.updatedAt, activatedAt: notice.activatedAt };
}

export function buildRulePackageReviewViewModel(pkg: RulePackage): RulePackageReviewViewModel {
  const rules = pkg.rules.map(rule => ({ id: rule.id, ruleType: rule.type, supplyType: rule.supplyTypeId, label: rule.label,
    evidenceLocator: rule.evidence.locator ?? null, evidenceExcerpt: rule.evidence.textExcerpt ?? null,
    provenance: { source: rule.evidence.source, section: rule.evidence.section, documentId: rule.evidence.documentId ?? null },
    scoreRule: rule.isScoreRule, missingEvidence: !rule.evidence.textExcerpt || !rule.evidence.locator }));
  const missing = rules.some(rule => rule.missingEvidence), errors = pkg.validationErrors.length > 0;
  return { id: pkg.id, noticeId: pkg.noticeId, version: pkg.version, status: pkg.status, ruleCount: rules.length, rules,
    validationErrors: [...pkg.validationErrors], canRequestReview: pkg.status === 'DRAFT', canApprove: pkg.status === 'IN_REVIEW' && !missing && !errors,
    canActivate: pkg.status === 'APPROVED' && !missing && !errors };
}

export function buildAiMonitoringViewModel(records: readonly AiMonitoringRecord[]): AiMonitoringViewModel {
  const latency = records.map(item => item.latencyMs);
  return { total: records.length, deterministic: records.filter(item => item.mode === 'deterministic').length,
    llm: records.filter(item => item.mode === 'llm').length, fallback: records.filter(item => item.mode === 'fallback').length,
    groundingRejection: records.filter(item => item.fallbackReason === 'grounding_rejected').length,
    providerError: records.filter(item => item.fallbackReason === 'provider_error').length,
    timeout: records.filter(item => item.fallbackReason === 'timeout').length,
    averageLatencyMs: records.length ? round(latency.reduce((sum, value) => sum + value, 0) / records.length) : 0,
    p95LatencyMs: percentile95(latency), recent: [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50).map(item => structuredClone(item)) };
}

export function buildAssessmentMonitoringViewModel(records: readonly AssessmentMonitoringRecord[]): AssessmentMonitoringViewModel {
  const statusCounts = { COMPLETE: 0, NEEDS_USER_INPUT: 0, INELIGIBLE: 0, UNAVAILABLE: 0 };
  const frequency = new Map<string, number>();
  for (const record of records) {
    for (const key of Object.keys(statusCounts) as Array<keyof typeof statusCounts>) statusCounts[key] += record.statusCounts[key];
    for (const label of record.unresolvedCategories) frequency.set(label, (frequency.get(label) ?? 0) + 1);
  }
  return { total: Object.values(statusCounts).reduce((sum, value) => sum + value, 0), statusCounts,
    unresolvedFactFrequency: [...frequency].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko')) };
}

export function buildAdminDashboardViewModel(notices: readonly Notice[], packages: readonly RulePackage[], ai: readonly AiMonitoringRecord[], assessments: readonly AssessmentMonitoringRecord[]): AdminDashboardViewModel {
  return { activeNoticeCount: notices.filter(item => item.status === 'ACTIVE').length, draftNoticeCount: notices.filter(item => item.status === 'DRAFT').length,
    activeRulePackageCount: packages.filter(item => item.status === 'ACTIVE').length,
    reviewRequiredCount: notices.filter(item => item.status === 'REVIEW_REQUIRED').length + packages.filter(item => item.status === 'IN_REVIEW' || item.validationErrors.length > 0).length,
    ai: buildAiMonitoringViewModel(ai), assessments: buildAssessmentMonitoringViewModel(assessments) };
}
