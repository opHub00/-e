import assert from 'node:assert/strict';
import test from 'node:test';
import { SAMDO_REVIEW_SEED } from '../fixtures/samdoReviewSeed.generated.ts';
import { InMemoryRuleReviewRepository } from './RuleReviewRepository.ts';
import { createSupabaseReviewGateway } from './SupabaseReviewGateway.ts';
import type { SupabaseRuleReviewRepository } from './SupabaseRuleReviewRepository.ts';
import { REVIEW_DOMAIN_REJECTION_CODES } from './reviewDbErrorCodes.ts';
import { allowsLocalReviewSeed } from './stagingTarget.ts';

const seed = new InMemoryRuleReviewRepository(SAMDO_REVIEW_SEED, 'fixture').snapshot();

function repository(options: {
  authenticated?: boolean;
  role?: 'reviewer' | 'admin' | null;
  accessError?: string;
  mutationError?: string;
  snapshotError?: string;
} = {}) {
  let workspace = structuredClone(seed);
  const calls = { access: 0, snapshot: 0, mutation: 0 };
  const value = {
    ruleSetId: workspace.ruleVersionId,
    access: async () => {
      calls.access += 1;
      if (options.accessError) throw new Error(options.accessError);
      return {
        authenticated: options.authenticated ?? true,
        role: options.role === undefined ? 'reviewer' : options.role,
        userId: options.authenticated === false ? null : 'user-a',
      };
    },
    snapshot: async () => {
      calls.snapshot += 1;
      if (options.snapshotError) throw new Error(options.snapshotError);
      return structuredClone(workspace);
    },
    hold: async (_id: string, mutation: { expectedRevision: number }) => {
      calls.mutation += 1;
      if (options.mutationError) throw new Error(options.mutationError);
      workspace = { ...workspace, revision: mutation.expectedRevision + 1 };
      return structuredClone(workspace);
    },
  };
  return Object.assign(value, { __calls: calls }) as unknown as SupabaseRuleReviewRepository & { __calls: typeof calls };
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
  assert.deepEqual(repo.__calls, { access: 1, snapshot: 0, mutation: 1 });
});

test('maps exact SQL stale to latest snapshot and exact auth-required to expired auth', async () => {
  const staleRepo = repository({ mutationError: 'STALE_REVIEW_REVISION' });
  const stale = await createSupabaseReviewGateway(staleRepo)
    .commit(instance => instance.hold('rule-1', { expectedRevision: 1, reason: 'x' }));
  assert.equal(stale.status, 'STALE');
  assert.equal(staleRepo.__calls.snapshot, 1);
  if (stale.status === 'STALE') assert.equal(stale.serverRevision, seed.revision);

  assert.equal((await createSupabaseReviewGateway(repository({ mutationError: 'AUTH_REQUIRED' }))
    .commit(instance => instance.hold('rule-1', { expectedRevision: 1, reason: 'x' }))).status, 'AUTH_EXPIRED');
  assert.equal((await createSupabaseReviewGateway(repository({ authenticated: false }))
    .commit(instance => instance.hold('rule-1', { expectedRevision: 1, reason: 'x' }))).status, 'AUTH_EXPIRED');
  assert.equal((await createSupabaseReviewGateway(repository({ accessError: 'AUTH_REQUIRED' })).load()).status, 'AUTH_REQUIRED');
});

test('maps SQL domain guards to rejection and unexpected server errors to failure', async () => {
  const guards = [
    'CRITICAL_RULE_REQUIRES_VALID_EVIDENCE', 'RULE_HAS_SAFETY_BLOCKERS', 'REVIEW_NOT_IN_PROGRESS',
    'BULK_APPROVAL_UNSAFE', 'REASON_REQUIRED',
  ];
  for (const code of guards) {
    const result = await createSupabaseReviewGateway(repository({ mutationError: code }))
      .commit(instance => instance.hold('rule-1', { expectedRevision: 1, reason: 'x' }));
    assert.deepEqual(result, { status: 'REJECTED', code });
  }
  for (const code of REVIEW_DOMAIN_REJECTION_CODES) {
    const result = await createSupabaseReviewGateway(repository({ mutationError: code }))
      .commit(instance => instance.hold('rule-1', { expectedRevision: 1, reason: 'x' }));
    assert.equal(result.status, 'REJECTED', `${code} must be a deterministic rejection`);
  }
  assert.deepEqual(await createSupabaseReviewGateway(repository({ mutationError: 'FORBIDDEN' }))
    .commit(instance => instance.hold('rule-1', { expectedRevision: 1, reason: 'x' })), { status: 'REJECTED', code: 'FORBIDDEN' });
  assert.equal((await createSupabaseReviewGateway(repository({ mutationError: 'RULE_REVIEW_OFFLINE' }))
    .commit(instance => instance.hold('rule-1', { expectedRevision: 1, reason: 'x' }))).status, 'OFFLINE');
  const failed = await createSupabaseReviewGateway(repository({ mutationError: 'RULE_REVIEW_DB_ERROR' }))
    .commit(instance => instance.hold('rule-1', { expectedRevision: 1, reason: 'x' }));
  assert.deepEqual(failed, { status: 'FAILED', code: 'RULE_REVIEW_DB_ERROR' });
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
  assert.equal(allowsLocalReviewSeed('test'), true);
  assert.equal(allowsLocalReviewSeed(undefined), false);
});
