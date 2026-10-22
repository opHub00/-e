import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { anonymousAnalyticsSessionId, beginAnalyticsSession, clearAnalyticsSession, trackEventAnalytics } from './analyticsClient.ts';

test('browser analytics uses a memory-only random session and sends no fact values or QR token', async () => {
  const oldWindow = (globalThis as { window?: unknown }).window;
  const oldFetch = globalThis.fetch;
  const payloads: Array<Record<string, unknown>> = [];
  (globalThis as { window?: unknown }).window = {};
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    payloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  try {
    beginAnalyticsSession();
    const first = anonymousAnalyticsSessionId();
    assert.match(first ?? '', /^[0-9a-f-]{36}$/);
    beginAnalyticsSession();
    trackEventAnalytics('FACT_MARKED_UNKNOWN');
    trackEventAnalytics('QR_CREATED', { noticeId: 'samdo-1' });
    clearAnalyticsSession();
    assert.equal(payloads.filter(row => row.eventType === 'SESSION_STARTED').length, 2);
    assert.equal(payloads.filter(row => row.eventType === 'QR_CREATED').length, 1);
    assert.equal(payloads.filter(row => row.eventType === 'SESSION_COMPLETED').length, 2);
    assert.equal(JSON.stringify(payloads).includes('factKey'), false);
    assert.equal(JSON.stringify(payloads).includes('qrToken'), false);
    assert.equal(anonymousAnalyticsSessionId() === first, false);
  } finally {
    clearAnalyticsSession();
    globalThis.fetch = oldFetch;
    (globalThis as { window?: unknown }).window = oldWindow;
  }
});
