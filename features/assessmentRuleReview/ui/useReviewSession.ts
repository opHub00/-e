import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReviewGateway } from '../repository/ReviewGateway.ts';
import { ReviewSessionLoadCoordinator, type ReviewSessionPhase } from './reviewSessionLoad.ts';

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
  const coordinator = useRef(new ReviewSessionLoadCoordinator());

  useEffect(() => {
    setState({ phase: 'LOADING' });
    void coordinator.current.load(gateway, setState);
    return () => coordinator.current.invalidate();
  }, [gateway, attempt]);

  useEffect(() => gateway.onSessionChange?.(() => {
    // Remove the prior actor's workspace before resolving the new session.
    coordinator.current.invalidate();
    setState({ phase: 'LOADING' });
    setAttempt(value => value + 1);
  }), [gateway]);

  const retry = useCallback(() => {
    coordinator.current.invalidate();
    setAttempt(value => value + 1);
  }, []);
  /** Used after a commit reports the session ended, so the reviewer sees the real state. */
  const invalidate = useCallback((next: ReviewSessionPhase) => setState(next), []);

  return { state, retry, invalidate };
}
