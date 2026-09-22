import { getSupabaseClient } from '../../auth/supabaseClient.ts';
import { createBrowserRuleReviewRepository } from './RuleReviewRepository.ts';
import { createLocalReviewGateway, type ReviewFaultPlan, type ReviewGateway } from './ReviewGateway.ts';
import { SupabaseRuleReviewRepository } from './SupabaseRuleReviewRepository.ts';
import { createSupabaseReviewGateway } from './SupabaseReviewGateway.ts';
import { createReviewAuthIdentityObserver } from './reviewAuthIdentity.ts';
import { allowsLocalReviewSeed, readPublicRuleReviewTarget } from './stagingTarget.ts';

export type ReviewPersistence = 'local' | 'staging' | 'production';
export type ReviewGatewayResolution =
  | { status: 'READY'; gateway: ReviewGateway; persistence: ReviewPersistence }
  | { status: 'FAILED'; code: string };

const RULE_SET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Composition root. UI code never imports a Supabase client or repository directly.
 * The rule set comes from the route (`?ruleSetId=`) or, for staging, the build default.
 */
export function createConfiguredReviewGateway(plan: ReviewFaultPlan = {}, requestedRuleSetId?: string | null): ReviewGatewayResolution {
  const environment = process.env.EXPO_PUBLIC_WANPANE_ENV;
  // Static browser tests use a production bundle, so NODE_ENV cannot identify dev data.
  // An explicit injected seed is accepted only when the public target is neither staging nor production.
  const demoAllowed = allowsLocalReviewSeed(environment);
  const demo = demoAllowed ? createBrowserRuleReviewRepository() : null;
  if (demo) return { status: 'READY', gateway: createLocalReviewGateway(demo, plan), persistence: 'local' };

  try {
    const target = readPublicRuleReviewTarget();
    const client = getSupabaseClient();
    if (!client) throw new Error('REVIEW_CONNECTION_REQUIRED');
    const ruleSetId = requestedRuleSetId?.trim() || process.env.EXPO_PUBLIC_RULE_REVIEW_RULE_SET_ID?.trim();
    if (!ruleSetId || !RULE_SET_ID.test(ruleSetId)) throw new Error('RULE_SET_ID_REQUIRED');
    const repository = new SupabaseRuleReviewRepository(client, ruleSetId);
    const subscribe = (listener: () => void) => {
      const observer = createReviewAuthIdentityObserver(listener);
      const { data } = client.auth.onAuthStateChange((event, session) => observer(event, session));
      return () => data.subscription.unsubscribe();
    };
    return { status: 'READY', gateway: createSupabaseReviewGateway(repository, subscribe), persistence: target.environment };
  } catch (error) {
    return { status: 'FAILED', code: error instanceof Error ? error.message : 'REVIEW_CONNECTION_REQUIRED' };
  }
}
