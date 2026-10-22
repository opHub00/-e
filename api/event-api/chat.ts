import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

type ChatModule = typeof import('../../features/eventKiosk/server/eventChat.ts');
type TelemetryModule = typeof import('../../features/productV3/admin/stagingTelemetry.ts');
type AnalyticsModule = typeof import('../../features/productV3/analytics/server.ts');
const nativeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>;

async function loadChatModule(): Promise<ChatModule> {
  return nativeImport(pathToFileURL(join(process.cwd(), 'features/eventKiosk/server/eventChat.ts')).href) as Promise<ChatModule>;
}

async function loadTelemetryModule(): Promise<TelemetryModule> {
  return nativeImport(pathToFileURL(join(process.cwd(), 'features/productV3/admin/stagingTelemetry.ts')).href) as Promise<TelemetryModule>;
}
async function loadAnalyticsModule(): Promise<AnalyticsModule> {
  return nativeImport(pathToFileURL(join(process.cwd(), 'features/productV3/analytics/server.ts')).href) as Promise<AnalyticsModule>;
}

type ApiRequest = {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
};
type ApiResponse = {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
};

function clientIp(request: ApiRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return value?.split(',')[0]?.trim() || request.socket?.remoteAddress || 'unknown';
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  const { handleEventChat } = await loadChatModule();
  const monitor = process.env.WANPANE_ENV === 'staging' && process.env.VERCEL_ENV !== 'production'
    ? (await loadTelemetryModule()).recordStagingAiTelemetry : null;
  const result = await handleEventChat({ method: request.method, body: request.body, headers: request.headers, ip: clientIp(request) },
    monitor ? { monitor: async record => {
      try { await monitor(record, process.env); } catch { /* Existing monitoring also must not block analytics. */ }
      if (!record.anonymousSessionId) return;
      try {
        const analytics = await loadAnalyticsModule();
        await analytics.recordAnalyticsBatch(record.noticeIds.slice(0, 1).flatMap(noticeId => {
          const value = analytics.serverEvent({ eventId: analytics.stableAnalyticsEventId(record.requestId, `${noticeId}:copilot`),
            anonymousSessionId: record.anonymousSessionId!, noticeId, eventType: 'COPILOT_USED', conversationTurnCount: record.conversationTurnCount,
            aiMode: record.mode, fallbackReason: record.mode === 'fallback' ? record.fallbackReason ?? 'unknown' : undefined }, process.env);
          return value ? [value] : [];
        }), process.env);
      } catch { /* Analytics must not affect the answer. */ }
    } } : {});
  response.status(result.status).json(result.body);
}

