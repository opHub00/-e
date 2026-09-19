import { canActivateRuleVersion } from './service.ts';
import type { CriticalCategory, RuleReviewRecord, RuleReviewStatus, RuleReviewWorkspace } from './types.ts';

export type ReviewSummaryDto = {
  announcement: RuleReviewWorkspace['announcement'];
  document: RuleReviewWorkspace['document'];
  sourceStatus: RuleReviewWorkspace['sourceStatus'];
  ruleVersion: { id: string; version: string; revision: number; lifecycleStatus: RuleReviewWorkspace['lifecycleStatus'] };
  totalRules: number;
  pending: number;
  approved: number;
  edited: number;
  held: number;
  rejected: number;
  criticalPending: number;
  conflicts: number;
  orphanExceptions: number;
  unresolved: number;
  activationBlockers: ReturnType<typeof canActivateRuleVersion>['blockers'];
  activationStatus: ReturnType<typeof canActivateRuleVersion>['status'];
};

export type RuleListFilter = { supplyType?: string; criticality?: 'CRITICAL' | 'NON_CRITICAL'; reviewStatus?: RuleReviewStatus; hasConflict?: boolean; hasException?: boolean; hasWarning?: boolean };
export type RuleListItemDto = { ruleId: string; ruleLabel: string; semanticRole: string; supplyType: string; category: CriticalCategory; critical: boolean;
  reviewStatus: RuleReviewStatus; priority: 'CRITICAL_BLOCKER' | 'REVIEW_REQUIRED' | 'NORMAL'; hasConflict: boolean; hasException: boolean; hasWarning: boolean };

const effective = (rule: RuleReviewRecord) => rule.editedRuleSnapshot ?? rule.originalCandidate;
export function buildReviewSummary(workspace: RuleReviewWorkspace): ReviewSummaryDto {
  const gate = canActivateRuleVersion(workspace);
  return { announcement: structuredClone(workspace.announcement), document: structuredClone(workspace.document), sourceStatus: workspace.sourceStatus,
    ruleVersion: { id: workspace.ruleVersionId, version: workspace.version, revision: workspace.revision, lifecycleStatus: workspace.lifecycleStatus },
    totalRules: workspace.rules.length, pending: workspace.rules.filter(rule => ['PENDING_REVIEW', 'IN_REVIEW'].includes(rule.reviewStatus)).length,
    approved: workspace.rules.filter(rule => rule.reviewStatus === 'APPROVED').length, edited: workspace.rules.filter(rule => rule.reviewStatus === 'APPROVED_WITH_EDIT').length,
    held: workspace.rules.filter(rule => rule.reviewStatus === 'HELD').length, rejected: workspace.rules.filter(rule => rule.reviewStatus === 'REJECTED').length,
    criticalPending: gate.pendingCriticalCount, conflicts: gate.conflictsCount,
    orphanExceptions: workspace.exceptionReviews.filter(item => item.status === 'ORPHAN_EXCEPTION' || item.status === 'WRONG_RELATION').length,
    unresolved: gate.unresolvedCount, activationBlockers: structuredClone(gate.blockers), activationStatus: gate.status };
}

export function listReviewRules(workspace: RuleReviewWorkspace, filter: RuleListFilter = {}): RuleListItemDto[] {
  const blockers = canActivateRuleVersion(workspace).blockers;
  return workspace.rules.map(rule => {
    const value = effective(rule), hasConflict = workspace.conflicts.some(item => item.candidateRuleIds.includes(rule.ruleId) && (!item.resolution || item.resolution.type === 'HELD')),
      hasException = value.category === 'EXCEPTION' || value.relatedExceptionRuleIds.length > 0,
      hasWarning = value.warnings.length > 0 || rule.safetyBlockers.length > 0,
      blocking = blockers.some(item => item.ruleId === rule.ruleId),
      priority = blocking || (rule.critical && !['APPROVED', 'APPROVED_WITH_EDIT'].includes(rule.reviewStatus)) ? 'CRITICAL_BLOCKER' as const :
        rule.candidateStatus !== 'AUTO_SAFE_CANDIDATE' || hasWarning ? 'REVIEW_REQUIRED' as const : 'NORMAL' as const;
    return { ruleId: rule.ruleId, ruleLabel: value.label, semanticRole: value.semanticRole, supplyType: value.supplyType, category: value.category,
      critical: rule.critical, reviewStatus: rule.reviewStatus, priority, hasConflict, hasException, hasWarning };
  }).filter(item => (!filter.supplyType || item.supplyType === filter.supplyType) && (!filter.criticality || (filter.criticality === 'CRITICAL') === item.critical) &&
      (!filter.reviewStatus || item.reviewStatus === filter.reviewStatus) && (filter.hasConflict === undefined || item.hasConflict === filter.hasConflict) &&
      (filter.hasException === undefined || item.hasException === filter.hasException) && (filter.hasWarning === undefined || item.hasWarning === filter.hasWarning))
    .sort((a, b) => ({ CRITICAL_BLOCKER: 0, REVIEW_REQUIRED: 1, NORMAL: 2 }[a.priority] - { CRITICAL_BLOCKER: 0, REVIEW_REQUIRED: 1, NORMAL: 2 }[b.priority]) || a.ruleLabel.localeCompare(b.ruleLabel, 'ko'));
}

export function getRuleDetail(workspace: RuleReviewWorkspace, ruleId: string) {
  const rule = workspace.rules.find(item => item.ruleId === ruleId); if (!rule) throw new Error('RULE_NOT_FOUND');
  const original = structuredClone(rule.originalCandidate), edited = rule.editedRuleSnapshot ? structuredClone(rule.editedRuleSnapshot) : null;
  return { ruleId, ruleVersionId: rule.ruleVersionId, ruleLabel: effective(rule).label, semanticRole: effective(rule).semanticRole,
    value: effective(rule).value, operator: effective(rule).operator, scope: effective(rule).scope, stage: effective(rule).stage,
    score: effective(rule).score, maxScore: effective(rule).maxScore, source: effective(rule).evidence.map(evidence => ({ label: evidence.label, section: evidence.section,
      tableLabel: evidence.tableLabel, textExcerpt: evidence.textExcerpt, locator: structuredClone(evidence.locator), review: structuredClone(rule.evidenceReviews.find(item => item.evidenceId === evidence.id)) })),
    exceptionRelations: workspace.exceptionReviews.filter(item => item.exceptionRuleId === ruleId || item.baseRuleId === ruleId).map(item => structuredClone(item)),
    warnings: [...effective(rule).warnings, ...rule.safetyBlockers], originalCandidate: original, editedCandidate: edited, reviewState: rule.reviewStatus,
    history: workspace.auditLog.filter(entry => entry.targetId === ruleId || (entry.targetType === 'EVIDENCE' && original.evidence.some(evidence => evidence.id === entry.targetId))).map(entry => structuredClone(entry)) };
}
