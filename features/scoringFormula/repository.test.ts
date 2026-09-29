import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ScoringRepositoryException, SupabaseScoringFormulaRepository, SCORING_RPC } from './repository.ts';

test('Supabase repository maps every operation to the canonical RPC contract', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const snapshot = { id: 'f', slug: 's', version: '2', revision: 2, status: 'DRAFT', target: 'generalPrivate', scopeKey: 'generalPrivate',
    name: 'n', description: '', targets: ['generalPrivate'], publishedToUsers: false, legalBasis: 'basis', components: [], interpretations: [], testCases: [], history: [], updatedAt: '',
    hasDraft: true, draftVersion: { id: 'f', version: '2', status: 'DRAFT', updatedAt: '' }, actors: { created: null, updated: null, activated: null } };
  const client = { rpc: async (name: string, args: Record<string, unknown> = {}) => {
    calls.push({ name, args });
    if (name === SCORING_RPC.access) return { data: { role: 'admin', canRead: true, canReview: true, canMutate: true, canActivate: true }, error: null };
    if (name === SCORING_RPC.list) return { data: [snapshot], error: null };
    if (name === SCORING_RPC.audit) return { data: [], error: null };
    if (name === SCORING_RPC.review) return { data: { validation: [], testCases: [] }, error: null };
    if (name === SCORING_RPC.getActive) return { data: null, error: null };
    if (name === SCORING_RPC.evaluateActive) return { data: null, error: null };
    return { data: snapshot, error: null };
  } } as unknown as Pick<SupabaseClient, 'rpc'>;
  const repository = new SupabaseScoringFormulaRepository(client);
  const mutation = { expectedRevision: 2, reason: 'operator change' };
  await repository.getAccess(); await repository.list(); await repository.get('f');
  await repository.updateMetadata('f', { name: 'next' }, mutation);
  await repository.createItem('f', { id: 'i', label: 'I', description: '', unit: 'x', fact: 'fact', order: 1, bands: [] }, mutation);
  await repository.createBand('f', 'i', { points: 1, label: 'one' }, 0, mutation);
  await repository.createTestCase('f', { id: 't', label: 'T', inputs: { i: 0 }, expectedTotal: 1 }, 0, mutation);
  await repository.review('f'); await repository.requestReview('f', mutation); await repository.returnToDraft('f', mutation);
  await repository.activate('f', false, mutation); await repository.setPublication('f', true, mutation); await repository.retire('f', mutation);
  await repository.auditHistory('f'); await repository.getActiveFormula('generalPrivate'); await repository.evaluateActiveFormula('generalPrivate', { i: null });
  assert.deepEqual(new Set(calls.map(call => call.name)), new Set([
    SCORING_RPC.access, SCORING_RPC.list, SCORING_RPC.detail, SCORING_RPC.mutate, SCORING_RPC.review, SCORING_RPC.requestReview, SCORING_RPC.activate,
    SCORING_RPC.returnToDraft, SCORING_RPC.setPublication, SCORING_RPC.retire, SCORING_RPC.audit, SCORING_RPC.getActive, SCORING_RPC.evaluateActive,
  ]));
  assert.equal(calls.find(call => call.name === SCORING_RPC.activate)?.args.p_expected_revision, 2);
  assert.equal(calls.find(call => call.name === SCORING_RPC.setPublication)?.args.p_published_to_users, true);
});

test('unknown provider errors never leak raw database text', async () => {
  const client = { rpc: async () => ({ data: null, error: { message: 'duplicate key value violates unique constraint scoring_secret_idx', details: 'private row detail' } }) } as unknown as Pick<SupabaseClient, 'rpc'>;
  await assert.rejects(
    () => new SupabaseScoringFormulaRepository(client).get('f'),
    error => error instanceof ScoringRepositoryException
      && error.message === 'SCORING_UNEXPECTED_ERROR'
      && error.safeMessage === '산식 저장소에서 처리하지 못한 오류가 발생했어요.'
      && !error.message.includes('duplicate')
      && !error.safeMessage.includes('private'),
  );
});

test('version conflicts expose only the safe existing-draft context', async () => {
  const details = JSON.stringify({
    code: 'SCORING_VERSION_CONFLICT',
    existingVersion: { id: 'draft-2', version: '2.0.0', status: 'DRAFT', updatedAt: '2026-09-28T00:00:00Z' },
    existingDraft: { id: 'draft-2', version: '2.0.0', status: 'DRAFT', updatedAt: '2026-09-28T00:00:00Z' },
  });
  const client = { rpc: async () => ({ data: null, error: { message: 'SCORING_VERSION_CONFLICT', details } }) } as unknown as Pick<SupabaseClient, 'rpc'>;
  await assert.rejects(
    () => new SupabaseScoringFormulaRepository(client).cloneVersion('active-1', '2.0.0', 'new version'),
    error => error instanceof ScoringRepositoryException
      && error.code === 'SCORING_VERSION_CONFLICT'
      && error.context?.existingDraft?.id === 'draft-2',
  );
});

test('known database errors pass through unchanged', async () => {
  const client = { rpc: async () => ({ data: null, error: { message: 'STALE: SCORING_STALE_REVISION' } }) } as unknown as Pick<SupabaseClient, 'rpc'>;
  await assert.rejects(() => new SupabaseScoringFormulaRepository(client).get('f'), /SCORING_STALE_REVISION/);
});

test('test input contract errors pass through unchanged', async () => {
  const client = { rpc: async () => ({ data: null, error: { message: 'TEST_INPUT_KEYS_MISMATCH' } }) } as unknown as Pick<SupabaseClient, 'rpc'>;
  await assert.rejects(() => new SupabaseScoringFormulaRepository(client).get('f'), /TEST_INPUT_KEYS_MISMATCH/);
});

test('published-version errors reach the repository unchanged', async () => {
  const client = { rpc: async () => ({ data: null, error: { message: 'SCORING_VERSION_PUBLISHED' } }) } as unknown as Pick<SupabaseClient, 'rpc'>;
  await assert.rejects(
    () => new SupabaseScoringFormulaRepository(client).updateMetadata('active', { name: 'blocked' }, { expectedRevision: 1, reason: 'must clone' }),
    error => error instanceof Error && error.message === 'SCORING_VERSION_PUBLISHED',
  );
});
