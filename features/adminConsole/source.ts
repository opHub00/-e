import { isDemoModeEnabled } from '../eventKiosk/demo/demoMode';
import type { ConsoleSnapshot, ConsoleSource } from './contract.ts';
import { CONSOLE_DEMO_SNAPSHOT } from './demoData.ts';

/** Transport port: the browser receives only a presentation snapshot after server authorization. */
export async function connectedSnapshot(accessToken: string, fetcher: typeof fetch = fetch): Promise<ConsoleSnapshot> {
  const response = await fetcher('/admin-api/product-v3', {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(response.status === 403 ? 'FORBIDDEN' : 'ADMIN_CONSOLE_UNAVAILABLE');
  return response.json() as Promise<ConsoleSnapshot>;
}

/** 예시 데이터는 Demo 빌드(또는 개발 서버) + ?demo=1 에서만. 운영 빌드에서는 열리지 않는다. */
export function consoleSource(demoParam: string | string[] | undefined, connected: ConsoleSnapshot | null = null): ConsoleSource {
  if (demoParam === '1' && isDemoModeEnabled()) return { status: 'DEMO', snapshot: CONSOLE_DEMO_SNAPSHOT };
  if (connected) return { status: 'CONNECTED', snapshot: connected };
  return { status: 'NOT_CONNECTED' };
}
