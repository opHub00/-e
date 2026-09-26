/**
 * Admin 접근 판정.
 *
 * 인증은 기존 Supabase Auth 세션 하나를 그대로 쓴다. 관리자용 계정 저장소를 따로 두지 않는다.
 * 권한도 우리가 판단하지 않는다. 서버의 get_assessment_review_access 가 준 role 만 읽는다.
 * 이 파일이 하는 일은 "세션 있음/없음 × role" 을 화면이 쓰기 쉬운 한 가지 상태로 접는 것뿐이다.
 */
export type AdminRole = 'admin' | 'reviewer';

export type AdminAccess =
  /** 세션 확인 전. 화면은 로딩만 보여준다. */
  | { status: 'LOADING' }
  /** 로그인 자체가 없다. /admin/login 으로 보낸다. */
  | { status: 'SIGNED_OUT' }
  /** 로그인은 했지만 운영 권한이 없다. 일반 로그인 화면으로 되돌리지 않는다. */
  | { status: 'FORBIDDEN'; email: string | null }
  | { status: 'ALLOWED'; role: AdminRole; email: string | null }
  /** 권한 조회 자체가 실패했다. 권한 없음으로 단정하지 않는다. */
  | { status: 'ERROR'; code: string };

export type AccessInput = {
  authHydrated: boolean;
  session: { user?: { email?: string | null } | null } | null;
  /** get_assessment_review_access 결과. 아직 모르면 undefined. */
  role?: AdminRole | null;
  error?: string | null;
};

export function resolveAdminAccess(input: AccessInput): AdminAccess {
  if (!input.authHydrated) return { status: 'LOADING' };
  if (!input.session) return { status: 'SIGNED_OUT' };
  const email = input.session.user?.email ?? null;
  if (input.error) return { status: 'ERROR', code: input.error };
  if (input.role === undefined) return { status: 'LOADING' };
  if (input.role === 'admin' || input.role === 'reviewer') return { status: 'ALLOWED', role: input.role, email };
  return { status: 'FORBIDDEN', email };
}

export const ADMIN_ROLE_LABEL: Record<AdminRole, string> = {
  admin: '관리자',
  reviewer: '검수자',
};

/** 운영자가 바로 행동할 수 있는 말로 옮긴다. */
export const ADMIN_ACCESS_MESSAGE: Record<string, string> = {
  AUTH_REQUIRED: '관리자 계정으로 로그인해 주세요.',
  FORBIDDEN: '관리자 권한이 없는 계정입니다.',
  REVIEW_CONNECTION_REQUIRED: '서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',
  NETWORK: '네트워크에 연결되어 있지 않아요.',
};
export const adminAccessMessage = (code: string) => ADMIN_ACCESS_MESSAGE[code] ?? `권한을 확인하지 못했어요 (${code}).`;
