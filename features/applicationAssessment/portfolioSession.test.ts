import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssessmentPortfolioSnapshot } from './portfolioContract.ts';
import type { AssessmentPortfolioRepository } from './portfolioRepository.ts';
import {
  markPortfolioIntroSeen,
  startPortfolioSession,
  stopPortfolioSession,
  usePortfolioSessionStore,
  type PortfolioIntroStorage,
} from './portfolioSession.ts';

const snapshot = (userId: string, stale = 0): AssessmentPortfolioSnapshot => ({
  userId, profileRevision: 1, generatedAt: '2026-10-02T00:00:00Z', limit: 8, truncated: false,
  items: stale ? [{ freshness: 'STALE_PROFILE' } as never] : [], missingProfileFacts: [],
  freshness: { fresh: 0, stale, byReason: stale ? { STALE_PROFILE: stale } : {} },
});

test('empty portfolio refreshes once and adopts server-confirmed snapshot', async () => {
  let refreshes = 0;
  const repository: AssessmentPortfolioRepository = {
    getPortfolio: async () => snapshot('user-a'),
    refreshPortfolio: async () => {
      refreshes += 1;
      return { portfolio: { ...snapshot('user-a'), items: [{ listingId: 'one' } as never] }, refresh: { considered: 1, reused: 0, recalculated: 1, failed: 0 } };
    },
    getMissingProfileFacts: async () => [], getPortfolioResult: async () => null,
  };
  const memory: PortfolioIntroStorage = { read: async () => false, write: async () => undefined };
  await startPortfolioSession({ userId: 'user-a', repository, introStorage: memory });
  assert.equal(refreshes, 1);
  assert.equal(usePortfolioSessionStore.getState().snapshot?.items.length, 1);
  stopPortfolioSession();
});

test('late response from previous account cannot replace current portfolio', async () => {
  let release!: (value: AssessmentPortfolioSnapshot) => void;
  const slow = new Promise<AssessmentPortfolioSnapshot>(resolve => { release = resolve; });
  const repository = (read: () => Promise<AssessmentPortfolioSnapshot>): AssessmentPortfolioRepository => ({
    getPortfolio: read,
    refreshPortfolio: async () => ({ portfolio: await read(), refresh: { considered: 0, reused: 0, recalculated: 0, failed: 0 } }),
    getMissingProfileFacts: async () => [], getPortfolioResult: async () => null,
  });
  const a = startPortfolioSession({ userId: 'a', repository: repository(() => slow), autoRefresh: false });
  await startPortfolioSession({ userId: 'b', repository: repository(async () => snapshot('b')), autoRefresh: false });
  release(snapshot('a'));
  await a;
  assert.equal(usePortfolioSessionStore.getState().userId, 'b');
  assert.equal(usePortfolioSessionStore.getState().snapshot?.userId, 'b');
  stopPortfolioSession();
});

test('portfolio intro is scoped to authenticated user', async () => {
  const seen = new Map<string, boolean>();
  const storage: PortfolioIntroStorage = { read: async id => seen.get(id) ?? false, write: async (id, value) => { seen.set(id, value); } };
  const repository: AssessmentPortfolioRepository = {
    getPortfolio: async () => snapshot('user-a'), refreshPortfolio: async () => ({ portfolio: snapshot('user-a'), refresh: { considered: 0, reused: 0, recalculated: 0, failed: 0 } }),
    getMissingProfileFacts: async () => [], getPortfolioResult: async () => null,
  };
  await startPortfolioSession({ userId: 'user-a', repository, introStorage: storage, autoRefresh: false });
  await markPortfolioIntroSeen();
  assert.equal(seen.get('user-a'), true);
  stopPortfolioSession();
});
