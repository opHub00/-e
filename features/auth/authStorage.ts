const CLOUD_CACHE_OWNER_KEY = 'wanpan-e:cloud-cache-owner-v1';

export const supabaseSessionStorage = {
  getItem,
  setItem,
  removeItem,
};

export const cloudCacheOwnerStorage = {
  read: () => getItem(CLOUD_CACHE_OWNER_KEY),
  write: (userId: string) => setItem(CLOUD_CACHE_OWNER_KEY, userId),
  clear: () => removeItem(CLOUD_CACHE_OWNER_KEY),
};

export function shouldClearPrivateCacheForSession(
  cacheOwnerUserId: string | null,
  sessionUserId: string | null,
): boolean {
  return cacheOwnerUserId !== null && cacheOwnerUserId !== sessionUserId;
}

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
