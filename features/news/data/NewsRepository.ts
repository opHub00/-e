import { MemoryNewsCache } from './MemoryNewsCache.ts';
import {
  NewsProviderError,
  toNewsProviderDiagnostic,
  type NewsDataset,
  type NewsProvider,
  type NewsProviderDiagnostic,
  type NewsProviderPayload,
} from './NewsProvider.ts';
import { normalizeNewsBatch } from './normalizeNews.ts';

type NewsRepositoryOptions = {
  primaryProvider: NewsProvider;
  fallbackProvider?: NewsProvider;
  cache?: MemoryNewsCache;
  cacheTtlMs?: number;
  maxAgeDays?: number;
  now?: () => Date;
  onPrimaryError?: (diagnostic: NewsProviderDiagnostic) => void;
};

type LoadNewsOptions = {
  forceRefresh?: boolean;
  signal?: AbortSignal;
};

const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;

export class NewsRepository {
  private readonly primaryProvider: NewsProvider;
  private readonly fallbackProvider?: NewsProvider;
  private readonly cache: MemoryNewsCache;
  private readonly cacheTtlMs: number;
  private readonly maxAgeDays?: number;
  private readonly now: () => Date;
  private readonly onPrimaryError?: (diagnostic: NewsProviderDiagnostic) => void;

  constructor(options: NewsRepositoryOptions) {
    this.primaryProvider = options.primaryProvider;
    this.fallbackProvider = options.fallbackProvider;
    this.cache = options.cache ?? new MemoryNewsCache();
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.maxAgeDays = options.maxAgeDays;
    this.now = options.now ?? (() => new Date());
    this.onPrimaryError = options.onPrimaryError;
  }

  async loadNews(options: LoadNewsOptions = {}): Promise<NewsDataset> {
    const now = this.now();
    const cacheKey = `news:${this.primaryProvider.source.id}`;
    if (!options.forceRefresh) {
      const cached = this.cache.get(cacheKey, now.getTime());
      if (cached) return cached;
    }

    try {
      const payload = await this.primaryProvider.fetchNews({ signal: options.signal });
      const dataset = this.buildDataset(this.primaryProvider, payload, false, now);
      this.ensureUsable(dataset);
      this.cache.set(cacheKey, dataset, now.getTime() + this.cacheTtlMs);
      return dataset;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      if (!this.fallbackProvider) throw error;

      try {
        this.onPrimaryError?.(toNewsProviderDiagnostic(error));
      } catch {
        // 진단 logger 자체의 실패가 fixture fallback을 방해하지 않게 한다.
      }

      const fallbackPayload = await this.fallbackProvider.fetchNews({ signal: options.signal });
      const fallbackDataset = this.buildDataset(
        this.fallbackProvider,
        fallbackPayload,
        true,
        now,
        safeFallbackReason(error),
      );
      this.ensureUsable(fallbackDataset);
      this.cache.set(cacheKey, fallbackDataset, now.getTime() + this.cacheTtlMs);
      return fallbackDataset;
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  private buildDataset(
    provider: NewsProvider,
    payload: NewsProviderPayload,
    isFallback: boolean,
    now: Date,
    fallbackReason?: string,
  ): NewsDataset {
    const fetchedAt = normalizeTimestamp(payload.fetchedAt, now);
    const normalized = normalizeNewsBatch(payload.records, {
      fetchedAt,
      referenceDate: now,
      maxAgeDays: this.maxAgeDays,
    });
    return {
      articles: normalized.articles,
      source: provider.source,
      fetchedAt,
      isFallback,
      fallbackReason,
      cacheStatus: 'miss',
      validationIssues: normalized.issues,
    };
  }

  private ensureUsable(dataset: NewsDataset): void {
    if (dataset.articles.length === 0) {
      throw new NewsProviderError('invalid-response', `${dataset.source.id} returned no usable articles`);
    }
  }
}

function normalizeTimestamp(value: string | undefined, fallback: Date): string {
  if (value) {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return date.toISOString();
  }
  return fallback.toISOString();
}

function safeFallbackReason(error: unknown): string {
  if (error instanceof NewsProviderError) return error.code;
  return 'provider-error';
}
