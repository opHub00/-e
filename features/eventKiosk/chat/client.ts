import type { EventChatRequest, EventChatResponse } from './contract.ts';

function isResponse(value: unknown): value is EventChatResponse {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.text === 'string'
    && row.text.length > 0
    && (row.mode === 'llm' || row.mode === 'deterministic' || row.mode === 'fallback')
    && (row.detail === undefined || (Array.isArray(row.detail) && row.detail.every(item => typeof item === 'string')));
}

export async function requestEventChat(
  request: EventChatRequest,
  fetcher: typeof fetch = fetch,
  endpoint = '/event-api/chat',
): Promise<EventChatResponse | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(request),
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    return isResponse(body) ? body : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

