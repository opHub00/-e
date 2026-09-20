import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildReviewSummary, getRuleDetail, listReviewRules, type RuleListFilter } from '../server/dto.ts';
import { canActivateRuleVersion } from '../server/service.ts';
import type { ReviewEvidence, ReviewableRuleSnapshot, RuleReviewWorkspace } from '../server/types.ts';
import type { RuleReviewRepository, RuleReviewRepositoryLike } from '../repository/RuleReviewRepository.ts';

export type ReviewActionResult = { ok: true } | { ok: false; code: string };
export type ReviewFeedbackTone = 'success' | 'warning';

/** Shared UI orchestration for synchronous local and asynchronous staging repositories. */
export function useRuleReviewWorkspace(repository: RuleReviewRepositoryLike) {
  const [workspace, setWorkspace] = useState<RuleReviewWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastDone, setLastDone] = useState<string | null>(null);
  const [lastDoneTone, setLastDoneTone] = useState<ReviewFeedbackTone>('success');

  const reload = useCallback(async () => {
    setLoading(true);
    try { setWorkspace(await repository.snapshot()); setLastError(null); }
    catch (error) { setLastError(error instanceof Error ? error.message : 'RULE_REVIEW_LOAD_FAILED'); }
    finally { setLoading(false); }
  }, [repository]);
  useEffect(() => { void reload(); }, [reload]);

  const run = useCallback(async (
    operation: (instance: RuleReviewRepositoryLike, expectedRevision: number) => unknown | Promise<unknown>, done?: string,
    tone: ReviewFeedbackTone = 'success',
  ): Promise<ReviewActionResult> => {
    if (!workspace) return { ok: false, code: 'RULE_REVIEW_NOT_LOADED' };
    setSaving(true);
    try {
      await operation(repository, workspace.revision);
      setWorkspace(await repository.snapshot());
      setLastError(null); setLastDone(done ?? null); setLastDoneTone(tone);
      return { ok: true };
    } catch (error) {
      const code = error instanceof Error ? error.message : 'UNKNOWN_REVIEW_ERROR';
      try { setWorkspace(await repository.snapshot()); } catch { /* retain last safe snapshot */ }
      setLastError(code); setLastDone(null); setLastDoneTone('success');
      return { ok: false, code };
    } finally { setSaving(false); }
  }, [repository, workspace]);

  const actions = useMemo(() => ({
    startReview: (reason: string) => run((r, v) => r.startReview({ expectedRevision: v, reason }), '검수를 시작했어요.'),
    approve: (id: string, reason: string) => run((r, v) => r.approve(id, { expectedRevision: v, reason }), '승인했어요.'),
    approveWithEdit: (id: string, edited: ReviewableRuleSnapshot, resolved: Parameters<RuleReviewRepository['approveWithEdit']>[2], reason: string) => run((r, v) => r.approveWithEdit(id, edited, resolved, { expectedRevision: v, reason }), '수정한 내용으로 승인했어요.'),
    hold: (id: string, reason: string) => run((r, v) => r.hold(id, { expectedRevision: v, reason }), '보류로 바꿨어요.'),
    reject: (id: string, reason: string) => run((r, v) => r.reject(id, { expectedRevision: v, reason }), '제외했어요.'),
    reviewEvidence: (id: string, evidenceId: string, status: Parameters<RuleReviewRepository['reviewEvidence']>[2], reason: string, replacement?: ReviewEvidence) => run((r, v) => r.reviewEvidence(id, evidenceId, status, { expectedRevision: v, reason }, replacement), status === 'REPLACED' ? '근거를 교체했어요.' : '근거 상태를 바꿨어요.'),
    simulateStaleRevision: (id: string) => run((r, v) => r.hold(id, { expectedRevision: v - 1, reason: '동시 검수 재현' })),
    resolveConflict: (id: string, resolution: Parameters<RuleReviewRepository['resolveConflict']>[1], reason: string) => run((r, v) => r.resolveConflict(id, resolution, { expectedRevision: v, reason }), '충돌을 처리했어요.'),
    resolveUnresolved: (id: string, resolution: string, reason: string) => run((r, v) => r.resolveUnresolved(id, resolution, { expectedRevision: v, reason }), '미해결 항목을 처리했어요.'),
    linkException: (id: string, decision: Parameters<RuleReviewRepository['linkException']>[1], reason: string) => run((r, v) => r.linkException(id, decision, { expectedRevision: v, reason }), '예외 관계를 정했어요.'),
    bulkApproveSafe: (ids: string[], reason: string) => run((r, v) => r.bulkApproveSafe(ids, { expectedRevision: v, reason }), '근거 명확 항목을 한 번에 승인했어요.'),
    invalidateDocument: (hash: string, reason: string) => run((r, v) => r.invalidateDocument(hash, { expectedRevision: v, reason }), '공고문 변경을 감지했습니다. 기존 검수 결과를 다시 확인해야 합니다.', 'warning'),
  }), [run]);

  const summary = useMemo(() => workspace ? buildReviewSummary(workspace) : null, [workspace]);
  const gate = useMemo(() => workspace ? canActivateRuleVersion(workspace) : null, [workspace]);
  const rules = useCallback((filter: RuleListFilter) => workspace ? listReviewRules(workspace, filter) : [], [workspace]);
  const detail = useCallback((id: string) => workspace ? getRuleDetail(workspace, id) : null, [workspace]);
  const clearFeedback = useCallback(() => { setLastError(null); setLastDone(null); setLastDoneTone('success'); }, []);
  return { workspace, summary, gate, rules, detail, actions, loading, saving, reload, lastError, lastDone, lastDoneTone, clearFeedback };
}
