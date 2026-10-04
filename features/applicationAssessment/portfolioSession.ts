import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { AssessmentPortfolioSnapshot, PortfolioRefreshSummary } from './portfolioContract.ts';
import {
  AssessmentPortfolioRepositoryError,
  type AssessmentPortfolioRepository,
} from './portfolioRepository.ts';

export type PortfolioSessionStatus =
  | 'disabled'
  | 'loading'
  | 'ready'
  | 'refreshing'
  | 'auth_required'
  | 'offline'
  | 'error';

export type PortfolioIntroStorage = {
  read: (userId: string) => Promise<boolean>;
  write: (userId: string, value: boolean) => Promise<void>;
};

const introKey = (userId: string) => `wanpane:portfolio-intro:v1:${userId}`;

export const portfolioIntroStorage: PortfolioIntroStorage = {
  read: async userId => (await AsyncStorage.getItem(introKey(userId))) === '1',
  write: async (userId, value) => {
    if (value) await AsyncStorage.setItem(introKey(userId), '1');
    else await AsyncStorage.removeItem(introKey(userId));
  },
};

export type PortfolioSessionState = {
  userId: string | null;
  status: PortfolioSessionStatus;
  snapshot: AssessmentPortfolioSnapshot | null;
  lastRefresh: PortfolioRefreshSummary | null;
  errorCode: AssessmentPortfolioRepositoryError['code'] | null;
  hasSeenIntro: boolean;
  introHydrated: boolean;
};

const initial: PortfolioSessionState = {
  userId: null,
  status: 'disabled',
  snapshot: null,
  lastRefresh: null,
  errorCode: null,
  hasSeenIntro: false,
  introHydrated: false,
};

export const usePortfolioSessionStore = create<PortfolioSessionState>(() => initial);

let repository: AssessmentPortfolioRepository | null = null;
let introRepository: PortfolioIntroStorage = portfolioIntroStorage;
let generation = 0;

const networkLike = (error: unknown) =>
  error instanceof TypeError || (error instanceof AssessmentPortfolioRepositoryError
    && ['PORTFOLIO_READ_FAILED', 'PORTFOLIO_REFRESH_FAILED'].includes(error.code));

const needsInitialRefresh = (snapshot: AssessmentPortfolioSnapshot) =>
  snapshot.items.length === 0
  || snapshot.freshness.stale > 0
  || snapshot.items.some(item => item.failureCode === 'NOT_CALCULATED');

function fail(error: unknown, ownGeneration: number) {
  if (ownGeneration !== generation) return;
  const code = error instanceof AssessmentPortfolioRepositoryError ? error.code : 'PORTFOLIO_READ_FAILED';
  usePortfolioSessionStore.setState({
    status: code === 'AUTH_REQUIRED' ? 'auth_required' : networkLike(error) ? 'offline' : 'error',
    errorCode: code,
  });
}

export async function startPortfolioSession(input: {
  userId: string;
  repository: AssessmentPortfolioRepository;
  introStorage?: PortfolioIntroStorage;
  autoRefresh?: boolean;
}): Promise<AssessmentPortfolioSnapshot | null> {
  const ownGeneration = ++generation;
  repository = input.repository;
  introRepository = input.introStorage ?? portfolioIntroStorage;
  usePortfolioSessionStore.setState({ ...initial, userId: input.userId, status: 'loading' });
  const intro = introRepository.read(input.userId).catch(() => false);
  try {
    const [snapshot, hasSeenIntro] = await Promise.all([input.repository.getPortfolio(), intro]);
    if (ownGeneration !== generation) return snapshot;
    usePortfolioSessionStore.setState({
      userId: input.userId,
      status: 'ready',
      snapshot,
      lastRefresh: null,
      errorCode: null,
      hasSeenIntro,
      introHydrated: true,
    });
    if (input.autoRefresh !== false && needsInitialRefresh(snapshot)) {
      return (await refreshPortfolioSession()).snapshot;
    }
    return snapshot;
  } catch (error) {
    fail(error, ownGeneration);
    return null;
  }
}

export function stopPortfolioSession(): void {
  generation += 1;
  repository = null;
  usePortfolioSessionStore.setState(initial);
}

export async function refreshPortfolioSession(): Promise<PortfolioSessionState> {
  const ownGeneration = generation;
  const active = repository;
  const state = usePortfolioSessionStore.getState();
  if (!active || !state.userId) return state;
  usePortfolioSessionStore.setState({ status: 'refreshing', errorCode: null });
  try {
    const response = await active.refreshPortfolio();
    if (ownGeneration === generation) {
      usePortfolioSessionStore.setState({
        status: 'ready',
        snapshot: response.portfolio,
        lastRefresh: response.refresh,
        errorCode: null,
      });
    }
  } catch (error) {
    fail(error, ownGeneration);
  }
  return usePortfolioSessionStore.getState();
}

export async function markPortfolioIntroSeen(): Promise<void> {
  const state = usePortfolioSessionStore.getState();
  if (!state.userId || state.hasSeenIntro) return;
  usePortfolioSessionStore.setState({ hasSeenIntro: true, introHydrated: true });
  await introRepository.write(state.userId, true).catch(() => undefined);
}
