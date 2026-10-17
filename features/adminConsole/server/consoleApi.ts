import type { ConsoleSnapshot } from '../contract.ts';
import { resolveProductV3StagingTarget } from '../../productV3/admin/stagingTarget.ts';
export { loadProductV3StagingSnapshot } from './stagingSnapshot.ts';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined> };
type Reply = { status: number; body: unknown };
type AuthResult = 'admin' | 'reviewer' | null;
export type ConsoleApiDependencies = {
  authorize: (token: string) => Promise<AuthResult>;
  loadSnapshot: () => Promise<ConsoleSnapshot>;
};

/** Only read operations are exposed. Authorization is checked again on the server. */
export async function handleProductV3ConsoleRequest(request: Request, dependencies: ConsoleApiDependencies): Promise<Reply> {
  if (request.method !== 'GET') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
  const header = request.headers?.authorization;
  const bearer = Array.isArray(header) ? header[0] : header;
  const token = /^Bearer ([A-Za-z0-9._-]+)$/.exec(bearer ?? '')?.[1];
  if (!token) return { status: 401, body: { error: 'AUTH_REQUIRED' } };
  let role: AuthResult;
  try { role = await dependencies.authorize(token); }
  catch { return { status: 503, body: { error: 'ADMIN_AUTH_UNAVAILABLE' } }; }
  if (!role) return { status: 403, body: { error: 'FORBIDDEN' } };
  try { return { status: 200, body: await dependencies.loadSnapshot() }; }
  catch { return { status: 503, body: { error: 'ADMIN_STAGING_DATA_UNAVAILABLE' } }; }
}

/** Existing Supabase review-access RPC is the authority, using the caller's JWT. */
export async function authorizeProductV3Admin(token: string, env: Record<string, string | undefined>, fetcher: typeof fetch = fetch): Promise<AuthResult> {
  const target = resolveProductV3StagingTarget(env, false);
  const response = await fetcher(new URL('/rest/v1/rpc/get_assessment_review_access', target.url), {
    method: 'POST', headers: { apikey: target.anonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}',
    signal: AbortSignal.timeout(6000),
  });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error('ADMIN_AUTH_UNAVAILABLE');
  const data: unknown = await response.json();
  const role = data && typeof data === 'object' ? (data as { role?: unknown }).role : null;
  return role === 'admin' || role === 'reviewer' ? role : null;
}
