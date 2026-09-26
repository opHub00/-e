import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '../auth/useAuthStore';
import { getSupabaseClient } from '../auth/supabaseClient';
import { normalizeReviewDbError } from '../assessmentRuleReview/repository/reviewDbErrorCodes';
import { resolveAdminAccess, type AdminAccess, type AdminRole } from './access';

/**
 * 기존 Supabase 세션 + 서버 role 조회를 한 가지 상태로 묶는다.
 *
 * 새 인증을 만들지 않는다. 세션은 useAuthStore 가 이미 들고 있고, 권한은 서버 RPC 가 판단한다.
 * 세션이 바뀌면(로그인·로그아웃) role 을 다시 묻는다.
 */
export function useAdminAccess(): AdminAccess & { refresh: () => void } {
  const authHydrated = useAuthStore(state => state.authHydrated);
  const session = useAuthStore(state => state.session);
  const userId = session?.user?.id ?? null;
  const [lookup, setLookup] = useState<{ userId: string | null; role?: AdminRole | null; error?: string }>({ userId: null });

  const load = useCallback(async (currentUserId: string) => {
    const client = getSupabaseClient();
    if (!client) { setLookup({ userId: currentUserId, error: 'REVIEW_CONNECTION_REQUIRED' }); return; }
    try {
      const { data, error } = await client.rpc('get_assessment_review_access');
      if (error) { setLookup({ userId: currentUserId, error: normalizeReviewDbError(error) }); return; }
      const role = typeof data === 'object' && data ? (data as { role?: unknown }).role : null;
      setLookup({ userId: currentUserId, role: role === 'admin' || role === 'reviewer' ? role : null });
    } catch (error) {
      setLookup({ userId: currentUserId, error: error instanceof Error ? error.message : 'REVIEW_CONNECTION_REQUIRED' });
    }
  }, []);

  useEffect(() => {
    if (!authHydrated) return;
    if (!userId) { setLookup({ userId: null }); return; }
    if (lookup.userId === userId) return;
    void load(userId);
  }, [authHydrated, userId, lookup.userId, load]);

  const fresh = lookup.userId === userId;
  const access = resolveAdminAccess({
    authHydrated,
    session,
    role: fresh ? lookup.role : undefined,
    error: fresh ? lookup.error ?? null : null,
  });
  return { ...access, refresh: () => { if (userId) void load(userId); } };
}
