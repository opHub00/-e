const CLOUD_CACHE_OWNER_KEY = 'wanpan-e:cloud-cache-owner-v1';

/**
 * Static rendering runs this module in Node, where there is no window and no
 * localStorage. The async-storage web build reads window when called, so falling
 * through to it during export crashed the render before any page was produced.
 *
 * This file is also imported by plain Node tests, so it must not import
 * react-native. The environment is identified at runtime instead.
 */
const serverMemory = new Map<string, string>();

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * A Node process rendering web output. React Native defines a global window and
 * has no process.versions.node, so a device never takes this branch; if a runtime
 * ever lacks window, the missing node version still routes it to async storage.
 */
export function isServerRenderEnvironment(): boolean {
  return typeof window === 'undefined'
    && typeof process !== 'undefined'
    && Boolean(process.versions?.node);
}

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
  const web = browserStorage();
  if (web) return web.getItem(key);
  // A server render has no session to restore, so this map starts empty every time.
  if (isServerRenderEnvironment()) return serverMemory.get(key) ?? null;
  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  return AsyncStorage.getItem(key);
}

async function setItem(key: string, value: string): Promise<void> {
  const web = browserStorage();
  if (web) {
    web.setItem(key, value);
    return;
  }
  if (isServerRenderEnvironment()) {
    serverMemory.set(key, value);
    return;
  }
  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  await AsyncStorage.setItem(key, value);
}

async function removeItem(key: string): Promise<void> {
  const web = browserStorage();
  if (web) {
    web.removeItem(key);
    return;
  }
  if (isServerRenderEnvironment()) {
    serverMemory.delete(key);
    return;
  }
  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  await AsyncStorage.removeItem(key);
}
