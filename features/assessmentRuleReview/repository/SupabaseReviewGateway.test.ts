import assert from 'node:assert/strict';
import test from 'node:test';
import { SAMDO_REVIEW_SEED } from '../fixtures/samdoReviewSeed.generated.ts';
import { InMemoryRuleReviewRepository } from './RuleReviewRepository.ts';
import { createSupabaseReviewGateway } from './SupabaseReviewGateway.ts';
import type { SupabaseRuleReviewRepository } from './SupabaseRuleReviewRepository.ts';
import { allowsLocalReviewSeed } from './stagingTarget.ts';

const seed = new InMemoryRuleReviewRepository(SAMDO_REVIEW_SEED, 'fixture').snapshot();

function repository(options: {
  authenticated?: boolean;
  role?: 'reviewer' | 'admin' | null;
  mutationError?: string;
  snapshotError?: string;
} = {}) {
  let workspace = structuredClone(seed);
  const value = {
    ruleSetId: workspace.ruleVersionId,
    access: async () => ({
      authenticated: options.authenticated ?? true,
      role: options.role === undefined ? 'reviewer' : options.role,
      userId: options.authenticated === false ? null : 'user-a',
    }),
    snapshot: async () => {
      if (options.snapshotError) throw new Error(options.snapshotError);
      return structuredClone(workspace);
    },
    hold: async (_id: string, mutation: { expectedRevision: number }) => {
      if (options.mutationError) throw new Error(options.mutationError);
      workspace = { ...workspace, revision: mutation.expectedRevision + 1 };
    },
  };
  return value as unknown as SupabaseRuleReviewRepository;
}

test('loads authenticated reviewer workspace with an actor-scoped session key', async () => {
  const outcome = await createSupabaseReviewGateway(repository()).load();
  assert.equal(outcome.status, 'READY');
  if (outcome.status !== 'READY') return;
  assert.equal(outcome.actor, 'user-a');
  assert.match(outcome.sessionKey, /^supabase:user-a:/);
  assert.equal(outcome.workspace.ruleVersionId, seed.ruleVersionId);
});

test('distinguishes missing auth and reviewer authorization', async () => {
  assert.equal((await createSupabaseReviewGateway(repository({ authenticated: false })).load()).status, 'AUTH_REQUIRED');
  assert.equal((await createSupabaseReviewGateway(repository({ role: null })).load()).status, 'FORBIDDEN');
});

test('returns only the server-confirmed workspace after a mutation', async () => {
  const repo = repository();
  const gateway = createSupabaseReviewGateway(repo);
  const result = await gateway.commit(instance => instance.hold('rule-1', { expectedRevision: seed.revision, reason: 'review' }));
  assert.equal(result.status, 'SAVED');
  if (result.status === 'SAVED') assert.equal(result.workspace.revision, seed.revision + 1);
});

test('maps stale, expired auth, network, domain, and unexpected failures honestly', async () => {
  assert.equal((await createSupabaseReviewGateway(repository({ mutationError: 'STALE_REVIEW_REVISION' }))
    .commit(instance => instance.hold('rule-1', { expectedRevision: 1, reason: 'x' }))).status, 'STALE');
  assert.equal((await createSupabaseReviewGateway(repository({ authenticated: false }))
    .commit(instance => instance.hold('rule-1', { expectedRevision: 1, reason: 'x' }))).status, 'AUTH_EXPIRED');
  assert.equal((await createSupabaseReviewGateway(repository({ mutationError: 'RULE_REVIEW_OFFLINE' }))
    .commit(instance => instance.hold('rule-1', { expectedRevision: 1, reason: 'x' }))).status, 'OFFLINE');
  const rejected = await createSupabaseReviewGateway(repository({ mutationError: 'SCOPE_MISMATCH' }))
    .commit(instance => instance.hold('rule-1', { expectedRevision: 1, reason: 'x' }));
  assert.deepEqual(rejected, { status: 'REJECTED', code: 'SCOPE_MISMATCH' });
  const failed = await createSupabaseReviewGateway(repository({ mutationError: 'RULE_REVIEW_DB_ERROR:boom' }))
    .commit(instance => instance.hold('rule-1', { expectedRevision: 1, reason: 'x' }));
  assert.deepEqual(failed, { status: 'FAILED', code: 'RULE_REVIEW_DB_ERROR:boom' });
});

test('forwards session changes so the route can discard another actor workspace', () => {
  const subscription: { current: (() => void) | null } = { current: null };
  let changes = 0;
  const gateway = createSupabaseReviewGateway(repository(), listener => { subscription.current = listener; return () => { subscription.current = null; }; });
  const unsubscribe = gateway.onSessionChange?.(() => { changes += 1; });
  assert.ok(subscription.current);
  subscription.current();
  assert.equal(changes, 1);
  unsubscribe?.();
  assert.equal(subscription.current, null);
});

test('staging and production modes cannot be bypassed by a browser dev seed', () => {
  assert.equal(allowsLocalReviewSeed('staging'), false);
  assert.equal(allowsLocalReviewSeed(' production '), false);
  assert.equal(allowsLocalReviewSeed('development'), true);
  assert.equal(allowsLocalReviewSeed(undefined), true);
});
