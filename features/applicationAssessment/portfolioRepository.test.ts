import assert from 'node:assert/strict';
import test from 'node:test';
import { createSupabaseAssessmentPortfolioRepository } from './portfolioRepository.ts';
import type { AssessmentPortfolioSnapshot } from './portfolioContract.ts';

const portfolio: AssessmentPortfolioSnapshot = {
  userId: 'user', profileRevision: 1, generatedAt: '2026-10-02T00:00:00Z', limit: 8, truncated: false,
  items: [], missingProfileFacts: [], freshness: { fresh: 0, stale: 0, byReason: {} },
};

test('portfolio repository exposes the four provider-independent operations', async () => {
  const actions: string[] = [];
  const repository = createSupabaseAssessmentPortfolioRepository({ functions: { invoke: async (_name: string, options: { body: { action: string } }) => {
    actions.push(options.body.action);
    return options.body.action === 'refresh'
      ? { data: { portfolio, refresh: { considered: 0, reused: 0, recalculated: 0, failed: 0 } }, error: null }
      : { data: portfolio, error: null };
  } } } as never);
  assert.equal((await repository.getPortfolio()).items.length, 0);
  assert.equal((await repository.refreshPortfolio()).refresh.considered, 0);
  const { getMissingProfileFacts, getPortfolioResult } = repository;
  assert.deepEqual(await getMissingProfileFacts(), []);
  assert.equal(await getPortfolioResult('missing', 'youth'), null);
  assert.deepEqual(actions, ['get', 'refresh', 'get', 'get']);
});

test('portfolio repository preserves safe Edge error codes from non-2xx responses', async () => {
  const response = new Response(JSON.stringify({ code: 'PROFILE_V3_REQUIRED' }), {
    status: 409, headers: { 'content-type': 'application/json' },
  });
  const repository = createSupabaseAssessmentPortfolioRepository({ functions: {
    invoke: async () => ({ data: null, error: { context: response } }),
  } } as never);
  await assert.rejects(repository.getPortfolio(), (error: unknown) =>
    error instanceof Error && 'code' in error && error.code === 'PROFILE_V3_REQUIRED');
});
