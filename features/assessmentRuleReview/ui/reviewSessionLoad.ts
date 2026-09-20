import type { ReviewGateway, ReviewLoadOutcome } from '../repository/ReviewGateway.ts';
import type { RuleReviewRepositoryLike } from '../repository/RuleReviewRepository.ts';
import type { RuleReviewWorkspace } from '../server/types.ts';

export type ReviewSessionPhase =
  | { phase: 'LOADING' }
  | {
      phase: 'READY';
      repository: RuleReviewRepositoryLike;
      workspace: RuleReviewWorkspace;
      actor: string | null;
      sessionKey: string;
      role: 'local' | 'reviewer' | 'admin';
    }
  | { phase: 'AUTH_REQUIRED' }
  | { phase: 'FORBIDDEN'; actor: string | null }
  | { phase: 'OFFLINE' }
  | { phase: 'FAILED'; code: string };

export const reviewPhaseFromOutcome = (outcome: ReviewLoadOutcome): ReviewSessionPhase =>
  outcome.status === 'READY' ? {
    phase: 'READY', repository: outcome.repository, workspace: outcome.workspace,
    actor: outcome.actor, sessionKey: outcome.sessionKey, role: outcome.role,
  }
    : outcome.status === 'AUTH_REQUIRED' ? { phase: 'AUTH_REQUIRED' }
      : outcome.status === 'FORBIDDEN' ? { phase: 'FORBIDDEN', actor: outcome.actor }
        : outcome.status === 'OFFLINE' ? { phase: 'OFFLINE' }
          : { phase: 'FAILED', code: outcome.code };

/** Drops every load result except the most recently started generation. */
export class ReviewSessionLoadCoordinator {
  #generation = 0;

  invalidate(): void { this.#generation += 1; }

  async load(gateway: ReviewGateway, apply: (phase: ReviewSessionPhase) => void): Promise<void> {
    const generation = ++this.#generation;
    try {
      const outcome = await gateway.load();
      if (generation === this.#generation) apply(reviewPhaseFromOutcome(outcome));
    } catch (error) {
      if (generation === this.#generation) {
        apply({ phase: 'FAILED', code: error instanceof Error ? error.message : 'REVIEW_LOAD_FAILED' });
      }
    }
  }
}
