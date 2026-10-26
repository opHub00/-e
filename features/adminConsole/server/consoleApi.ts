import type { ConsoleSnapshot } from '../contract.ts';
export { authorizeProductV3Admin } from '../../productV3/admin/auth.ts';
import { pageConsoleSnapshot, parseConsolePageQuery } from './pagination.ts';
import { parseMetricWindowQuery, type MetricWindowQuery } from './metrics.ts';
import { parseAnalyticsQuery } from '../../productV3/analytics/core.ts';
import type { AnalyticsGlobalCollectionStatus, AnalyticsQuery, AnalyticsSummary } from '../../productV3/analytics/contract.ts';
export { loadProductV3StagingSnapshot } from './stagingSnapshot.ts';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; query?: Record<string, unknown> };
type Reply = { status: number; body: unknown };
type AuthResult = 'admin' | 'reviewer' | 'UNAUTHENTICATED' | null;
export type ConsoleApiDependencies = {
  authorize: (token: string) => Promise<AuthResult>;
  loadSnapshot: (window?: MetricWindowQuery, includeAnalytics?: boolean) => Promise<ConsoleSnapshot>;
  loadAnalytics?: (query: AnalyticsQuery) => Promise<AnalyticsSummary>;
  loadAnalyticsStatus?: () => Promise<AnalyticsGlobalCollectionStatus>;
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
  catch { return { status: 503, body: { error: request.query?.analytics !== undefined ? 'ANALYTICS_AUTH_UNAVAILABLE' : 'ADMIN_AUTH_UNAVAILABLE' } }; }
  if (role === 'UNAUTHENTICATED') return { status: 401, body: { error: 'AUTH_REQUIRED' } };
  if (!role) return { status: 403, body: { error: 'FORBIDDEN' } };
  try {
    if (request.query?.analytics !== undefined) {
      if (role !== 'admin') return { status: 403, body: { error: 'FORBIDDEN' } };
      if (request.query.analytics === 'status')
        return dependencies.loadAnalyticsStatus ? { status: 200, body: await dependencies.loadAnalyticsStatus() }
          : { status: 503, body: { error: 'ANALYTICS_READ_FAILED' } };
      if (request.query.analytics !== 'summary' || !dependencies.loadAnalytics) return { status: 400, body: { error: 'INVALID_ANALYTICS_QUERY' } };
      const query = parseAnalyticsQuery(request.query);
      return query ? { status: 200, body: await dependencies.loadAnalytics(query) } : { status: 400, body: { error: 'INVALID_ANALYTICS_QUERY' } };
    }
    if (request.query?.reviewCandidate !== undefined) {
      if (request.query.reviewCandidate !== 'jeju-v2' || !dependencies.loadJejuCandidate)
        return { status: 400, body: { error: 'INVALID_REVIEW_CANDIDATE' } };
      return { status: 200, body: await dependencies.loadJejuCandidate() };
    }
    const metricRequested = request.query && ['from', 'to', 'bucket', 'previousPeriod'].some(key => key in request.query!);
    const metricWindow = metricRequested ? parseMetricWindowQuery(request.query!) : undefined;
    if (metricRequested && !metricWindow) return { status: 400, body: { error: 'INVALID_METRIC_WINDOW' } };
    const snapshot = await dependencies.loadSnapshot(metricWindow ?? undefined, role === 'admin');
    if (request.query?.collection !== undefined) {
      const query = parseConsolePageQuery(request.query);
      return query ? { status: 200, body: pageConsoleSnapshot(snapshot, query) } : { status: 400, body: { error: 'INVALID_PAGE_QUERY' } };
    }
    return { status: 200, body: snapshot };
  }
  catch (error) {
    if (request.query?.analytics !== undefined) {
      const code = error instanceof Error ? error.message : '';
      return { status: 503, body: { error: ['ANALYTICS_SCHEMA_NOT_READY', 'ANALYTICS_READ_FAILED', 'ANALYTICS_AUTH_UNAVAILABLE', 'ANALYTICS_TIMEOUT'].includes(code)
        ? code : 'ANALYTICS_READ_FAILED' } };
    }
    return { status: 503, body: { error: 'ADMIN_STAGING_DATA_UNAVAILABLE' } };
  }
}
