import { create } from 'zustand';
import { createStore, type StateCreator } from 'zustand/vanilla';
import {
  normalizeSavedListingIds,
  savedListingStorage,
  type SavedListingStorage,
} from './savedListingStorage.ts';

export type DiscoveryState = {
  savedListingIds: string[];
  savedListingsHydrated: boolean;
  toggleSavedListing: (listingId: string) => void;
  replaceSavedListingIds: (listingIds: readonly string[]) => Promise<void>;
  hydrateSavedListings: () => Promise<void>;
  clearSavedListings: () => Promise<void>;
};

export function createDiscoveryState(storage: SavedListingStorage): StateCreator<DiscoveryState> {
  let hydration: Promise<void> | null = null;
  const persist = (ids: readonly string[]) => {
    void storage.write(ids).catch(() => undefined);
  };

  return (set, get) => ({
    savedListingIds: [],
    savedListingsHydrated: false,
    toggleSavedListing: (listingId) => {
      const id = listingId.trim();
      if (!id) return;
      set((state) => {
        const savedListingIds = state.savedListingIds.includes(id)
          ? state.savedListingIds.filter((savedId) => savedId !== id)
          : normalizeSavedListingIds([...state.savedListingIds, id]);
        persist(savedListingIds);
        return { savedListingIds, savedListingsHydrated: true };
      });
    },
    replaceSavedListingIds: async (listingIds) => {
      const savedListingIds = normalizeSavedListingIds(listingIds);
      await storage.write(savedListingIds);
      set({ savedListingIds, savedListingsHydrated: true });
    },
    hydrateSavedListings: () => {
      if (get().savedListingsHydrated) return Promise.resolve();
      if (hydration) return hydration;
      hydration = storage
        .read()
        .then((stored) => {
          // 사용자가 storage read보다 먼저 저장했다면 최신 in-memory 선택을 덮지 않는다.
          if (get().savedListingsHydrated) return;
          const savedListingIds = normalizeSavedListingIds(stored);
          set({ savedListingIds, savedListingsHydrated: true });
          if (stored !== null) persist(savedListingIds);
        })
        .catch(() => set({ savedListingsHydrated: true }))
        .finally(() => {
          hydration = null;
        });
      return hydration;
    },
    clearSavedListings: async () => {
      await storage.clear().catch(() => undefined);
      set({ savedListingIds: [], savedListingsHydrated: true });
    },
  });
}

export const createDiscoveryStore = (storage: SavedListingStorage) =>
  createStore(createDiscoveryState(storage));

export const useDiscoveryStore = create<DiscoveryState>(createDiscoveryState(savedListingStorage));
