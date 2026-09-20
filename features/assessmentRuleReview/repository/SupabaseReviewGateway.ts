import type { RuleReviewWorkspace } from '../server/types.ts';
import type { ReviewCommitOutcome, ReviewGateway, ReviewLoadOutcome } from './ReviewGateway.ts';
import { SupabaseRuleReviewRepository } from './SupabaseRuleReviewRepository.ts';
import { REVIEW_DOMAIN_REJECTION_CODES } from './reviewDbErrorCodes.ts';

type SessionSubscription = (listener: () => void) => () => void;

const codeOf = (error: unknown) => error instanceof Error ? error.message : 'RULE_REVIEW_UNKNOWN_ERROR';
const offline = (code: string) => code === 'RULE_REVIEW_OFFLINE'
  || /failed to fetch|network(?:error)?|load failed|fetch failed/i.test(code)
  || (typeof navigator !== 'undefined' && navigator.onLine === false);

function loadFailure(error: unknown): ReviewLoadOutcome {
  const code = codeOf(error);
  if (offline(code)) return { status: 'OFFLINE' };
  if (code === 'AUTH_REQUIRED') return { status: 'AUTH_REQUIRED' };
  if (code === 'FORBIDDEN') return { status: 'FORBIDDEN', actor: null };
  return { status: 'FAILED', code };
}

async function latestOrNull(repository: SupabaseRuleReviewRepository): Promise<RuleReviewWorkspace | null> {
  try { return await repository.snapshot(); } catch { return null; }
}

function commitFailure(error: unknown): Promise<ReviewCommitOutcome> | ReviewCommitOutcome {
  const code = codeOf(error);
  if (offline(code)) return { status: 'OFFLINE' };
  if (code === 'AUTH_REQUIRED') return { status: 'AUTH_EXPIRED' };
  if (code === 'FORBIDDEN') return { status: 'REJECTED', code };
  if (REVIEW_DOMAIN_REJECTION_CODES.has(code)) return { status: 'REJECTED', code };
  return { status: 'FAILED', code };
}

const mutationWorkspace = (value: unknown): RuleReviewWorkspace | null => {
  if (!value || typeof value !== 'object') return null;
  const workspace = value as Partial<RuleReviewWorkspace>;
  return typeof workspace.ruleVersionId === 'string' && typeof workspace.revision === 'number' && Array.isArray(workspace.rules)
    ? value as RuleReviewWorkspace : null;
};

/** Maps the staging repository to transport outcomes understood by the admin UX. */
export function createSupabaseReviewGateway(
  repository: SupabaseRuleReviewRepository,
  subscribeSessionChange?: SessionSubscription,
): ReviewGateway {
  return {
    async load() {
      try {
        const access = await repository.access();
        if (!access.authenticated) return { status: 'AUTH_REQUIRED' };
        if (!access.role) return { status: 'FORBIDDEN', actor: access.userId };
        return {
          status: 'READY',
          repository,
          workspace: await repository.snapshot(),
          actor: access.userId,
          sessionKey: `supabase:${access.userId}:${repository.ruleSetId}`,
          role: access.role,
        };
      } catch (error) { return loadFailure(error); }
    },
    async commit(mutate) {
      try {
        const access = await repository.access();
        if (!access.authenticated) return { status: 'AUTH_EXPIRED' };
        if (!access.role) return { status: 'REJECTED', code: 'FORBIDDEN' };
        const returned = await mutate(repository);
        const workspace = mutationWorkspace(returned);
        if (!workspace) return { status: 'FAILED', code: 'RULE_REVIEW_INVALID_MUTATION_RESULT' };
        return { status: 'SAVED', workspace };
      } catch (error) {
        const code = codeOf(error);
        if (code === 'STALE_REVIEW_REVISION') {
          const workspace = await latestOrNull(repository);
          return { status: 'STALE', serverRevision: workspace?.revision ?? -1, workspace };
        }
        return commitFailure(error);
      }
    },
    onSessionChange: subscribeSessionChange,
  };
}
