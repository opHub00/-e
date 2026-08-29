import {
  NewsProviderError,
  type NewsDataSource,
  type NewsProvider,
  type NewsProviderPayload,
  type NewsProviderRequest,
} from '../data/NewsProvider.ts';

export const NAVER_NEWS_ENDPOINT = 'https://naverapihub.apigw.ntruss.com/search/v1/news';
export const DEFAULT_NEWS_QUERIES = [
  '주택청약',
  '청약 제도',
  '청년 주거',
  '특별공급',
  '무주택',
  '분양',
] as const;

type FetchResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

export type NewsFetch = (url: string, init?: RequestInit) => Promise<FetchResponse>;

type NaverNewsProviderOptions = {
  clientId?: string;
  clientSecret?: string;
  queries?: readonly string[];
  displayPerQuery?: number;
  timeoutMs?: number;
  fetcher?: NewsFetch;
  now?: () => Date;
};

/**
 * 서버 전용 adapter. 환경변수를 직접 읽지 않고 Edge Function이 secret을 주입한다.
 * 이 모듈을 app/ 또는 React component에서 import하지 않는다.
 */
export class NaverNewsProvider implements NewsProvider {
  readonly source: NewsDataSource = {
    id: 'naver-api-hub-news-v1',
    kind: 'naver',
    label: 'NAVER API HUB 뉴스 검색',
  };

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly queries: readonly string[];
  private readonly displayPerQuery: number;
  private readonly timeoutMs: number;
  private readonly fetcher: NewsFetch;
  private readonly now: () => Date;

  constructor(options: NaverNewsProviderOptions) {
    this.clientId = options.clientId?.trim() ?? '';
    this.clientSecret = options.clientSecret?.trim() ?? '';
    this.queries = sanitizeQueries(options.queries ?? DEFAULT_NEWS_QUERIES);
    this.displayPerQuery = clampInteger(options.displayPerQuery ?? 10, 1, 100);
    this.timeoutMs = clampInteger(options.timeoutMs ?? 8_000, 1_000, 30_000);
    this.fetcher = options.fetcher ?? (fetch as NewsFetch);
    this.now = options.now ?? (() => new Date());
  }

  async fetchNews(request: NewsProviderRequest = {}): Promise<NewsProviderPayload> {
    if (!this.clientId || !this.clientSecret) {
      throw new NewsProviderError('missing-credentials', 'Naver News API credentials are not configured');
    }
    if (this.queries.length === 0) {
      throw new NewsProviderError('invalid-response', 'No news search queries are configured');
    }

    const controller = new AbortController();
    const abortFromRequest = () => controller.abort(request.signal?.reason);
    request.signal?.addEventListener('abort', abortFromRequest, { once: true });
    const timeout = setTimeout(() => controller.abort('naver-news-timeout'), this.timeoutMs);

    try {
      const batches = await Promise.all(this.queries.map(async (query) => {
        const url = new URL(NAVER_NEWS_ENDPOINT);
        url.searchParams.set('query', query);
        url.searchParams.set('display', String(this.displayPerQuery));
        url.searchParams.set('start', '1');
        url.searchParams.set('sort', 'date');
        url.searchParams.set('format', 'json');
        const response = await this.fetcher(url.toString(), {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'X-NCP-APIGW-API-KEY-ID': this.clientId,
            'X-NCP-APIGW-API-KEY': this.clientSecret,
          },
          signal: controller.signal,
        });
        if (!response.ok) {
          const errorBody = await readJsonSafely(response);
          throw new NewsProviderError(
            'provider-error',
            `NAVER API HUB returned HTTP ${response.status}`,
            {
              httpStatus: response.status,
              providerCode: readNaverErrorCode(errorBody),
            },
          );
        }
        const body = await response.json();
        if (!isNaverResponse(body)) {
          throw new NewsProviderError(
            'invalid-response',
            'NAVER API HUB response has no items array',
            { httpStatus: response.status, providerCode: readNaverErrorCode(body) },
          );
        }
        return body.items;
      }));

      return {
        records: batches.flat(),
        fetchedAt: this.now().toISOString(),
      };
    } catch (error) {
      if (error instanceof NewsProviderError) throw error;
      if (request.signal?.aborted) throw error;
      throw new NewsProviderError('provider-error', 'NAVER API HUB request failed');
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener('abort', abortFromRequest);
    }
  }
}

async function readJsonSafely(response: FetchResponse): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readNaverErrorCode(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (isRecord(value.error) && value.error.errorCode !== undefined) {
    return String(value.error.errorCode);
  }
  if (value.errorCode !== undefined) return String(value.errorCode);
  return undefined;
}

function isNaverResponse(value: unknown): value is { items: unknown[] } {
  return typeof value === 'object' && value !== null && Array.isArray((value as { items?: unknown }).items);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeQueries(queries: readonly string[]): string[] {
  return [...new Set(queries.map((query) => String(query).trim()).filter(Boolean))].slice(0, 10);
}

function clampInteger(value: number, min: number, max: number): number {
  const normalized = Number.isFinite(value) ? Math.floor(value) : min;
  return Math.min(max, Math.max(min, normalized));
}
