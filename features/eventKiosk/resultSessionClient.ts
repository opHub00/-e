import type { ResultSummary } from './summary.ts';

export type ResultSessionResponse = {
  token: string;
  expiresAt: string;
  url: string;
};

const TOKEN = /^[a-f0-9]{64}$/;

export function isOpaqueResultToken(value: string): boolean {
  return TOKEN.test(value);
}

export function assertOpaqueResultUrl(value: string, expectedToken?: string): void {
  const url = new URL(value);
  const token = url.searchParams.get('token') ?? '';
  if (url.hash || [...url.searchParams.keys()].some(key => key !== 'token') || !isOpaqueResultToken(token)) {
    throw new Error('RESULT_SESSION_URL_INVALID');
  }
  if (expectedToken && token !== expectedToken) throw new Error('RESULT_SESSION_URL_TOKEN_MISMATCH');
  if (url.pathname !== '/event/take') throw new Error('RESULT_SESSION_URL_INVALID');
}

export async function createResultSession(baseUrl: string, summary: ResultSummary, fetcher: typeof fetch = fetch): Promise<ResultSessionResponse> {
  const endpoint = new URL('/event-api/result-sessions', baseUrl);
  const response = await fetcher(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ summary }),
  });
  if (!response.ok) throw new Error(`RESULT_SESSION_CREATE_FAILED:${response.status}`);
  const body = await response.json() as ResultSessionResponse;
  if (!isOpaqueResultToken(body.token)) throw new Error('RESULT_SESSION_TOKEN_INVALID');
  if (!Number.isFinite(Date.parse(body.expiresAt))) throw new Error('RESULT_SESSION_EXPIRY_INVALID');
  assertOpaqueResultUrl(body.url, body.token);
  return body;
}

export async function readResultSession(baseUrl: string, token: string, fetcher: typeof fetch = fetch): Promise<ResultSummary | null> {
  if (!isOpaqueResultToken(token)) return null;
  const response = await fetcher(new URL(`/event-api/result-sessions/${token}`, baseUrl), { cache: 'no-store' });
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) throw new Error(`RESULT_SESSION_READ_FAILED:${response.status}`);
  const body = await response.json() as { summary?: ResultSummary };
  return body.summary?.v === 1 ? body.summary : null;
}
