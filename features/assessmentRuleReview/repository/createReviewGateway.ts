import { getSupabaseClient } from '../../auth/supabaseClient.ts';
import { createBrowserRuleReviewRepository } from './RuleReviewRepository.ts';
import { createLocalReviewGateway, type ReviewFaultPlan, type ReviewGateway } from './ReviewGateway.ts';
import { SupabaseRuleReviewRepository } from './SupabaseRuleReviewRepository.ts';
import { createSupabaseReviewGateway } from './SupabaseReviewGateway.ts';
import { createReviewAuthIdentityObserver } from './reviewAuthIdentity.ts';
import { allowsLocalReviewSeed, readPublicRuleReviewTarget } from './stagingTarget.ts';

export type ReviewGatewayResolution =
  | { status: 'READY'; gateway: ReviewGateway; persistence: 'local' | 'staging' }
  | { status: 'FAILED'; code: string };

/** Composition root. UI code never imports a Supabase client or repository directly. */
export function createConfiguredReviewGateway(plan: ReviewFaultPlan = {}): ReviewGatewayResolution {
  const environment = process.env.EXPO_PUBLIC_WANPANE_ENV;
  // Static browser tests use a production bundle, so NODE_ENV cannot identify dev data.
  // An explicit injected seed is accepted only when the public target is neither staging nor production.
  const demoAllowed = allowsLocalReviewSeed(environment);
  const demo = demoAllowed ? createBrowserRuleReviewRepository() : null;
  if (demo) return { status: 'READY', gateway: createLocalReviewGateway(demo, plan), persistence: 'local' };

  try {
    readPublicRuleReviewTarget();
    const client = getSupabaseClient();
    const ruleSetId = process.env.EXPO_PUBLIC_RULE_REVIEW_RULE_SET_ID?.trim();
    if (!client || !ruleSetId) throw new Error('STAGING_CONNECTION_REQUIRED');
    const repository = new SupabaseRuleReviewRepository(client, ruleSetId);
    const subscribe = (listener: () => void) => {
      const observer = createReviewAuthIdentityObserver(listener);
      const { data } = client.auth.onAuthStateChange((event, session) => observer(event, session));
      return () => data.subscription.unsubscribe();
    };
    return { status: 'READY', gateway: createSupabaseReviewGateway(repository, subscribe), persistence: 'staging' };
  } catch (error) {
    return { status: 'FAILED', code: error instanceof Error ? error.message : 'STAGING_CONNECTION_REQUIRED' };
  }
}
