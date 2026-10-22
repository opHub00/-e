import type { AnalyticsEventType } from '../productV3/analytics/contract.ts';

/** Memory-only random session identity. Refresh/reset never restores it. */
let sessionId: string | null = null;
let startedAt = 0;
let started = false;
const noticeIds = ['samdo-1', 'samdo-2'] as const;

export function anonymousAnalyticsSessionId(): string | null {
  if (typeof window === 'undefined' || !globalThis.crypto?.randomUUID) return null;
  if (!sessionId) { sessionId = globalThis.crypto.randomUUID(); startedAt = Date.now(); }
  return sessionId;
}

export function trackEventAnalytics(eventType: AnalyticsEventType, options: { noticeId?: string; conversationTurnCount?: number } = {}): void {
  const id = anonymousAnalyticsSessionId();
  if (!id) return;
  if (!started && eventType !== 'SESSION_STARTED') { started = true; trackEventAnalytics('SESSION_STARTED'); }
  const targets = options.noticeId ? [options.noticeId] : [...noticeIds];
  for (const noticeId of targets) {
    const payload = { eventId: globalThis.crypto.randomUUID(), anonymousSessionId: id, noticeId, eventType,
      ...(eventType === 'COPILOT_USED' ? { conversationTurnCount: Math.max(0, Math.min(100, options.conversationTurnCount ?? 0)) } : {}),
      ...(eventType === 'SESSION_COMPLETED' ? { durationBucket: durationBucket(Date.now() - startedAt) } : {}) };
    void fetch('/event-api/analytics', { method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store', body: JSON.stringify(payload) }).catch(() => undefined);
  }
}

export function beginAnalyticsSession(): void {
  if (started) return;
  started = true;
  trackEventAnalytics('SESSION_STARTED');
}

export function clearAnalyticsSession(): void {
  if (started) trackEventAnalytics('SESSION_COMPLETED');
  sessionId = null; startedAt = 0; started = false;
}

const durationBucket = (milliseconds: number) => milliseconds < 60_000 ? 'under_1m' : milliseconds < 180_000 ? '1_to_3m'
  : milliseconds < 600_000 ? '3_to_10m' : 'over_10m';
