import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

type ChatModule = typeof import('../../features/eventKiosk/server/eventChat.ts');
const nativeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>;

async function loadChatModule(): Promise<ChatModule> {
  return nativeImport(pathToFileURL(join(process.cwd(), 'features/eventKiosk/server/eventChat.ts')).href) as Promise<ChatModule>;
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
  const result = await handleEventChat({ method: request.method, body: request.body, headers: request.headers, ip: clientIp(request) });
  response.status(result.status).json(result.body);
}

