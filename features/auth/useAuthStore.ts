import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { useDiscoveryStore } from '../discovery/useDiscoveryStore';
import { savedListingStorage } from '../discovery/savedListingStorage';
import { migrateApplicantProfile, type ApplicantProfileV2 } from '../profile/domain';
import { defaultProfile, useUserStore } from '../../store/useUserStore';
import { profileStorage } from '../../store/profileStorage';
import {
  cloudCacheOwnerStorage,
  shouldClearPrivateCacheForSession,
} from './authStorage';
import {
  readPersistedSession,
  signInWithPassword,
  signOutLocal,
  signUpWithPassword,
} from './authClientAdapter';
import { createCloudSyncRepository, type CloudSyncRepository } from './cloudRepository';
import { buildInitialSyncPlan, readCloudSyncSnapshot } from './initialSync';
import {
  isApplicantProfileV2Payload,
  mergeApplicantProfiles,
  type ProfileConflictPreference,
} from './syncDomain';
import { getSupabaseClient } from './supabaseClient';

export type CloudSyncStatus =
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'error'
  | 'conflict'
  | 'paused'
  | 'unavailable';

type ProfileConflict = { local: ApplicantProfileV2; cloud: ApplicantProfileV2 };

export type AuthState = {
  authHydrated: boolean;
  session: Session | null;
  email: string | null;
  submitting: boolean;
  syncStatus: CloudSyncStatus;
  errorMessage: string | null;
  noticeMessage: string | null;
  profileConflict: ProfileConflict | null;
  initializeAuth: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  retrySync: () => Promise<void>;
  resolveProfileConflict: (preference: Exclude<ProfileConflictPreference, 'detect'>) => Promise<void>;
  resetLocalDemoState: () => Promise<void>;
  restoreCloudAfterDemoReset: () => Promise<void>;
  clearMessages: () => void;
};

let initializePromise: Promise<void> | null = null;
let repository: CloudSyncRepository | null = null;
let currentUserId: string | null = null;
let lastSyncedUserId: string | null = null;
let initialSyncComplete = false;
let listenersInstalled = false;
let suppressCloudWrites = false;
let syncPaused = false;
let profileWriteQueue = Promise.resolve();
let savedWriteQueue = Promise.resolve();
let activeAccountSync: Promise<void> | null = null;
let activeAccountSyncUserId: string | null = null;

export const useAuthStore = create<AuthState>((set, get) => {
  const installLocalListeners = () => {
    if (listenersInstalled) return;
    listenersInstalled = true;

    useUserStore.subscribe((state, previous) => {
      if (state.applicantProfile === previous.applicantProfile) return;
      if (!canWriteCloud(get()) || suppressCloudWrites || get().profileConflict) return;
      const userId = currentUserId;
      const nextProfile = state.applicantProfile;
      if (!userId || !repository) return;
      profileWriteQueue = profileWriteQueue
        .catch(() => undefined)
        .then(async () => {
          set({ syncStatus: 'syncing', errorMessage: null });
          await repository?.writeProfile(userId, nextProfile);
          if (currentUserId === userId && !syncPaused) set({ syncStatus: 'synced' });
        })
        .catch(() => {
          if (currentUserId === userId) {
            set({
              syncStatus: 'error',
              errorMessage: '프로필은 이 기기에 저장됐어요. 연결되면 다시 동기화할 수 있어요.',
            });
          }
        });
    });

    useDiscoveryStore.subscribe((state, previous) => {
      if (state.savedListingIds === previous.savedListingIds) return;
      if (!canWriteCloud(get()) || suppressCloudWrites) return;
      const userId = currentUserId;
      const nextIds = state.savedListingIds;
      if (!userId || !repository) return;
      savedWriteQueue = savedWriteQueue
        .catch(() => undefined)
        .then(async () => {
          set({ syncStatus: 'syncing', errorMessage: null });
          await repository?.replaceSavedListingIds(userId, nextIds);
          if (currentUserId === userId && !syncPaused && !get().profileConflict) {
            set({ syncStatus: 'synced' });
          }
        })
        .catch(() => {
          if (currentUserId === userId) {
            set({
              syncStatus: 'error',
              errorMessage: '저장 공고는 이 기기에 남아 있어요. 연결되면 다시 동기화할 수 있어요.',
            });
          }
        });
    });
  };

  const clearPrivateCache = async () => {
    suppressCloudWrites = true;
    try {
      await Promise.all([
        useUserStore.getState().clearPrivateProfileCache(),
        useDiscoveryStore.getState().clearSavedListings(),
        cloudCacheOwnerStorage.clear(),
      ]);
    } finally {
      suppressCloudWrites = false;
    }
  };

  const performAccountSync = async (session: Session, force = false) => {
    const userId = session.user.id;
    if (!repository) throw new Error('cloud repository unavailable');
    if (!force && lastSyncedUserId === userId && initialSyncComplete) return;

    set({ syncStatus: 'syncing', errorMessage: null, profileConflict: null });
    const [localProfileRaw, localSavedRaw, cloudSnapshot] = await Promise.all([
      profileStorage.read(),
      savedListingStorage.read(),
      readCloudSyncSnapshot(repository, userId),
    ]);
    const plan = buildInitialSyncPlan({
      fallback: defaultProfile,
      localProfileRaw,
      cloudProfile: cloudSnapshot.cloudProfile,
      localSavedListingIds: localSavedRaw,
      cloudSavedListingIds: cloudSnapshot.cloudSavedListingIds,
    });

    if (plan.malformedCloudProfile && !plan.profile) {
      throw new Error('malformed cloud profile');
    }

    suppressCloudWrites = true;
    try {
      await Promise.all([
        plan.profile
          ? useUserStore.getState().restoreApplicantProfile(plan.profile)
          : Promise.resolve(),
        useDiscoveryStore.getState().replaceSavedListingIds(plan.savedListingIds),
      ]);
    } finally {
      suppressCloudWrites = false;
    }

    await Promise.all([
      plan.writeProfileToCloud && plan.profile
        ? repository.writeProfile(userId, plan.profile)
        : Promise.resolve(),
      plan.writeSavedListingsToCloud
        ? repository.replaceSavedListingIds(userId, plan.savedListingIds)
        : Promise.resolve(),
    ]);

    await cloudCacheOwnerStorage.write(userId);
    currentUserId = userId;
    lastSyncedUserId = userId;
    initialSyncComplete = true;
    syncPaused = false;
    set({
      session,
      email: session.user.email ?? null,
      syncStatus: plan.profileConflict ? 'conflict' : 'synced',
      profileConflict: plan.profileConflict,
      errorMessage: plan.profileConflict
        ? '이 기기와 클라우드의 확정 정보가 달라요. 사용할 정보를 선택해주세요.'
        : null,
    });
  };

  const syncAccount = (session: Session, force = false): Promise<void> => {
    if (activeAccountSync && activeAccountSyncUserId === session.user.id) return activeAccountSync;
    activeAccountSyncUserId = session.user.id;
    activeAccountSync = performAccountSync(session, force).finally(() => {
      activeAccountSync = null;
      activeAccountSyncUserId = null;
    });
    return activeAccountSync;
  };

  const processSession = async (session: Session | null, force = false) => {
    if (!session) {
      const hadSignedInUser = currentUserId !== null;
      currentUserId = null;
      lastSyncedUserId = null;
      initialSyncComplete = false;
      syncPaused = false;
      set({
        session: null,
        email: null,
        syncStatus: 'idle',
        profileConflict: null,
        errorMessage: null,
      });
      if (hadSignedInUser) await clearPrivateCache();
      return;
    }

    if (shouldClearPrivateCacheForSession(currentUserId, session.user.id)) {
      currentUserId = null;
      lastSyncedUserId = null;
      initialSyncComplete = false;
      syncPaused = false;
      await clearPrivateCache();
    }
    currentUserId = session.user.id;
    set({ session, email: session.user.email ?? null });
    try {
      await syncAccount(session, force);
    } catch {
      initialSyncComplete = false;
      set({
        syncStatus: 'error',
        errorMessage: '클라우드에 연결하지 못했어요. 이 기기의 정보는 그대로 유지돼요.',
      });
    }
  };

  return {
    authHydrated: false,
    session: null,
    email: null,
    submitting: false,
    syncStatus: 'idle',
    errorMessage: null,
    noticeMessage: null,
    profileConflict: null,

    initializeAuth: () => {
      if (get().authHydrated) return Promise.resolve();
      if (initializePromise) return initializePromise;
      initializePromise = (async () => {
        await Promise.all([
          useUserStore.getState().hydrateProfile(),
          useDiscoveryStore.getState().hydrateSavedListings(),
        ]);
        installLocalListeners();
        const client = getSupabaseClient();
        if (!client) {
          set({ authHydrated: true, syncStatus: 'unavailable' });
          return;
        }
        repository = createCloudSyncRepository(client);
        const [persistedSession, cacheOwner] = await Promise.all([
          readPersistedSession(client),
          cloudCacheOwnerStorage.read(),
        ]);
        if (
          shouldClearPrivateCacheForSession(
            cacheOwner,
            persistedSession?.user.id ?? null,
          )
        ) {
          await clearPrivateCache();
        }
        await processSession(persistedSession);
        client.auth.onAuthStateChange((_event, session) => {
          queueMicrotask(() => void processSession(session));
        });
        set({ authHydrated: true });
      })()
        .catch(() => {
          set({
            authHydrated: true,
            syncStatus: 'error',
            errorMessage: '계정 상태를 확인하지 못했어요. 게스트로 계속 사용할 수 있어요.',
          });
        })
        .finally(() => {
          initializePromise = null;
        });
      return initializePromise;
    },

    signUp: async (email, password) => {
      const client = getSupabaseClient();
      if (!client) throw new Error('계정 연결을 사용할 수 없어요.');
      set({ submitting: true, errorMessage: null, noticeMessage: null });
      try {
        const emailRedirectTo = typeof window === 'undefined'
          ? undefined
          : `${window.location.origin}/auth`;
        const result = await signUpWithPassword(client, email, password, emailRedirectTo);
        if (result.session) {
          await processSession(result.session, true);
          set({ noticeMessage: '계정이 만들어졌고 이 기기의 정보를 안전하게 동기화했어요.' });
          return false;
        }
        set({ noticeMessage: '확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해주세요.' });
        return true;
      } catch (error) {
        const message = authErrorMessage(error);
        set({ errorMessage: message });
        throw new Error(message);
      } finally {
        set({ submitting: false });
      }
    },

    signIn: async (email, password) => {
      const client = getSupabaseClient();
      if (!client) throw new Error('계정 연결을 사용할 수 없어요.');
      set({ submitting: true, errorMessage: null, noticeMessage: null });
      try {
        const session = await signInWithPassword(client, email, password);
        await processSession(session, true);
        set({ noticeMessage: '로그인했어요.' });
      } catch (error) {
        const message = authErrorMessage(error);
        set({ errorMessage: message });
        throw new Error(message);
      } finally {
        set({ submitting: false });
      }
    },

    signOut: async () => {
      const client = getSupabaseClient();
      if (!client) return;
      set({ submitting: true, errorMessage: null, noticeMessage: null });
      try {
        await signOutLocal(client);
        await processSession(null);
        set({ noticeMessage: '로그아웃했어요. 이 기기의 개인 정보는 비웠고 클라우드에는 보관돼요.' });
      } catch (error) {
        const message = authErrorMessage(error);
        set({ errorMessage: message });
        throw new Error(message);
      } finally {
        set({ submitting: false });
      }
    },

    retrySync: async () => {
      const session = get().session;
      if (!session || get().profileConflict) return;
      try {
        if (!initialSyncComplete) {
          await syncAccount(session, true);
          return;
        }
        if (!repository) return;
        set({ syncStatus: 'syncing', errorMessage: null });
        await Promise.all([
          repository.writeProfile(session.user.id, useUserStore.getState().applicantProfile),
          repository.replaceSavedListingIds(
            session.user.id,
            useDiscoveryStore.getState().savedListingIds,
          ),
        ]);
        set({ syncStatus: 'synced' });
      } catch {
        set({
          syncStatus: 'error',
          errorMessage: '아직 연결하지 못했어요. 이 기기의 정보는 그대로 유지돼요.',
        });
      }
    },

    resolveProfileConflict: async (preference) => {
      const conflict = get().profileConflict;
      const session = get().session;
      if (!conflict || !session || !repository) return;
      const local = migrateApplicantProfile(
        useUserStore.getState().applicantProfile,
        defaultProfile,
      );
      const profile = mergeApplicantProfiles(local, conflict.cloud, preference).profile;
      set({ syncStatus: 'syncing', errorMessage: null });
      try {
        suppressCloudWrites = true;
        await useUserStore.getState().restoreApplicantProfile(profile);
        suppressCloudWrites = false;
        await repository.writeProfile(session.user.id, profile);
        set({ syncStatus: 'synced', profileConflict: null });
      } catch {
        suppressCloudWrites = false;
        set({
          syncStatus: 'conflict',
          errorMessage: '선택한 정보를 아직 저장하지 못했어요. 다시 시도해주세요.',
        });
      }
    },

    resetLocalDemoState: async () => {
      suppressCloudWrites = true;
      syncPaused = Boolean(get().session);
      try {
        await Promise.all([
          useUserStore.getState().resetDemo(),
          useDiscoveryStore.getState().clearSavedListings(),
        ]);
      } finally {
        suppressCloudWrites = false;
      }
      if (get().session) {
        set({
          syncStatus: 'paused',
          noticeMessage: '데모용 로컬 상태만 초기화했어요. 계정과 클라우드 데이터는 그대로예요.',
          errorMessage: null,
        });
      }
    },

    restoreCloudAfterDemoReset: async () => {
      const session = get().session;
      if (!session || !repository) return;
      set({ syncStatus: 'syncing', errorMessage: null });
      try {
        const [cloudProfile, cloudSaved] = await Promise.all([
          repository.readProfile(session.user.id),
          repository.readSavedListingIds(session.user.id),
        ]);
        suppressCloudWrites = true;
        if (
          cloudProfile?.schemaVersion === 2 &&
          isApplicantProfileV2Payload(cloudProfile.profileJson)
        ) {
          await useUserStore
            .getState()
            .restoreApplicantProfile(
              migrateApplicantProfile(cloudProfile.profileJson, defaultProfile),
            );
        }
        await useDiscoveryStore.getState().replaceSavedListingIds(cloudSaved);
        suppressCloudWrites = false;
        syncPaused = false;
        set({ syncStatus: 'synced', noticeMessage: '클라우드 정보를 이 기기에 복원했어요.' });
      } catch {
        suppressCloudWrites = false;
        set({ syncStatus: 'paused', errorMessage: '클라우드 정보를 복원하지 못했어요.' });
      }
    },

    clearMessages: () => set({ errorMessage: null, noticeMessage: null }),
  };
});

function canWriteCloud(state: AuthState): boolean {
  return Boolean(state.session) && initialSyncComplete && !syncPaused;
}

function authErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message.toLowerCase() : '';
  if (raw.includes('invalid login credentials')) return '이메일 또는 비밀번호를 확인해주세요.';
  if (raw.includes('email not confirmed')) return '확인 메일의 링크를 누른 뒤 로그인해주세요.';
  if (raw.includes('already registered') || raw.includes('already been registered')) {
    return '이미 가입된 이메일이에요. 로그인으로 이어가주세요.';
  }
  if (raw.includes('password')) return '비밀번호는 6자 이상 입력해주세요.';
  if (raw.includes('rate limit')) return '요청이 많아요. 잠시 후 다시 시도해주세요.';
  return '계정 요청을 완료하지 못했어요. 연결을 확인하고 다시 시도해주세요.';
}
