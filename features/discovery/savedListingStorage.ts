const SAVED_LISTING_STORAGE_KEY = 'wanpan-e:saved-listing-ids-v1';

export type SavedListingStorage = {
  read: () => Promise<unknown | null>;
  write: (listingIds: readonly string[]) => Promise<void>;
  clear: () => Promise<void>;
};

export function normalizeSavedListingIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((id): id is string => typeof id === 'string')
      .map((id) => id.trim())
      .filter(Boolean),
  )].slice(0, 200);
}

export const savedListingStorage: SavedListingStorage = {
  async read() {
    const raw = await getItem(SAVED_LISTING_STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  },
  write(listingIds) {
    return setItem(SAVED_LISTING_STORAGE_KEY, JSON.stringify(normalizeSavedListingIds(listingIds)));
  },
  clear() {
    return removeItem(SAVED_LISTING_STORAGE_KEY);
  },
};

async function getItem(key: string): Promise<string | null> {
  if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  return AsyncStorage.getItem(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(key, value);
    return;
  }
  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  await AsyncStorage.setItem(key, value);
}

async function removeItem(key: string): Promise<void> {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(key);
    return;
  }
  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  await AsyncStorage.removeItem(key);
}
