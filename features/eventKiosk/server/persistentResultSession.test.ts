import assert from 'node:assert/strict';
import test from 'node:test';
import type { ResultSummary } from '../summary.ts';
import {
  PersistentResultSessionService,
  resultSessionPublicBaseUrl,
  type ResultSessionRepository,
  type StoredResultSession,
} from './persistentResultSession.ts';

class MemoryRepository implements ResultSessionRepository {
  records = new Map<string, StoredResultSession>();
  ttlSeconds: number[] = [];
  async putIfAbsent(token: string, value: StoredResultSession, ttlSeconds: number) {
    this.ttlSeconds.push(ttlSeconds);
    if (this.records.has(token)) return false;
    this.records.set(token, structuredClone(value));
    return true;
  }
  async read(token: string) { return structuredClone(this.records.get(token) ?? null); }
  async delete(token: string) { this.records.delete(token); }
}

const summary: ResultSummary = {
  v: 1,
  event: '제주 행사 Demo',
  date: '2026-10-10',
  household: '신혼부부',
  counts: { eligible: 1, review: 2, difficult: 6 },
  recommended: [],
  favorites: [],
  cautions: [],
};

test('persistent session POST/GET contract uses opaque token and six-hour TTL', async () => {
  const repository = new MemoryRepository();
  const token = 'a'.repeat(64);
  const service = new PersistentResultSessionService(repository, { now: () => 1_000, generateToken: () => token });
  const created = await service.create(summary);
  assert.equal(created.token, token);
  assert.equal(repository.ttlSeconds[0], 21_600);
  const read = await service.read(token);
  assert.equal(read.status, 'ok');
  if (read.status === 'ok') assert.deepEqual(read.summary, summary);
});

test('invalid tokens are rejected without backend lookup', async () => {
  const repository = new MemoryRepository();
  const result = await new PersistentResultSessionService(repository).read('raw-profile-data');
  assert.deepEqual(result, { status: 'invalid' });
});

test('expired sessions are deleted and reported separately', async () => {
  const repository = new MemoryRepository();
  const token = 'b'.repeat(64);
  repository.records.set(token, { summary, expiresAt: '2026-10-09T00:00:00.000Z' });
  const service = new PersistentResultSessionService(repository, { now: () => Date.parse('2026-10-09T00:00:01.000Z') });
  assert.deepEqual(await service.read(token), { status: 'expired' });
  assert.equal(repository.records.has(token), false);
});

test('malformed and private payloads are rejected before persistence', async () => {
  const repository = new MemoryRepository();
  const service = new PersistentResultSessionService(repository);
  await assert.rejects(() => service.create({ ...summary, applicant: { birthDate: '1990-01-01' } }), /INVALID_SUMMARY/);
  await assert.rejects(() => service.create({ v: 1 }), /INVALID_SUMMARY/);
  assert.equal(repository.records.size, 0);
});

test('public result URL only trusts explicit https or Vercel-controlled hosts', () => {
  assert.equal(resultSessionPublicBaseUrl({ VERCEL_URL: 'wanpan-preview.vercel.app' }), 'https://wanpan-preview.vercel.app');
  assert.equal(resultSessionPublicBaseUrl({ EVENT_RESULT_PUBLIC_BASE_URL: 'https://event.example/' }), 'https://event.example');
  assert.throws(() => resultSessionPublicBaseUrl({}, 'attacker.example'), /PUBLIC_BASE_URL_UNCONFIGURED/);
});
