import { isDemoModeEnabled } from '../eventKiosk/demo/demoMode';
import type { ConsoleSnapshot, ConsoleSource } from './contract.ts';
import { CONSOLE_DEMO_SNAPSHOT } from './demoData.ts';

/**
 * 콘솔 데이터의 단일 연결 지점.
 * Codex 의 Admin backend / monitoring 계약이 생기면 connectedSnapshot() 만 바꾼다.
 * 지금은 연결된 데이터가 없어 null → 화면은 '연결 전'.
 */
export function connectedSnapshot(): ConsoleSnapshot | null {
  return null;
}

/** 예시 데이터는 Demo 빌드(또는 개발 서버) + ?demo=1 에서만. 운영 빌드에서는 열리지 않는다. */
export function consoleSource(demoParam: string | string[] | undefined): ConsoleSource {
  const connected = connectedSnapshot();
  if (connected) return { status: 'CONNECTED', snapshot: connected };
  if (demoParam === '1' && isDemoModeEnabled()) return { status: 'DEMO', snapshot: CONSOLE_DEMO_SNAPSHOT };
  return { status: 'NOT_CONNECTED' };
}
