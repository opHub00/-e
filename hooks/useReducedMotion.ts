import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * 사용자가 모션 최소화를 켜두었는지.
 * web 은 prefers-reduced-motion, native 는 AccessibilityInfo 를 본다.
 * 값을 못 읽으면 false 로 두어 앱이 애니메이션 완료에 의존하지 않게 한다.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    Platform.OS === 'web' && typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );

  useEffect(() => {
    let alive = true;

    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || !window.matchMedia) return;
      const query = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReduced(query.matches);
      const onChange = (event: MediaQueryListEvent) => alive && setReduced(event.matches);
      query.addEventListener?.('change', onChange);
      return () => {
        alive = false;
        query.removeEventListener?.('change', onChange);
      };
    }

    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((value) => alive && setReduced(Boolean(value)))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value) =>
      alive ? setReduced(Boolean(value)) : undefined,
    );
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);

  return reduced;
}
