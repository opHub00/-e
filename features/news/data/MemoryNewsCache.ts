import type { NewsDataset } from './NewsProvider.ts';

type CacheEntry = {
  value: NewsDataset;
  expiresAt: number;
};

/** 서버 프로세스 생명주기 안에서만 유지되며 영속 저장소나 사용자 데이터는 사용하지 않는다. */
export class MemoryNewsCache {
  private readonly entries = new Map<string, CacheEntry>();

  get(key: string, now: number): NewsDataset | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return null;
    }
    return { ...entry.value, cacheStatus: 'hit' };
  }

  set(key: string, value: NewsDataset, expiresAt: number): void {
    this.entries.set(key, { value: { ...value, cacheStatus: 'miss' }, expiresAt });
  }

  clear(): void {
    this.entries.clear();
  }
}
