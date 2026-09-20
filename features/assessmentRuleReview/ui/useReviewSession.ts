import { useCallback, useEffect, useRef, useState } from 'react';
import type { RuleReviewRepository } from '../repository/RuleReviewRepository.ts';
import type { ReviewGateway, ReviewLoadOutcome } from '../repository/ReviewGateway.ts';

export type ReviewSessionPhase =
  | { phase: 'LOADING' }
  | { phase: 'READY'; repository: RuleReviewRepository }
  | { phase: 'AUTH_REQUIRED' }
  | { phase: 'FORBIDDEN'; actor: string | null }
  | { phase: 'OFFLINE' }
  | { phase: 'FAILED'; code: string };

const fromOutcome = (outcome: ReviewLoadOutcome): ReviewSessionPhase =>
  outcome.status === 'READY' ? { phase: 'READY', repository: outcome.repository }
    : outcome.status === 'AUTH_REQUIRED' ? { phase: 'AUTH_REQUIRED' }
      : outcome.status === 'FORBIDDEN' ? { phase: 'FORBIDDEN', actor: outcome.actor }
        : outcome.status === 'OFFLINE' ? { phase: 'OFFLINE' }
          : { phase: 'FAILED', code: outcome.code };

/**
 * Resolves who is reviewing and what they may load, before any rule is rendered.
 *
 * The console shows nothing from a previous session while this is pending: stale rules
 * on screen during a reload would look like the announcement currently being reviewed.
 * Every non-ready outcome is a distinct, explicitly retryable state rather than a
 * generic error, because "log in again" and "you are not a reviewer" need different
 * actions from the person looking at the screen.
 */
export function useReviewSession(gateway: ReviewGateway) {
  const [state, setState] = useState<ReviewSessionPhase>({ phase: 'LOADING' });
  const [attempt, setAttempt] = useState(0);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    setState({ phase: 'LOADING' });
    void gateway.load()
      .then(outcome => { if (live.current) setState(fromOutcome(outcome)); })
      .catch(error => { if (live.current) setState({ phase: 'FAILED', code: error instanceof Error ? error.message : 'REVIEW_LOAD_FAILED' }); });
    return () => { live.current = false; };
  }, [gateway, attempt]);

  const retry = useCallback(() => setAttempt(value => value + 1), []);
  /** Used after a commit reports the session ended, so the reviewer sees the real state. */
  const invalidate = useCallback((next: ReviewSessionPhase) => setState(next), []);

  return { state, retry, invalidate };
}
