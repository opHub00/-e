import { isDemoModeEnabled } from '../eventKiosk/demo/demoMode.ts';
import type { ConsoleSnapshot, ConsoleSource } from './contract.ts';
import { classifyResponse, ConsoleLoadError } from './consoleState.ts';
import { CONSOLE_DEMO_SNAPSHOT } from './demoData.ts';

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

/** 예시 데이터는 Demo 빌드(또는 개발 서버) + ?demo=1 에서만. 운영 빌드에서는 열리지 않는다. */
export function consoleSource(demoParam: string | string[] | undefined, connected: ConsoleSnapshot | null = null): ConsoleSource {
  if (demoParam === '1' && isDemoModeEnabled()) return { status: 'DEMO', snapshot: CONSOLE_DEMO_SNAPSHOT };
  if (connected) return { status: 'CONNECTED', snapshot: connected };
  return { status: 'NOT_CONNECTED' };
}
