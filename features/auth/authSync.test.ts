import { readFileSync } from 'node:fs';
import type { UserProfile } from '../../domain/types.ts';
import {
  createMinimalApplicantProfile,
  knownField,
  notApplicableField,
  type AmountRange,
} from '../profile/domain.ts';
import type { CloudSyncRepository } from './cloudRepository.ts';
import { buildInitialSyncPlan, readCloudSyncSnapshot } from './initialSync.ts';
import { mergeApplicantProfiles, mergeSavedListingIds } from './syncDomain.ts';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import {
  readPersistedSession,
  signInWithPassword,
  signOutLocal,
  signUpWithPassword,
} from './authClientAdapter.ts';
import { AUTH_SUCCESS_ROUTE, shouldNavigateAfterSignUp } from './authUx.ts';
import { shouldClearPrivateCacheForSession } from './authStorage.ts';

let checks = 0;
const check = (condition: unknown, message: string) => {
  checks += 1;
  if (!condition) throw new Error(`FAIL: ${message}`);
};

const fallback: UserProfile = {
  name: '완판이',
  age: 22,
  occupation: 'etc',
  region: '서울특별시',
  hasSubscriptionAccount: false,
  accountMonths: 0,
  monthlyPayment: 0,
  isNoHomeOwner: false,
};
const local = createMinimalApplicantProfile({
  name: '민지',
  age: 27,
  currentRegion: '서울특별시',
  preferredRegions: ['서울특별시', '부산광역시'],
});
const cloud = {
  ...createMinimalApplicantProfile({
    name: '민지',
    age: 27,
    currentRegion: '서울특별시',
    preferredRegions: ['서울특별시', '경기도'],
  }),
  subscriptionAccount: {
    hasAccount: knownField(true),
    accountMonths: knownField(24),
    monthlyPayment: knownField(100_000),
  },
  assets: {
    ...local.assets,
    vehicle: notApplicableField<AmountRange>(),
  },
};

const emptyCloudPlan = buildInitialSyncPlan({
  fallback,
  localProfileRaw: local,
  cloudProfile: null,
  localSavedListingIds: ['A'],
  cloudSavedListingIds: [],
});
check(emptyCloudPlan.writeProfileToCloud, '빈 cloud에는 기존 guest profile을 upload해야 한다');
check(emptyCloudPlan.profile?.basic.name === '민지', 'guest local profile을 잃으면 안 된다');
check(emptyCloudPlan.savedListingIds.join(',') === 'A', 'guest saved listing도 upload 대상이어야 한다');

const newDevicePlan = buildInitialSyncPlan({
  fallback,
  localProfileRaw: null,
  cloudProfile: { profileJson: cloud, schemaVersion: 2, updatedAt: '2026-09-05T00:00:00Z' },
  localSavedListingIds: null,
  cloudSavedListingIds: ['B'],
});
check(newDevicePlan.profile?.subscriptionAccount.hasAccount.status === 'known', '새 기기는 cloud profile을 복원');
check(!newDevicePlan.writeProfileToCloud, '새 기기 restore가 불필요한 cloud write를 만들면 안 된다');
check(newDevicePlan.savedListingIds.join(',') === 'B', '새 기기는 cloud saved listing을 복원');

const answeredMerge = mergeApplicantProfiles(local, cloud);
check(answeredMerge.conflictPaths.length === 0, 'unknown과 known 병합은 conflict가 아니다');
check(
  answeredMerge.profile.subscriptionAccount.accountMonths.status === 'known',
  'cloud known은 local unknown을 보완해야 한다',
);
check(
  answeredMerge.profile.assets.vehicle.status === 'not_applicable',
  'not_applicable semantics를 JSON merge에서 보존해야 한다',
);
check(
  answeredMerge.profile.preferences.regions.join(',') === '서울특별시,부산광역시,경기도',
  '관심지역은 손실 없이 union merge해야 한다',
);

const conflictingCloud = { ...cloud, basic: { ...cloud.basic, age: 31 } };
const conflict = mergeApplicantProfiles(local, conflictingCloud);
check(conflict.conflictPaths.includes('basic.age'), '서로 다른 확정값은 명시적 conflict여야 한다');
check(conflict.profile.basic.age === 27, 'conflict 감지 중 local 값을 조용히 덮어쓰면 안 된다');
check(
  mergeApplicantProfiles(local, conflictingCloud, 'cloud').profile.basic.age === 31,
  '사용자가 cloud를 선택하면 conflict field에 반영해야 한다',
);
check(
  mergeApplicantProfiles(local, conflictingCloud, 'local').profile.subscriptionAccount.hasAccount.status === 'known',
  'local 선택도 cloud-only known 정보는 보완해야 한다',
);

check(
  mergeSavedListingIds(['A', 'B'], ['B', 'C', null]).join(',') === 'A,B,C',
  'saved listing은 중복 없는 union merge여야 한다',
);

const malformedWithLocal = buildInitialSyncPlan({
  fallback,
  localProfileRaw: local,
  cloudProfile: { profileJson: { version: 2 }, schemaVersion: 2, updatedAt: 'bad' },
  localSavedListingIds: [],
  cloudSavedListingIds: [],
});
check(malformedWithLocal.malformedCloudProfile, 'malformed cloud profile을 감지해야 한다');
check(malformedWithLocal.writeProfileToCloud, '유효한 local이 있으면 malformed cloud를 안전하게 복구');
const malformedWithoutLocal = buildInitialSyncPlan({
  fallback,
  localProfileRaw: null,
  cloudProfile: { profileJson: { version: 2 }, schemaVersion: 2, updatedAt: 'bad' },
  localSavedListingIds: [],
  cloudSavedListingIds: [],
});
check(malformedWithoutLocal.profile === null, 'malformed cloud를 default profile로 위장하면 안 된다');

const failingRepository: CloudSyncRepository = {
  readProfile: async () => {
    throw new Error('offline');
  },
  writeProfile: async () => undefined,
  readSavedListingIds: async () => [],
  replaceSavedListingIds: async () => undefined,
};
let networkFailurePreserved = false;
try {
  await readCloudSyncSnapshot(failingRepository, 'user-1');
} catch {
  networkFailurePreserved = local.basic.name === '민지';
}
check(networkFailurePreserved, 'cloud network failure가 local profile을 변경하면 안 된다');

const sql = readFileSync(
  new URL('../../supabase/migrations/20260905091513_auth_cloud_profile_v1.sql', import.meta.url),
  'utf8',
);
check(sql.includes('enable row level security'), 'cloud tables는 RLS를 활성화해야 한다');
check((sql.match(/\(select auth\.uid\(\)\) = user_id/g) ?? []).length >= 8, '모든 CRUD policy는 auth.uid owner contract를 가져야 한다');
check(sql.includes('revoke all on table public.user_profiles from anon'), 'anon profile 접근을 명시적으로 제거');
check(sql.includes('to authenticated'), 'Data API 권한은 authenticated에만 명시적으로 부여');
check(!sql.toLowerCase().includes('service_role'), 'client schema에 service role 의존성이 없어야 한다');

const testSession = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  expires_in: 3600,
  token_type: 'bearer',
  user: { id: 'user-1', email: 'qa@example.com' },
} as Session;
const authCalls: Array<{ operation: string; payload?: unknown }> = [];
const fakeClient = {
  auth: {
    getSession: async () => {
      authCalls.push({ operation: 'getSession' });
      return { data: { session: testSession }, error: null };
    },
    signUp: async (payload: unknown) => {
      authCalls.push({ operation: 'signUp', payload });
      return { data: { user: null, session: null }, error: null };
    },
    signInWithPassword: async (payload: unknown) => {
      authCalls.push({ operation: 'signIn', payload });
      return { data: { user: testSession.user, session: testSession }, error: null };
    },
    signOut: async (payload: unknown) => {
      authCalls.push({ operation: 'signOut', payload });
      return { error: null };
    },
  },
} as unknown as SupabaseClient;

check(
  (await readPersistedSession(fakeClient))?.user.id === 'user-1',
  'persisted Supabase session을 hydration adapter가 복원해야 한다',
);
const signUpResult = await signUpWithPassword(
  fakeClient,
  '  qa@example.com  ',
  'password-123',
  'https://wanpan-e.vercel.app/auth',
);
check(signUpResult.needsEmailConfirmation, 'session 없는 signup은 이메일 확인 대기 상태여야 한다');
const signUpCall = authCalls.find((call) => call.operation === 'signUp')?.payload as {
  email: string;
  options?: { emailRedirectTo?: string };
};
check(signUpCall.email === 'qa@example.com', 'signup email은 trim한 뒤 Supabase에 전달');
check(
  signUpCall.options?.emailRedirectTo === 'https://wanpan-e.vercel.app/auth',
  'signup 확인 링크는 production origin의 auth route로 돌아와야 한다',
);
const immediateSessionClient = {
  auth: {
    signUp: async () => ({
      data: { user: testSession.user, session: testSession },
      error: null,
    }),
  },
} as unknown as SupabaseClient;
const immediateSignUp = await signUpWithPassword(
  immediateSessionClient,
  'qa@example.com',
  'password-123',
  'https://wanpan-e.vercel.app/auth',
);
check(!immediateSignUp.needsEmailConfirmation, '이메일 확인이 꺼진 signup은 즉시 session을 반환해야 한다');
check(immediateSignUp.session?.user.id === 'user-1', '즉시 signup session을 후속 cloud sync에 전달해야 한다');
check(
  shouldNavigateAfterSignUp(immediateSignUp.needsEmailConfirmation),
  '즉시 session signup은 성공 안내 뒤 Home으로 이동해야 한다',
);
check(
  !shouldNavigateAfterSignUp(signUpResult.needsEmailConfirmation),
  '이메일 확인 대기 signup은 Home으로 조기 이동하면 안 된다',
);
check(AUTH_SUCCESS_ROUTE === '/home', 'auth 성공 이동은 replace 가능한 Home route여야 한다');
check(
  (await signInWithPassword(fakeClient, ' qa@example.com ', 'password-123')).user.id === 'user-1',
  'email/password login은 반환된 session을 전달해야 한다',
);
await signOutLocal(fakeClient);
const signOutCall = authCalls.find((call) => call.operation === 'signOut')?.payload as {
  scope?: string;
};
check(signOutCall.scope === 'local', 'logout은 다른 기기 session을 끊지 않는 local scope여야 한다');
check(
  shouldClearPrivateCacheForSession('user-a', 'user-b'),
  '다른 계정 session으로 전환되면 이전 사용자의 private cache를 지워야 한다',
);
check(
  shouldClearPrivateCacheForSession('user-a', null),
  'owner marker만 남고 session이 없으면 shared-device cache를 지워야 한다',
);
check(
  !shouldClearPrivateCacheForSession('user-a', 'user-a'),
  '동일 계정 session 복원은 정상 local cache를 지우면 안 된다',
);

console.log(`features/auth/authSync: ${checks}개 검증 통과`);
