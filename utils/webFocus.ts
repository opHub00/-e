import { Keyboard, Platform } from 'react-native';

/**
 * React Navigation이 비활성 화면에 aria-hidden을 적용하기 전에 입력/버튼 focus를 해제한다.
 * Native에서는 키보드만 닫고, Web에서만 DOM activeElement를 다룬다.
 */
export function dismissActiveFocus() {
  Keyboard.dismiss();
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;

  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) active.blur();
}

/** Modal이 열린 뒤 첫 컨트롤로, 닫힌 뒤 트리거로 focus를 이동한다. */
export function focusWebElementOnNextFrame(nativeId: string) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.requestAnimationFrame(() => {
    document.getElementById(nativeId)?.focus();
  });
}

