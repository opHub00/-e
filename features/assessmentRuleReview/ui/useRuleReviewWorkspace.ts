import { useCallback, useMemo, useState } from 'react';
import type { RuleListFilter } from '../server/dto.ts';
import type { ReviewEvidence, ReviewableRuleSnapshot } from '../server/types.ts';
import type { RuleReviewRepository } from '../repository/RuleReviewRepository.ts';

export type ReviewActionResult = { ok: true } | { ok: false; code: string };
export type ReviewFeedbackTone = 'success' | 'warning';

/** UI orchestration depends only on the repository contract. */
export function useRuleReviewWorkspace(repository: RuleReviewRepository) {
  const [workspace, setWorkspace] = useState(() => repository.snapshot());
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastDone, setLastDone] = useState<string | null>(null);
  const [lastDoneTone, setLastDoneTone] = useState<ReviewFeedbackTone>('success');

  /** The displayed revision is sent back so a newer repository state fails closed. */
  const run = useCallback((
    operation: (instance: RuleReviewRepository, expectedRevision: number) => void,
    done?: string,
    tone: ReviewFeedbackTone = 'success',
  ): ReviewActionResult => {
    try {
      operation(repository, workspace.revision);
      setWorkspace(repository.snapshot());
      setLastError(null);
      setLastDone(done ?? null);
      setLastDoneTone(tone);
      return { ok: true };
    } catch (error) {
      const code = error instanceof Error ? error.message : 'UNKNOWN_REVIEW_ERROR';
      setWorkspace(repository.snapshot());
      setLastError(code);
      setLastDone(null);
      setLastDoneTone('success');
      return { ok: false, code };
    }
  }, [repository, workspace.revision]);

  const actions = useMemo(() => ({
    startReview: (reason: string) => run((repo, expectedRevision) => repo.startReview({ expectedRevision, reason }), '검수를 시작했어요.'),
    approve: (ruleId: string, reason: string) => run((repo, expectedRevision) => repo.approve(ruleId, { expectedRevision, reason }), '승인했어요.'),
    approveWithEdit: (ruleId: string, edited: ReviewableRuleSnapshot, resolved: Parameters<RuleReviewRepository['approveWithEdit']>[2], reason: string) =>
      run((repo, expectedRevision) => repo.approveWithEdit(ruleId, edited, resolved, { expectedRevision, reason }), '수정한 내용으로 승인했어요.'),
    hold: (ruleId: string, reason: string) => run((repo, expectedRevision) => repo.hold(ruleId, { expectedRevision, reason }), '보류로 바꿨어요.'),
    reject: (ruleId: string, reason: string) => run((repo, expectedRevision) => repo.reject(ruleId, { expectedRevision, reason }), '제외했어요.'),
    reviewEvidence: (ruleId: string, evidenceId: string, status: Parameters<RuleReviewRepository['reviewEvidence']>[2], reason: string, replacement?: ReviewEvidence) =>
      run((repo, expectedRevision) => repo.reviewEvidence(ruleId, evidenceId, status, { expectedRevision, reason }, replacement),
        status === 'REPLACED' ? '근거를 교체했어요.' : status === 'VALID' ? '근거를 유효로 표시했어요.' : status === 'INVALID' ? '근거를 무효로 표시했어요.' : '근거 상태를 바꿨어요.'),
    /** Dev-only UX path: the real repository guard rejects the stale revision. */
    simulateStaleRevision: (ruleId: string) =>
      run((repo, expectedRevision) => repo.hold(ruleId, { expectedRevision: expectedRevision - 1, reason: '동시 검수 재현' })),
    resolveConflict: (conflictId: string, resolution: Parameters<RuleReviewRepository['resolveConflict']>[1], reason: string) =>
      run((repo, expectedRevision) => repo.resolveConflict(conflictId, resolution, { expectedRevision, reason }), '충돌을 처리했어요.'),
    resolveUnresolved: (unresolvedId: string, resolution: string, reason: string) =>
      run((repo, expectedRevision) => repo.resolveUnresolved(unresolvedId, resolution, { expectedRevision, reason }), '미해결 항목을 처리했어요.'),
    linkException: (exceptionRuleId: string, decision: Parameters<RuleReviewRepository['linkException']>[1], reason: string) =>
      run((repo, expectedRevision) => repo.linkException(exceptionRuleId, decision, { expectedRevision, reason }), '예외 관계를 정했어요.'),
    bulkApproveSafe: (ruleIds: string[], reason: string) =>
      run((repo, expectedRevision) => repo.bulkApproveSafe(ruleIds, { expectedRevision, reason }), '근거 명확 항목을 한 번에 승인했어요.'),
    invalidateDocument: (hash: string, reason: string) =>
      run(
        (repo, expectedRevision) => repo.invalidateDocument(hash, { expectedRevision, reason }),
        '공고문 변경을 감지했습니다. 기존 검수 결과를 다시 확인해야 합니다.',
        'warning',
      ),
  }), [run]);

  const summary = useMemo(() => repository.summary(), [repository, workspace]);
  const gate = useMemo(() => repository.gate(), [repository, workspace]);
  const rules = useCallback((filter: RuleListFilter) => repository.list(filter), [repository, workspace]);
  const detail = useCallback((ruleId: string) => repository.detail(ruleId), [repository, workspace]);
  const clearFeedback = useCallback(() => { setLastError(null); setLastDone(null); setLastDoneTone('success'); }, []);

  return { workspace, summary, gate, rules, detail, actions, lastError, lastDone, lastDoneTone, clearFeedback };
}
