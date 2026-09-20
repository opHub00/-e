import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReviewGateway, ReviewLoadOutcome } from '../repository/ReviewGateway.ts';
import { ReviewSessionLoadCoordinator, type ReviewSessionPhase } from './reviewSessionLoad.ts';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};

test('late user A load cannot replace the newer user B workspace', async () => {
  const a = deferred<ReviewLoadOutcome>();
  const b = deferred<ReviewLoadOutcome>();
  const queue = [a.promise, b.promise];
  const gateway = { load: () => queue.shift()! } as ReviewGateway;
  const coordinator = new ReviewSessionLoadCoordinator();
  const applied: ReviewSessionPhase[] = [];
  const loadA = coordinator.load(gateway, phase => applied.push(phase));
  const loadB = coordinator.load(gateway, phase => applied.push(phase));

  b.resolve({
    status: 'READY', actor: 'user-b', sessionKey: 'user-b:rules', role: 'reviewer',
    repository: {} as never, workspace: { ruleVersionId: 'rules-b' } as never,
  });
  await loadB;
  a.resolve({
    status: 'READY', actor: 'user-a', sessionKey: 'user-a:rules', role: 'reviewer',
    repository: {} as never, workspace: { ruleVersionId: 'rules-a' } as never,
  });
  await loadA;

  assert.equal(applied.length, 1);
  assert.equal(applied[0]?.phase, 'READY');
  if (applied[0]?.phase === 'READY') assert.equal(applied[0].actor, 'user-b');
});
