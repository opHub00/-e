import type { ConsoleSnapshot } from '../contract.ts';
import { resolveProductV3StagingTarget } from '../../productV3/admin/stagingTarget.ts';
import { pageConsoleSnapshot, parseConsolePageQuery } from './pagination.ts';
import { parseMetricWindowQuery, type MetricWindowQuery } from './metrics.ts';
export { loadProductV3StagingSnapshot } from './stagingSnapshot.ts';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; query?: Record<string, unknown> };
type Reply = { status: number; body: unknown };
type AuthResult = 'admin' | 'reviewer' | 'UNAUTHENTICATED' | null;
export type ConsoleApiDependencies = {
  authorize: (token: string) => Promise<AuthResult>;
  loadSnapshot: (window?: MetricWindowQuery) => Promise<ConsoleSnapshot>;
  loadJejuCandidate?: () => Promise<unknown>;
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
  if (role === 'UNAUTHENTICATED') return { status: 401, body: { error: 'AUTH_REQUIRED' } };
  if (!role) return { status: 403, body: { error: 'FORBIDDEN' } };
  try {
    if (request.query?.reviewCandidate !== undefined) {
      if (request.query.reviewCandidate !== 'jeju-v2' || !dependencies.loadJejuCandidate)
        return { status: 400, body: { error: 'INVALID_REVIEW_CANDIDATE' } };
      return { status: 200, body: await dependencies.loadJejuCandidate() };
    }
    const metricRequested = request.query && ['from', 'to', 'bucket', 'previousPeriod'].some(key => key in request.query!);
    const metricWindow = metricRequested ? parseMetricWindowQuery(request.query!) : undefined;
    if (metricRequested && !metricWindow) return { status: 400, body: { error: 'INVALID_METRIC_WINDOW' } };
    const snapshot = await dependencies.loadSnapshot(metricWindow ?? undefined);
    if (request.query?.collection !== undefined) {
      const query = parseConsolePageQuery(request.query);
      return query ? { status: 200, body: pageConsoleSnapshot(snapshot, query) } : { status: 400, body: { error: 'INVALID_PAGE_QUERY' } };
    }
    return { status: 200, body: snapshot };
  }
  catch { return { status: 503, body: { error: 'ADMIN_STAGING_DATA_UNAVAILABLE' } }; }
}

/** Existing Supabase review-access RPC is the authority, using the caller's JWT. */
export async function authorizeProductV3Admin(token: string, env: Record<string, string | undefined>, fetcher: typeof fetch = fetch): Promise<AuthResult> {
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
