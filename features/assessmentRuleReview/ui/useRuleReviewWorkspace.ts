import { useCallback, useMemo, useRef, useState } from 'react';
import { RuleReviewService } from '../server/service.ts';
import { buildReviewSummary, getRuleDetail, listReviewRules, type RuleListFilter } from '../server/dto.ts';
import type { ReviewEvidence, ReviewableRuleSnapshot, RuleReviewWorkspace } from '../server/types.ts';
import { SAMDO_REVIEW_SEED } from './samdoReviewSeed.generated.ts';

/**
 * Holds one in-memory review session.
 *
 * Every decision goes through the real `RuleReviewService`, so the console cannot
 * approve something the backend would refuse: its guards, activation gate and audit
 * log are the ones that run here. Nothing is read from or written to a database —
 * the service is constructed from a fixture seed and lives for the page's lifetime.
 */
const ACTOR = 'reviewer@wanpane.local';

export type ReviewActionResult = { ok: true } | { ok: false; code: string };

export function useRuleReviewWorkspace() {
  const service = useRef<RuleReviewService>(undefined as unknown as RuleReviewService);
  if (!service.current) service.current = new RuleReviewService(SAMDO_REVIEW_SEED);
  const [workspace, setWorkspace] = useState<RuleReviewWorkspace>(() => service.current.snapshot());
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastDone, setLastDone] = useState<string | null>(null);

  /** Service errors are decision outcomes, not crashes: the UI shows why it refused. */
  const run = useCallback((operation: (instance: RuleReviewService, revision: number) => void, done?: string): ReviewActionResult => {
    try {
      operation(service.current, service.current.snapshot().revision);
      setWorkspace(service.current.snapshot());
      setLastError(null);
      setLastDone(done ?? null);
      return { ok: true };
    } catch (error) {
      const code = error instanceof Error ? error.message : 'UNKNOWN_REVIEW_ERROR';
      setWorkspace(service.current.snapshot());
      setLastError(code);
      setLastDone(null);
      return { ok: false, code };
    }
  }, []);

  const actions = useMemo(() => ({
    startReview: (reason: string) => run((s, revision) => s.startReview({ expectedRevision: revision, actor: ACTOR, reason }), '검수를 시작했어요.'),
    approve: (ruleId: string, reason: string) => run((s, revision) => s.approveRule(ruleId, { expectedRevision: revision, actor: ACTOR, reason }), '승인했어요.'),
    approveWithEdit: (ruleId: string, edited: ReviewableRuleSnapshot, resolved: Parameters<RuleReviewService['approveRuleWithEdit']>[2], reason: string) =>
      run((s, revision) => s.approveRuleWithEdit(ruleId, edited, resolved, { expectedRevision: revision, actor: ACTOR, reason }), '수정한 내용으로 승인했어요.'),
    hold: (ruleId: string, reason: string) => run((s, revision) => s.holdRule(ruleId, { expectedRevision: revision, actor: ACTOR, reason }), '보류로 바꿨어요.'),
    reject: (ruleId: string, reason: string) => run((s, revision) => s.rejectRule(ruleId, { expectedRevision: revision, actor: ACTOR, reason }), '제외했어요.'),
    reviewEvidence: (ruleId: string, evidenceId: string, status: Parameters<RuleReviewService['reviewEvidence']>[2], reason: string, replacement?: ReviewEvidence) =>
      run((s, revision) => s.reviewEvidence(ruleId, evidenceId, status, { expectedRevision: revision, actor: ACTOR, reason }, replacement ? { replacement } : {}),
        status === 'REPLACED' ? '근거를 교체했어요.' : status === 'VALID' ? '근거를 유효로 표시했어요.' : status === 'INVALID' ? '근거를 무효로 표시했어요.' : '근거 상태를 바꿨어요.'),
    /** Reproduces a second reviewer having saved first, so the UI can show that path. */
    simulateStaleRevision: (ruleId: string) =>
      run((s, revision) => s.holdRule(ruleId, { expectedRevision: revision - 1, actor: 'other.reviewer@wanpane.local', reason: '동시 검수 재현' })),
    resolveConflict: (conflictId: string, resolution: Parameters<RuleReviewService['resolveConflict']>[1], reason: string) =>
      run((s, revision) => s.resolveConflict(conflictId, resolution, { expectedRevision: revision, actor: ACTOR, reason }), '충돌을 처리했어요.'),
    resolveUnresolved: (unresolvedId: string, resolution: string, reason: string) =>
      run((s, revision) => s.resolveUnresolved(unresolvedId, resolution, { expectedRevision: revision, actor: ACTOR, reason }), '미해결 항목을 처리했어요.'),
    linkException: (exceptionRuleId: string, decision: Parameters<RuleReviewService['linkException']>[1], reason: string) =>
      run((s, revision) => s.linkException(exceptionRuleId, decision, { expectedRevision: revision, actor: ACTOR, reason }), '예외 관계를 정했어요.'),
    bulkApproveSafe: (ruleIds: string[], reason: string) => run((s, revision) => s.bulkApproveSafe(ruleIds, { expectedRevision: revision, actor: ACTOR, reason }), '근거 명확 항목을 한 번에 승인했어요.'),
    invalidateDocument: (hash: string, reason: string) =>
      run((s, revision) => s.invalidateDocument(hash, workspace.sourceStatus, { expectedRevision: revision, actor: ACTOR, reason }), '문서 변경을 반영했어요.'),
  }), [run, workspace.sourceStatus]);

  const summary = useMemo(() => buildReviewSummary(workspace), [workspace]);
  const gate = useMemo(() => service.current.gate(), [workspace]);
  const rules = useCallback((filter: RuleListFilter) => listReviewRules(workspace, filter), [workspace]);
  const detail = useCallback((ruleId: string) => getRuleDetail(workspace, ruleId), [workspace]);

  return { workspace, summary, gate, rules, detail, actions, lastError, lastDone, clearFeedback: useCallback(() => { setLastError(null); setLastDone(null); }, []) };
}
