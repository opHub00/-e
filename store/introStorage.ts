const INTRO_STORAGE_KEY = 'wanpan-e:has-seen-intro';

export type IntroStorage = {
  read: () => Promise<boolean>;
  write: (value: boolean) => Promise<void>;
};

export const introStorage: IntroStorage = {
  async read() {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(INTRO_STORAGE_KEY) === 'true';
    }
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    return (await AsyncStorage.getItem(INTRO_STORAGE_KEY)) === 'true';
  },
  async write(value) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(INTRO_STORAGE_KEY, String(value));
      return;
    }
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    await AsyncStorage.setItem(INTRO_STORAGE_KEY, String(value));
  },
};
