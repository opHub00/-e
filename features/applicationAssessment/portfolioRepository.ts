import type { SupabaseClient } from '@supabase/supabase-js';
import type { AssessmentPortfolioItem, AssessmentPortfolioSnapshot, MissingProfileFactImpact, PortfolioRefreshResponse } from './portfolioContract.ts';
import type { SupplyType } from './types.ts';

export type AssessmentPortfolioRepository = {
  getPortfolio: () => Promise<AssessmentPortfolioSnapshot>;
  refreshPortfolio: () => Promise<PortfolioRefreshResponse>;
  getMissingProfileFacts: () => Promise<MissingProfileFactImpact[]>;
  getPortfolioResult: (listingId: string, supplyType: SupplyType) => Promise<AssessmentPortfolioItem | null>;
};

export class AssessmentPortfolioRepositoryError extends Error {
  readonly code:
    | 'AUTH_REQUIRED'
    | 'PORTFOLIO_DISABLED'
    | 'PROFILE_V3_REQUIRED'
    | 'PORTFOLIO_READ_FAILED'
    | 'PORTFOLIO_REFRESH_FAILED'
    | 'INVALID_SERVER_RESPONSE';
  constructor(code: AssessmentPortfolioRepositoryError['code'], message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
    this.name = 'AssessmentPortfolioRepositoryError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function serverCode(value: unknown): AssessmentPortfolioRepositoryError['code'] | null {
  if (!isRecord(value) || typeof value.code !== 'string') return null;
  if (value.code === 'AUTH_REQUIRED') return 'AUTH_REQUIRED';
  if (value.code === 'USER_CENTRIC_PORTFOLIO_DISABLED') return 'PORTFOLIO_DISABLED';
  if (value.code === 'PROFILE_V3_REQUIRED') return 'PROFILE_V3_REQUIRED';
  return null;
}

async function serverCodeFromInvokeError(error: unknown) {
  if (!isRecord(error) || !isRecord(error.context)) return null;
  const context = error.context as { clone?: () => { json?: () => Promise<unknown> }; json?: () => Promise<unknown> };
  try {
    const response = typeof context.clone === 'function' ? context.clone() : context;
    return typeof response.json === 'function' ? serverCode(await response.json()) : null;
  } catch {
    return null;
  }
}

function decodePortfolio(value: unknown): AssessmentPortfolioSnapshot {
  if (!isRecord(value) || !Array.isArray(value.items) || !Array.isArray(value.missingProfileFacts)
      || !isRecord(value.freshness) || typeof value.profileRevision !== 'number'
      || typeof value.generatedAt !== 'string' || typeof value.userId !== 'string') {
    throw new AssessmentPortfolioRepositoryError('INVALID_SERVER_RESPONSE', 'Portfolio 응답을 확인하지 못했습니다.');
  }
  return value as unknown as AssessmentPortfolioSnapshot;
}

export function createSupabaseAssessmentPortfolioRepository(
  client: SupabaseClient,
): AssessmentPortfolioRepository {
  const invoke = async (action: 'get' | 'refresh'): Promise<AssessmentPortfolioSnapshot | PortfolioRefreshResponse> => {
    const { data, error } = await client.functions.invoke('user-assessment-portfolio', { body: { action } });
    if (error) {
      const code = await serverCodeFromInvokeError(error);
      if (code) throw new AssessmentPortfolioRepositoryError(code, 'Portfolio를 사용할 수 없습니다.', { cause: error });
      throw new AssessmentPortfolioRepositoryError(
        action === 'get' ? 'PORTFOLIO_READ_FAILED' : 'PORTFOLIO_REFRESH_FAILED',
        action === 'get' ? 'Portfolio를 불러오지 못했습니다.' : 'Portfolio를 갱신하지 못했습니다.',
        { cause: error },
      );
    }
    const code = serverCode(data);
    if (code) throw new AssessmentPortfolioRepositoryError(code, 'Portfolio를 사용할 수 없습니다.');
    if (action === 'get') return decodePortfolio(isRecord(data) && 'portfolio' in data ? data.portfolio : data);
    if (!isRecord(data) || !isRecord(data.portfolio) || !isRecord(data.refresh)) {
      throw new AssessmentPortfolioRepositoryError('INVALID_SERVER_RESPONSE', 'Portfolio 갱신 응답을 확인하지 못했습니다.');
    }
    return { portfolio: decodePortfolio(data.portfolio), refresh: data.refresh } as PortfolioRefreshResponse;
  };
  const getPortfolio = () => invoke('get') as Promise<AssessmentPortfolioSnapshot>;
  const refreshPortfolio = () => invoke('refresh') as Promise<PortfolioRefreshResponse>;
  const getMissingProfileFacts = async () => (await getPortfolio()).missingProfileFacts;
  const getPortfolioResult = async (listingId: string, supplyType: SupplyType) =>
    (await getPortfolio()).items.find(item => item.listingId === listingId && item.supplyType === supplyType) ?? null;
  return { getPortfolio, refreshPortfolio, getMissingProfileFacts, getPortfolioResult };
}
