import { useCallback, useMemo, useState } from 'react';
import { buildReviewSummary, getRuleDetail, listReviewRules, type RuleListFilter } from '../server/dto.ts';
import { canActivateRuleVersion } from '../server/service.ts';
import type { ReviewEvidence, ReviewableRuleSnapshot } from '../server/types.ts';
import type { RuleReviewRepository } from '../repository/RuleReviewRepository.ts';
import type { ReviewCommitOutcome, ReviewGateway } from '../repository/ReviewGateway.ts';

export type ReviewActionResult = { ok: true } | { ok: false; outcome: ReviewCommitOutcome };
export type ReviewFeedbackTone = 'success' | 'warning';

/** What the console is doing with the server right now. */
export type SaveState =
  | { kind: 'IDLE' }
  | { kind: 'SAVING'; label: string }
  | { kind: 'SAVED'; label: string; tone: ReviewFeedbackTone }
  | { kind: 'FAILED'; outcome: ReviewCommitOutcome; label: string };

const FAILURE_TEXT: Partial<Record<ReviewCommitOutcome['status'], string>> = {
  STALE: '다른 검수자가 먼저 저장했습니다. 최신 서버 내용을 다시 불러왔어요. 입력하던 내용은 그대로 두었으니 비교한 뒤 다시 저장해 주세요.',
  AUTH_EXPIRED: '로그인이 만료됐습니다. 저장하지 않았어요. 다시 로그인하면 작성 중이던 수정 내용을 이어서 쓸 수 있어요.',
  OFFLINE: '네트워크에 연결되어 있지 않아 저장하지 않았습니다. 검수 결정은 자동으로 보내지 않아요. 연결을 확인한 뒤 다시 시도해 주세요.',
};

/**
 * Orchestrates review decisions against a gateway.
 *
 * Nothing on screen moves to a decided state before the server accepts it. The
 * workspace snapshot is re-read only after a `SAVED` outcome, so a refused or lost
 * save can never leave a rule looking approved. A stale outcome refreshes to the
 * server's state while the caller keeps its own draft.
 */
export function useRuleReviewWorkspace(repository: RuleReviewRepository, gateway: ReviewGateway) {
  const [workspace, setWorkspace] = useState(() => repository.snapshot());
  const [save, setSave] = useState<SaveState>({ kind: 'IDLE' });
  /** Adopts whatever the repository holds after the transport accepted a commit. */
  const adopt = useCallback(() => setWorkspace(repository.snapshot()), [repository]);

  const run = useCallback(async (
    operation: (instance: RuleReviewRepository, expectedRevision: number) => void,
    label: string,
    tone: ReviewFeedbackTone = 'success',
  ): Promise<ReviewActionResult> => {
    setSave({ kind: 'SAVING', label });
    const expectedRevision = repository.snapshot().revision;
    const outcome = await gateway.commit(instance => operation(instance, expectedRevision));
    if (outcome.status === 'SAVED') {
      adopt();
      setSave({ kind: 'SAVED', label, tone });
      return { ok: true };
    }
    // A stale commit still refreshes the view to whatever the server now holds.
    if (outcome.status === 'STALE') adopt();
    setSave({
      kind: 'FAILED', outcome,
      label: FAILURE_TEXT[outcome.status] ?? `저장하지 않았어요: ${'code' in outcome ? outcome.code : outcome.status}`,
    });
    return { ok: false, outcome };
  }, [adopt, gateway, repository]);

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
    /** Dev-only UX path: the repository guard rejects the stale revision. */
    simulateStaleRevision: (ruleId: string) =>
      run((repo, expectedRevision) => repo.hold(ruleId, { expectedRevision: expectedRevision - 1, reason: '동시 검수 재현' }), '보류로 바꿨어요.'),
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

  /*
    Every view is derived from the snapshot this hook adopted after the last accepted
    commit — not from a second read of the repository. One source of truth means the
    screen can never show a summary that disagrees with the state it is rendering, and
    what a reviewer sees is exactly what the server last confirmed.
  */
  const summary = useMemo(() => buildReviewSummary(workspace), [workspace]);
  const gate = useMemo(() => canActivateRuleVersion(workspace), [workspace]);
  const rules = useCallback((filter: RuleListFilter) => listReviewRules(workspace, filter), [workspace]);
  const detail = useCallback((ruleId: string) => getRuleDetail(workspace, ruleId), [workspace]);
  const clearFeedback = useCallback(() => setSave({ kind: 'IDLE' }), []);
  /** Re-reads the repository after an out-of-band refresh, e.g. retry after a failed save. */
  const refresh = useCallback(() => { adopt(); setSave({ kind: 'IDLE' }); }, [adopt]);

  return { workspace, summary, gate, rules, detail, actions, save, clearFeedback, refresh };
}
