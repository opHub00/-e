import { create } from 'zustand';

type DiscoveryState = {
  savedListingIds: string[];
  toggleSavedListing: (listingId: string) => void;
};

/** 기존 User Store와 완전히 분리된 V1 메모리 상태. */
export const useDiscoveryStore = create<DiscoveryState>((set) => ({
  savedListingIds: [],
  toggleSavedListing: (listingId) =>
    set((state) => ({
      savedListingIds: state.savedListingIds.includes(listingId)
        ? state.savedListingIds.filter((id) => id !== listingId)
        : [...state.savedListingIds, listingId],
    })),
}));
