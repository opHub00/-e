import { useEffect, useSyncExternalStore } from 'react';
import type { ListingDataSource, ListingDataset } from './ListingProvider.ts';
import { activeListingProvider, listingRepository } from './listingDataSource.ts';

export type ListingDatasetSnapshot =
  Pick<ListingDataset, 'listings' | 'source' | 'isFallback' | 'fallbackReason'> & {
    fetchedAt: string | null;
    status: 'loading' | 'ready' | 'error';
    error?: string;
  };

type ListingLoader = Pick<typeof listingRepository, 'loadListings'>;

export function createListingDatasetRuntime(
  loader: ListingLoader,
  primarySource: ListingDataSource,
  recoveryDelayMs = 1_500,
) {
  let snapshot: ListingDatasetSnapshot = {
    listings: [],
    source: primarySource,
    isFallback: false,
    fetchedAt: null,
    status: 'loading',
  };
  let loading: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  const emit = (next: ListingDatasetSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  const load = () => {
    if (snapshot.status === 'ready' && !snapshot.isFallback) {
      logListingLifecycle('fetch skipped: live dataset already ready');
      return Promise.resolve();
    }
    if (!loading) {
      logListingLifecycle('starting live fetch');
      loading = loader.loadListings()
        .then((dataset) => {
          logListingLifecycle(`source: ${dataset.source.kind}`);
          logListingLifecycle(`count: ${dataset.listings.length}`);
          if (typeof __DEV__ !== 'undefined' && __DEV__ && dataset.isFallback) {
            console.warn('[Listings] live fetch failed; using mock fallback', {
              reason: dataset.fallbackReason,
            });
          }
          emit({
            listings: dataset.listings,
            source: dataset.source,
            isFallback: dataset.isFallback,
            fallbackReason: dataset.fallbackReason,
            fetchedAt: dataset.fetchedAt,
            status: 'ready',
          });
        })
        .catch((error) => {
          emit({
            listings: [],
            source: primarySource,
            isFallback: false,
            fetchedAt: null,
            status: 'error',
            error: error instanceof Error ? error.message : '청약 공고를 불러오지 못했습니다.',
          });
        })
        .finally(() => {
          loading = null;
        });
    } else {
      logListingLifecycle('fetch skipped: request already in flight');
    }
    return loading;
  };

  const start = () => {
    logListingLifecycle('hook mounted');
    let disposed = false;
    let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
    void load().then(() => {
      if (!disposed && snapshot.isFallback) {
        recoveryTimer = setTimeout(() => {
          void load();
        }, recoveryDelayMs);
      }
    });
    return () => {
      disposed = true;
      if (recoveryTimer) clearTimeout(recoveryTimer);
    };
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load,
    start,
  };
}

function logListingLifecycle(message: string): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__ || typeof window === 'undefined') return;
  console.info(`[Listings] ${message}`);
}

const runtime = createListingDatasetRuntime(listingRepository, activeListingProvider.source);

export function useListingDataset(): ListingDatasetSnapshot {
  const value = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  );
  useEffect(() => runtime.start(), []);
  return value;
}
