import { useCallback, useMemo, useState } from 'react';
import type { RuleListFilter } from '../server/dto.ts';
import type { ReviewableRuleSnapshot } from '../server/types.ts';
import type { RuleReviewRepository } from '../repository/RuleReviewRepository.ts';

export type ReviewActionResult = { ok: true } | { ok: false; code: string };

/** UI orchestration depends only on the repository contract. */
export function useRuleReviewWorkspace(repository: RuleReviewRepository) {
  const [workspace, setWorkspace] = useState(() => repository.snapshot());
  const [lastError, setLastError] = useState<string | null>(null);
  const run = useCallback((operation: (instance: RuleReviewRepository) => void): ReviewActionResult => {
    try {
      operation(repository);
      setWorkspace(repository.snapshot());
      setLastError(null);
      return { ok: true };
    } catch (error) {
      const code = error instanceof Error ? error.message : 'UNKNOWN_REVIEW_ERROR';
      setWorkspace(repository.snapshot());
      setLastError(code);
      return { ok: false, code };
    }
  }, [repository]);

  const actions = useMemo(() => ({
    startReview: (reason: string) => run(repo => repo.startReview(reason)),
    approve: (ruleId: string, reason: string) => run(repo => repo.approve(ruleId, reason)),
    approveWithEdit: (ruleId: string, edited: ReviewableRuleSnapshot, resolved: Parameters<RuleReviewRepository['approveWithEdit']>[2], reason: string) =>
      run(repo => repo.approveWithEdit(ruleId, edited, resolved, reason)),
    hold: (ruleId: string, reason: string) => run(repo => repo.hold(ruleId, reason)),
    reject: (ruleId: string, reason: string) => run(repo => repo.reject(ruleId, reason)),
    reviewEvidence: (ruleId: string, evidenceId: string, status: Parameters<RuleReviewRepository['reviewEvidence']>[2], reason: string) =>
      run(repo => repo.reviewEvidence(ruleId, evidenceId, status, reason)),
    resolveConflict: (conflictId: string, resolution: Parameters<RuleReviewRepository['resolveConflict']>[1], reason: string) =>
      run(repo => repo.resolveConflict(conflictId, resolution, reason)),
    resolveUnresolved: (unresolvedId: string, resolution: string, reason: string) => run(repo => repo.resolveUnresolved(unresolvedId, resolution, reason)),
    linkException: (exceptionRuleId: string, decision: Parameters<RuleReviewRepository['linkException']>[1], reason: string) =>
      run(repo => repo.linkException(exceptionRuleId, decision, reason)),
    bulkApproveSafe: (ruleIds: string[], reason: string) => run(repo => repo.bulkApproveSafe(ruleIds, reason)),
    invalidateDocument: (hash: string, reason: string) => run(repo => repo.invalidateDocument(hash, reason)),
  }), [run]);

  const summary = useMemo(() => repository.summary(), [repository, workspace]);
  const gate = useMemo(() => repository.gate(), [repository, workspace]);
  const rules = useCallback((filter: RuleListFilter) => repository.list(filter), [repository, workspace]);
  const detail = useCallback((ruleId: string) => repository.detail(ruleId), [repository, workspace]);
  return { workspace, summary, gate, rules, detail, actions, lastError };
}
