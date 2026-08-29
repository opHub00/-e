import type {
  ListingDataset,
  ListingProvider,
  ListingProviderPayload,
} from './ListingProvider.ts';
import { MemoryListingCache } from './MemoryListingCache.ts';
import { normalizeListingBatch } from './normalizeListing.ts';

type ListingRepositoryOptions = {
  primaryProvider: ListingProvider;
  fallbackProvider?: ListingProvider;
  cache?: MemoryListingCache;
  cacheTtlMs?: number;
  now?: () => Date;
};

type LoadListingsOptions = {
  forceRefresh?: boolean;
  signal?: AbortSignal;
};

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

export class ListingRepository {
  private readonly primaryProvider: ListingProvider;
  private readonly fallbackProvider?: ListingProvider;
  private readonly cache: MemoryListingCache;
  private readonly cacheTtlMs: number;
  private readonly now: () => Date;

  constructor(options: ListingRepositoryOptions) {
    this.primaryProvider = options.primaryProvider;
    this.fallbackProvider = options.fallbackProvider;
    this.cache = options.cache ?? new MemoryListingCache();
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.now = options.now ?? (() => new Date());
  }

  async loadListings(options: LoadListingsOptions = {}): Promise<ListingDataset> {
    const now = this.now();
    const cacheKey = `listings:${this.primaryProvider.source.id}`;
    if (!options.forceRefresh) {
      const cached = this.cache.get(cacheKey, now.getTime());
      if (cached) return cached;
    }

    try {
      const payload = await this.primaryProvider.fetchListings({ signal: options.signal });
      const dataset = this.buildDataset(this.primaryProvider, payload, false, now);
      this.ensureUsable(dataset);
      this.cache.set(cacheKey, dataset, now.getTime() + this.cacheTtlMs);
      return dataset;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      if (!this.fallbackProvider) throw error;

      const fallbackPayload = await this.fallbackProvider.fetchListings({ signal: options.signal });
      const fallbackDataset = this.buildDataset(
        this.fallbackProvider,
        fallbackPayload,
        true,
        now,
        safeErrorMessage(error),
      );
      this.ensureUsable(fallbackDataset);
      return fallbackDataset;
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  private buildDataset(
    provider: ListingProvider,
    payload: ListingProviderPayload,
    isFallback: boolean,
    now: Date,
    fallbackReason?: string,
  ): ListingDataset {
    const fetchedAt = normalizeTimestamp(payload.fetchedAt, now);
    const statusCalculatedAt = normalizeTimestamp(payload.statusAsOf, now);
    const normalized = normalizeListingBatch(payload.records, {
      source: provider.source,
      fetchedAt,
      referenceDate: new Date(statusCalculatedAt),
    });

    return {
      listings: normalized.listings,
      source: provider.source,
      fetchedAt,
      statusCalculatedAt,
      isFallback,
      fallbackReason,
      cacheStatus: 'miss',
      validationIssues: normalized.issues,
    };
  }

  private ensureUsable(dataset: ListingDataset): void {
    if (dataset.listings.length === 0) {
      throw new Error(`${dataset.source.id} provider returned no usable listings`);
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

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 240);
  return 'primary provider failed';
}
