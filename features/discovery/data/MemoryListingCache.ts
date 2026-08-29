import type { ListingDataset } from './ListingProvider.ts';

type CacheEntry = {
  value: ListingDataset;
  expiresAt: number;
};

/** 프로세스 생명주기 안에서만 유지되는 작은 TTL 캐시. 영속화·DB 의존성이 없다. */
export class MemoryListingCache {
  private readonly entries = new Map<string, CacheEntry>();

  get(key: string, now: number): ListingDataset | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return null;
    }
    return { ...entry.value, cacheStatus: 'hit' };
  }

  set(key: string, value: ListingDataset, expiresAt: number): void {
    this.entries.set(key, { value: { ...value, cacheStatus: 'miss' }, expiresAt });
  }

  clear(): void {
    this.entries.clear();
  }
}
