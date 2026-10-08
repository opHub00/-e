import type { ReactNode } from 'react';
import { Appear } from '../../../components/motion/Appear';
import { eventMotion } from './eventMotion';
import { useFocusReplay } from './useFocusReplay';

/** 행사 화면 본문의 공통 진입. 살짝 떠오르며 나타난다. reduced motion 이면 opacity 만 짧게. */
export function ScreenReveal({ children }: { children: ReactNode }) {
  const replay = useFocusReplay();
  return (
    <Appear replayKey={replay} distance={eventMotion.screen.distance} durationMs={eventMotion.screen.duration} easingFn={eventMotion.screen.easing}>
      {children}
    </Appear>
  );
}
