import { activeEventDataset } from '../../data/events/activeEvent.ts';
import { loadEvent, type LoadedEvent } from './eventConfig.ts';

/**
 * 행사 설정은 앱이 뜰 때 한 번 읽는다. 행사장에서는 네트워크가 불안정할 수 있어서
 * 설정과 판정 규칙을 앱 안에 함께 싣는다. 읽기에 실패하면 행사 화면이 그 사실을 크게 보여 준다.
 */
export type KioskEventLoad = { ok: true; event: LoadedEvent } | { ok: false; error: string };

let cached: KioskEventLoad | null = null;

export function kioskEvent(): KioskEventLoad {
  if (cached) return cached;
  try {
    cached = { ok: true, event: loadEvent(activeEventDataset) };
  } catch (error) {
    cached = { ok: false, error: error instanceof Error ? error.message : 'EVENT_LOAD_FAILED' };
  }
  return cached;
}
