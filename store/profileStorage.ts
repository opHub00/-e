import type { ApplicantProfileV2 } from '../features/profile/domain.ts';

const PROFILE_STORAGE_KEY = 'wanpan-e:applicant-profile-v2';

export type ProfileStorage = {
  read: () => Promise<unknown | null>;
  write: (profile: ApplicantProfileV2) => Promise<void>;
  clear: () => Promise<void>;
};

export const profileStorage: ProfileStorage = {
  async read() {
    const raw = await getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  },
  write(profile) {
    return setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  },
  clear() {
    return removeItem(PROFILE_STORAGE_KEY);
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
