import type { RuleReviewWorkspace } from '../server/types.ts';
import type { RuleReviewRepository, RuleReviewRepositoryLike } from './RuleReviewRepository.ts';

export type ReviewActorRole = 'local' | 'reviewer' | 'admin';

export type ReviewLoadOutcome =
  | {
      status: 'READY';
      repository: RuleReviewRepositoryLike;
      workspace: RuleReviewWorkspace;
      actor: string | null;
      sessionKey: string;
      role: ReviewActorRole;
    }
  | { status: 'AUTH_REQUIRED' }
  | { status: 'FORBIDDEN'; actor: string | null }
  | { status: 'OFFLINE' }
  | { status: 'FAILED'; code: string };

export type ReviewCommitOutcome =
  | { status: 'SAVED'; workspace: RuleReviewWorkspace }
  | { status: 'STALE'; serverRevision: number; workspace: RuleReviewWorkspace | null }
  | { status: 'AUTH_EXPIRED' }
  | { status: 'OFFLINE' }
  | { status: 'REJECTED'; code: string }
  | { status: 'FAILED'; code: string };

/**
 * Transport boundary between the console and review persistence.
 * A successful commit always carries the workspace read back from persistence.
 */
export interface ReviewGateway {
  load(): Promise<ReviewLoadOutcome>;
  commit(mutate: (repository: RuleReviewRepositoryLike) => unknown | Promise<unknown>): Promise<ReviewCommitOutcome>;
  /** Supabase gateways notify this when the authenticated identity/session changes. */
  onSessionChange?(listener: () => void): () => void;
}

export type ReviewFaultPlan = {
  load?: Exclude<ReviewLoadOutcome['status'], 'READY'> | 'READY';
  loadActor?: string | null;
  loadCode?: string;
  commits?: Exclude<ReviewCommitOutcome['status'], 'REJECTED'>[];
  delayMs?: number;
};

/** Dev/test adapter exercising the confirmed-snapshot contract without remote I/O. */
export function createLocalReviewGateway(repository: RuleReviewRepository, plan: ReviewFaultPlan = {}): ReviewGateway {
  const commits = [...(plan.commits ?? [])];
  let load = plan.load;
  const pause = () => plan.delayMs ? new Promise(resolve => setTimeout(resolve, plan.delayMs)) : Promise.resolve();
  const snapshot = () => Promise.resolve(repository.snapshot());
  return {
    async load() {
      await pause();
      const forced = load;
      load = undefined;
      if (!forced || forced === 'READY') {
        return {
          status: 'READY', repository, workspace: await snapshot(), actor: 'reviewer@wanpane.local',
          sessionKey: 'local:reviewer@wanpane.local', role: 'local',
        };
      }
      if (forced === 'FORBIDDEN') return { status: 'FORBIDDEN', actor: plan.loadActor ?? null };
      if (forced === 'FAILED') return { status: 'FAILED', code: plan.loadCode ?? 'REVIEW_LOAD_FAILED' };
      return { status: forced };
    },
    async commit(mutate) {
      await pause();
      const forced = commits.shift();
      if (forced && forced !== 'SAVED') {
        if (forced === 'STALE') {
          const latest = await snapshot();
          return { status: 'STALE', serverRevision: latest.revision, workspace: latest };
        }
        if (forced === 'FAILED') return { status: 'FAILED', code: 'REVIEW_SAVE_FAILED' };
        return { status: forced };
      }
      try {
        await mutate(repository);
        return { status: 'SAVED', workspace: await snapshot() };
      } catch (error) {
        const code = error instanceof Error ? error.message : 'UNKNOWN_REVIEW_ERROR';
        if (code === 'STALE_REVIEW_REVISION') {
          const latest = await snapshot();
          return { status: 'STALE', serverRevision: latest.revision, workspace: latest };
        }
        return { status: 'REJECTED', code };
      }
    },
  };
}
