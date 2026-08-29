import { create } from 'zustand';
import { createStore, type StateCreator } from 'zustand/vanilla';
import { normalizeProfile } from '../domain/preparation.ts';
import { XP_PER_QUIZ } from '../domain/quiz.ts';
import type { UserProfile } from '../domain/types.ts';
import {
  createApplicantProfileFromLegacy,
  createPromptFatigueState,
  migrateApplicantProfile,
  recordBundleDismissed,
  recordBundleShown,
  resolveFeaturePrompt,
  toLegacyUserProfile,
  type ApplicantProfileV2,
  type ProfileFeature,
  type ProfileQuestionBundleId,
  type PromptFatigueState,
} from '../features/profile/domain.ts';
import { introStorage, type IntroStorage } from './introStorage.ts';
import { profileStorage, type ProfileStorage } from './profileStorage.ts';

/** 시연 시작 속도를 위한 기존 기본값. V2 migration의 backward-compatible seed이기도 하다. */
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

export const defaultApplicantProfile = createApplicantProfileFromLegacy(defaultProfile);

export type UserState = {
  /** 새 profile source of truth. */
  applicantProfile: ApplicantProfileV2;
  /** 기존 계산/화면을 위한 V2 → legacy adapter 결과. */
  profile: UserProfile;
  profileHydrated: boolean;
  promptFatigue: PromptFatigueState;
  xp: number;
  todayQuizDone: boolean;
  /** 최초 사용자 intro 를 봤는지. 건너뛰기도 본 것으로 친다. */
  hasSeenIntro: boolean;
  introHydrated: boolean;
  /**
   * V2 가 source of truth 다. legacy UserProfile 로 되쓰는 setter 는 두지 않는다.
   * legacy 를 받아 V2 를 다시 만들면 가족·소득·자산처럼 legacy 에 없는 입력이 조용히 지워진다.
   */
  setApplicantProfile: (profile: ApplicantProfileV2) => void;
  requestProfileBundle: (feature: ProfileFeature) => ProfileQuestionBundleId | null;
  dismissProfileBundle: (bundleId: ProfileQuestionBundleId) => void;
  /** 발표 중 처음 상태로 되돌린다. intro 와 로컬 profile도 초기화한다. */
  resetDemo: () => Promise<void>;
  completeIntro: () => Promise<void>;
  hydrateIntro: () => Promise<void>;
  hydrateProfile: () => Promise<void>;
  /** 정답 여부와 무관하게 한 번만 XP를 준다. 다시 풀어도 중복 지급하지 않는다. */
  completeTodayQuiz: () => void;
};

const initialState = {
  hasSeenIntro: false,
  introHydrated: false,
  applicantProfile: defaultApplicantProfile,
  profile: defaultProfile,
  profileHydrated: false,
  promptFatigue: createPromptFatigueState(),
  xp: 30,
  todayQuizDone: false,
};

export const shouldRedirectToIntro = (state: Pick<UserState, 'hasSeenIntro' | 'introHydrated'>) =>
  state.introHydrated && !state.hasSeenIntro;

export function createUserState(
  introStore: IntroStorage,
  applicantStore: ProfileStorage,
): StateCreator<UserState> {
  let introHydration: Promise<void> | null = null;
  let profileHydration: Promise<void> | null = null;

  const persistApplicant = (profile: ApplicantProfileV2) => {
    void applicantStore.write(profile).catch(() => undefined);
  };

  return (set, get) => ({
    ...initialState,
    setApplicantProfile: (input) => {
      const applicantProfile = migrateApplicantProfile(input, defaultProfile);
      set({
        applicantProfile,
        profile: normalizeProfile(toLegacyUserProfile(applicantProfile)),
        profileHydrated: true,
      });
      persistApplicant(applicantProfile);
    },
    requestProfileBundle: (feature) => {
      const state = get();
      const bundleId = resolveFeaturePrompt(feature, state.applicantProfile, state.promptFatigue);
      if (bundleId) set({ promptFatigue: recordBundleShown(state.promptFatigue, bundleId) });
      return bundleId;
    },
    dismissProfileBundle: (bundleId) =>
      set((state) => ({
        promptFatigue: recordBundleDismissed(state.promptFatigue, bundleId),
      })),
    resetDemo: async () => {
      await Promise.all([
        introStore.write(false).catch(() => undefined),
        applicantStore.clear().catch(() => undefined),
      ]);
      set({
        ...initialState,
        introHydrated: true,
        profileHydrated: true,
        promptFatigue: createPromptFatigueState(),
      });
    },
    completeIntro: async () => {
      await introStore.write(true).catch(() => undefined);
      set({ hasSeenIntro: true, introHydrated: true });
    },
    hydrateIntro: () => {
      if (get().introHydrated) return Promise.resolve();
      if (introHydration) return introHydration;
      introHydration = introStore
        .read()
        .then((hasSeenIntro) => set({ hasSeenIntro, introHydrated: true }))
        .catch(() => set({ introHydrated: true }))
        .finally(() => {
          introHydration = null;
        });
      return introHydration;
    },
    hydrateProfile: () => {
      if (get().profileHydrated) return Promise.resolve();
      if (profileHydration) return profileHydration;
      profileHydration = applicantStore
        .read()
        .then((stored) => {
          const applicantProfile = migrateApplicantProfile(stored, defaultProfile);
          set({
            applicantProfile,
            profile: normalizeProfile(toLegacyUserProfile(applicantProfile)),
            profileHydrated: true,
          });
          if (stored) persistApplicant(applicantProfile);
        })
        .catch(() => set({ profileHydrated: true }))
        .finally(() => {
          profileHydration = null;
        });
      return profileHydration;
    },
    completeTodayQuiz: () =>
      set((state) =>
        state.todayQuizDone ? state : { xp: state.xp + XP_PER_QUIZ, todayQuizDone: true },
      ),
  });
}

export const createUserStore = (introStore: IntroStorage, applicantStore: ProfileStorage) =>
  createStore(createUserState(introStore, applicantStore));
export const useUserStore = create<UserState>(createUserState(introStorage, profileStorage));
