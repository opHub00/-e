import { resolveProductV3StagingTarget } from './stagingTarget.ts';

export type ProductV3AdminAuthResult = 'admin' | 'reviewer' | 'UNAUTHENTICATED' | null;

/** Existing Supabase review-access RPC is the authority, using the caller's JWT. */
export async function authorizeProductV3Admin(token: string, env: Record<string, string | undefined>, fetcher: typeof fetch = fetch): Promise<ProductV3AdminAuthResult> {
  const target = resolveProductV3StagingTarget(env, false);
  const response = await fetcher(new URL('/rest/v1/rpc/get_assessment_review_access', target.url), {
    method: 'POST', headers: { apikey: target.anonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}',
    signal: AbortSignal.timeout(6000),
  });
  if (response.status === 401) return 'UNAUTHENTICATED';
  if (response.status === 403) return null;
  if (!response.ok) throw new Error('ADMIN_AUTH_UNAVAILABLE');
  const data: unknown = await response.json();
  const role = data && typeof data === 'object' ? (data as { role?: unknown }).role : null;
  return role === 'admin' || role === 'reviewer' ? role : null;
}
