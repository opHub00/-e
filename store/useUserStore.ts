import { create } from 'zustand';
import { createStore, type StateCreator } from 'zustand/vanilla';
import { normalizeProfile } from '../domain/preparation.ts';
import { XP_PER_QUIZ } from '../domain/quiz.ts';
import type { UserProfile } from '../domain/types.ts';
import { introStorage, type IntroStorage } from './introStorage.ts';

/** 시연 시작 속도를 위한 기본값. 온보딩에서 그대로 수정할 수 있다. */
export const defaultProfile: UserProfile = {
  name: '지민',
  age: 22,
  occupation: 'student',
  region: '서울특별시',
  hasSubscriptionAccount: true,
  accountMonths: 14,
  monthlyPayment: 100000,
  isNoHomeOwner: true,
};

export type UserState = {
  profile: UserProfile;
  xp: number;
  todayQuizDone: boolean;
  /** 최초 사용자 intro 를 봤는지. 건너뛰기도 본 것으로 친다. */
  hasSeenIntro: boolean;
  introHydrated: boolean;
  setProfile: (profile: UserProfile) => void;
  /** 발표 중 처음 상태로 되돌린다. intro 도 다시 볼 수 있게 초기화한다. */
  resetDemo: () => Promise<void>;
  completeIntro: () => Promise<void>;
  hydrateIntro: () => Promise<void>;
  /** 정답 여부와 무관하게 한 번만 XP를 준다. 다시 풀어도 중복 지급하지 않는다. */
  completeTodayQuiz: () => void;
};

const initialState = {
  hasSeenIntro: false,
  introHydrated: false,
  profile: defaultProfile,
  xp: 30,
  todayQuizDone: false,
};

export const shouldRedirectToIntro = (state: Pick<UserState, 'hasSeenIntro' | 'introHydrated'>) =>
  state.introHydrated && !state.hasSeenIntro;

export function createUserState(storage: IntroStorage): StateCreator<UserState> {
  let hydration: Promise<void> | null = null;
  return (set, get) => ({
    ...initialState,
    setProfile: (profile) => set({ profile: normalizeProfile(profile) }),
    resetDemo: async () => {
      await storage.write(false).catch(() => undefined);
      set({ ...initialState, introHydrated: true });
    },
    completeIntro: async () => {
      await storage.write(true).catch(() => undefined);
      set({ hasSeenIntro: true, introHydrated: true });
    },
    hydrateIntro: () => {
      if (get().introHydrated) return Promise.resolve();
      if (hydration) return hydration;
      hydration = storage
        .read()
        .then((hasSeenIntro) => set({ hasSeenIntro, introHydrated: true }))
        .catch(() => set({ introHydrated: true }))
        .finally(() => {
          hydration = null;
        });
      return hydration;
    },
    completeTodayQuiz: () =>
      set((state) =>
        state.todayQuizDone ? state : { xp: state.xp + XP_PER_QUIZ, todayQuizDone: true },
      ),
  });
}

export const createUserStore = (storage: IntroStorage) => createStore(createUserState(storage));
export const useUserStore = create<UserState>(createUserState(introStorage));
