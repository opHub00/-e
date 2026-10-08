import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { InMemoryResultSessionStore, RESULT_SESSION_TTL_MS, isOpaqueResultToken, isValidResultSummary } from './event-result-session-store.mjs';

const TOKEN_A = 'a'.repeat(64);
const TOKEN_B = 'b'.repeat(64);
const summary = () => ({
  v: 1, event: 'jeju-event-2026-10-v1', date: '2026-10-29', household: '1인 가구',
  counts: { eligible: 1, review: 2, difficult: 6 },
  recommended: [{ title: '제주 공고', supply: '청년', bucket: 'eligible', stage: null, note: null }],
  favorites: [], cautions: ['서류 확인 필요'],
});

test('result sessions use an opaque token and expire at the configured TTL', () => {
  let now = Date.parse('2026-10-29T00:00:00.000Z');
  const store = new InMemoryResultSessionStore({ now: () => now, generateToken: () => TOKEN_A });
  const created = store.create(summary());
  assert.equal(created.token, TOKEN_A);
  assert.equal(isOpaqueResultToken(created.token), true);
  assert.equal(Date.parse(created.expiresAt) - now, RESULT_SESSION_TTL_MS);
  assert.equal(store.read(created.token).status, 'ok');
  now += RESULT_SESSION_TTL_MS;
  assert.equal(store.read(created.token).status, 'expired');
  assert.equal(store.read(created.token).status, 'missing');
});

test('invalid and unknown tokens never resolve a session', () => {
  const store = new InMemoryResultSessionStore();
  assert.equal(store.read('not-a-token').status, 'invalid');
  assert.equal(store.read(TOKEN_B).status, 'missing');
});

test('expired sessions can be purged and returned summaries are isolated clones', () => {
  let now = Date.parse('2026-10-29T00:00:00.000Z');
  const store = new InMemoryResultSessionStore({ now: () => now, ttlMs: 60_000, generateToken: () => TOKEN_A });
  const original = summary();
  store.create(original);
  original.event = 'mutated';
  const first = store.read(TOKEN_A);
  assert.equal(first.status, 'ok');
  assert.equal(first.summary.event, 'jeju-event-2026-10-v1');
  first.summary.event = 'also-mutated';
  assert.equal(store.read(TOKEN_A).summary.event, 'jeju-event-2026-10-v1');
  now += 60_000;
  assert.equal(store.purgeExpired(), 1);
  assert.equal(store.read(TOKEN_A).status, 'missing');
});

test('result summary schema rejects personal fields and unrecognized payload fields', () => {
  assert.equal(isValidResultSummary(summary()), true);
  assert.equal(isValidResultSummary({ ...summary(), displayName: '홍길동' }), false);
  assert.equal(isValidResultSummary({ ...summary(), birthDate: '2000-01-01' }), false);
  assert.equal(isValidResultSummary({ ...summary(), counts: { eligible: 1, review: 2, difficult: 6, unknown: 1 } }), false);
  assert.equal(isValidResultSummary({ ...summary(), recommended: [{ ...summary().recommended[0], rawFact: 'score.applicantDisabled' }] }), false);
});

test('session creation rejects malformed or privacy-bearing summaries', () => {
  const store = new InMemoryResultSessionStore({ generateToken: () => TOKEN_A });
  assert.throws(() => store.create({ ...summary(), spouse: { birthDate: '1990-01-01' } }), /INVALID_SUMMARY/);
});
