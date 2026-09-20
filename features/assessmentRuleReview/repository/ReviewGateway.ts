import type { RuleReviewRepository } from './RuleReviewRepository.ts';

/**
 * Transport boundary between the console and whatever holds the review state.
 *
 * The console never talks to a network client directly: it loads through a gateway
 * and commits through it, so authentication, connectivity and optimistic-concurrency
 * failures arrive as named outcomes instead of thrown transport errors. A server
 * implementation (Supabase + admin auth) and the in-memory dev adapter satisfy the
 * same contract, which is why the UI states below can be exercised without a network.
 */
export type ReviewLoadOutcome =
  | { status: 'READY'; repository: RuleReviewRepository }
  | { status: 'AUTH_REQUIRED' }
  | { status: 'FORBIDDEN'; actor: string | null }
  | { status: 'OFFLINE' }
  | { status: 'FAILED'; code: string };

/**
 * A commit either reached the server and was accepted, or it did not change anything.
 *
 * `REJECTED` is the domain refusing (a guard fired); the other failures never applied
 * the mutation at all. In both cases the console must leave the displayed decision
 * untouched — this is what keeps a failed save from looking like an approval.
 */
export type ReviewCommitOutcome =
  | { status: 'SAVED' }
  | { status: 'STALE'; serverRevision: number }
  | { status: 'AUTH_EXPIRED' }
  | { status: 'OFFLINE' }
  | { status: 'REJECTED'; code: string }
  | { status: 'FAILED'; code: string };

export interface ReviewGateway {
  load(): Promise<ReviewLoadOutcome>;
  /** Applies the mutation only if the transport and the domain both accept it. */
  commit(mutate: (repository: RuleReviewRepository) => void): Promise<ReviewCommitOutcome>;
}

/**
 * Transport outcomes a dev/test harness can force without a network.
 *
 * Only these outcomes are injectable: the domain still decides whether a mutation is
 * legal, so a forced `SAVED` cannot approve something the rules refuse. Both `load` and
 * `commits` are consumed as they are used and then fall back to the real path, which is
 * what makes an explicit retry after a forced failure meaningful.
 */
export type ReviewFaultPlan = {
  load?: Exclude<ReviewLoadOutcome['status'], 'READY'> | 'READY';
  loadActor?: string | null;
  loadCode?: string;
  commits?: Exclude<ReviewCommitOutcome['status'], 'REJECTED'>[];
  delayMs?: number;
};

/**
 * Dev/test adapter over an already-resolved repository.
 *
 * It round-trips through the async contract so the console exercises the same saving
 * and failure states it will use against a server, and an optional fault plan lets a
 * harness produce auth, connectivity and concurrency outcomes deterministically.
 */
export function createLocalReviewGateway(repository: RuleReviewRepository, plan: ReviewFaultPlan = {}): ReviewGateway {
  const commits = [...(plan.commits ?? [])];
  /* The forced load outcome applies to the first attempt only, so a retry can succeed. */
  let load = plan.load;
  const pause = () => plan.delayMs ? new Promise(resolve => setTimeout(resolve, plan.delayMs)) : Promise.resolve();
  return {
    async load() {
      await pause();
      const forced = load;
      load = undefined;
      if (!forced || forced === 'READY') return { status: 'READY', repository };
      if (forced === 'FORBIDDEN') return { status: 'FORBIDDEN', actor: plan.loadActor ?? null };
      if (forced === 'FAILED') return { status: 'FAILED', code: plan.loadCode ?? 'REVIEW_LOAD_FAILED' };
      return { status: forced };
    },
    async commit(mutate) {
      await pause();
      const forced = commits.shift();
      // A forced transport failure never reaches the domain, mirroring a lost request.
      if (forced && forced !== 'SAVED') {
        return forced === 'STALE' ? { status: 'STALE', serverRevision: repository.snapshot().revision }
          : forced === 'FAILED' ? { status: 'FAILED', code: 'REVIEW_SAVE_FAILED' }
            : { status: forced };
      }
      try { mutate(repository); return { status: 'SAVED' }; }
      catch (error) {
        const code = error instanceof Error ? error.message : 'UNKNOWN_REVIEW_ERROR';
        return code === 'STALE_REVIEW_REVISION'
          ? { status: 'STALE', serverRevision: repository.snapshot().revision }
          : { status: 'REJECTED', code };
      }
    },
  };
}
