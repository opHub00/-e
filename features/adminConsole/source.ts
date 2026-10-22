import { isDemoModeEnabled } from '../eventKiosk/demo/demoMode.ts';
import type { ConsoleSnapshot, ConsoleSource } from './contract.ts';
import { classifyResponse, ConsoleLoadError } from './consoleState.ts';
import { CONSOLE_DEMO_SNAPSHOT } from './demoData.ts';
import type { ConsoleAiEvent, ConsoleAuditEntry, ConsoleNotice } from './contract.ts';
import type { ConsolePage, ConsolePageQuery } from './server/pagination.ts';
import type { JejuV2CandidateView } from './reviewCandidateContract.ts';
import type { AnalyticsQuery, AnalyticsSummary } from '../productV3/analytics/contract.ts';
import { analyticsErrorCode, queryString, type AnalyticsErrorCode } from './analyticsModel.ts';

/** 응답이 이보다 늦으면 '연결 지연'으로 알린다. */
export const CONSOLE_REQUEST_TIMEOUT_MS = 15_000;

/**
 * Transport port: the browser receives only a presentation snapshot after server authorization.
 * 실패는 ConsoleLoadError(kind)로 던진다. 화면은 kind 로 로그인 필요·권한 없음·지연·서버 오류를 나눠 보여 준다.
 */
export async function connectedSnapshot(accessToken: string, fetcher: typeof fetch = fetch, timeoutMs = CONSOLE_REQUEST_TIMEOUT_MS): Promise<ConsoleSnapshot> {
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  let timedOut = false;
  const timer = controller ? setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs) : null;
  let response: Response;
  try {
    response = await fetcher('/admin-api/product-v3', {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal: controller?.signal,
    });
  } catch {
    throw new ConsoleLoadError(timedOut ? 'TIMEOUT' : 'NETWORK');
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new ConsoleLoadError(classifyResponse(response.status, body?.error ?? null), response.status);
  }
  return response.json() as Promise<ConsoleSnapshot>;
}

/** Reviewer-only candidate data; the server verifies the caller before reading repository artifacts. */
export async function connectedJejuV2Candidate(accessToken: string, fetcher: typeof fetch = fetch): Promise<JejuV2CandidateView> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONSOLE_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetcher('/admin-api/product-v3?reviewCandidate=jeju-v2', {
      headers: { authorization: `Bearer ${accessToken}` }, cache: 'no-store', signal: controller.signal,
    });
  } catch {
    throw new ConsoleLoadError(controller.signal.aborted ? 'TIMEOUT' : 'NETWORK');
  } finally { clearTimeout(timer); }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new ConsoleLoadError(classifyResponse(response.status, body?.error ?? null), response.status);
  }
  return response.json() as Promise<JejuV2CandidateView>;
}

/** Connected-only list transport. The server applies filters and returns at most 100 sanitized rows. */
export async function connectedPage(
  accessToken: string, query: ConsolePageQuery, fetcher: typeof fetch = fetch,
): Promise<ConsolePage<ConsoleAiEvent | ConsoleAuditEntry | ConsoleNotice>> {
  const params = new URLSearchParams({ collection: query.collection, cursor: query.cursor ?? '0', limit: String(query.limit ?? 25) });
  if (query.filter) params.set('filter', query.filter);
  if (query.search) params.set('search', query.search);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONSOLE_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetcher(`/admin-api/product-v3?${params}`, { headers: { authorization: `Bearer ${accessToken}` }, cache: 'no-store', signal: controller.signal });
  } catch {
    throw new ConsoleLoadError(controller.signal.aborted ? 'TIMEOUT' : 'NETWORK');
  } finally { clearTimeout(timer); }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new ConsoleLoadError(classifyResponse(response.status, body?.error ?? null), response.status);
  }
  return response.json() as Promise<ConsolePage<ConsoleAiEvent | ConsoleAuditEntry | ConsoleNotice>>;
}

/** 운영 지표 조회 실패. 서버의 안정 코드(ANALYTICS_*)를 그대로 들고 온다. */
export class AnalyticsLoadError extends Error {
  readonly code: AnalyticsErrorCode;
  readonly status: number | null;
  constructor(code: AnalyticsErrorCode, status: number | null = null) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

/** Admin-only analytics summary (Codex contract v2). Reviewer gets 403; the server validates the KST window again. */
export async function connectedAnalytics(accessToken: string, query: AnalyticsQuery, fetcher: typeof fetch = fetch): Promise<AnalyticsSummary> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONSOLE_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetcher(`/admin-api/product-v3?${queryString(query)}`, {
      headers: { authorization: `Bearer ${accessToken}` }, cache: 'no-store', signal: controller.signal,
    });
  } catch {
    throw new AnalyticsLoadError(analyticsErrorCode(null, null, controller.signal.aborted ? 'TIMEOUT' : 'NETWORK'));
  } finally { clearTimeout(timer); }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new AnalyticsLoadError(analyticsErrorCode(response.status, body?.error ?? null), response.status);
  }
  return response.json() as Promise<AnalyticsSummary>;
}

/** 예시 데이터는 Demo 빌드(또는 개발 서버) + ?demo=1 에서만. 운영 빌드에서는 열리지 않는다. */
export function consoleSource(demoParam: string | string[] | undefined, connected: ConsoleSnapshot | null = null): ConsoleSource {
  if (demoParam === '1' && isDemoModeEnabled()) return { status: 'DEMO', snapshot: CONSOLE_DEMO_SNAPSHOT };
  if (connected) return { status: 'CONNECTED', snapshot: connected };
  return { status: 'NOT_CONNECTED' };
}
