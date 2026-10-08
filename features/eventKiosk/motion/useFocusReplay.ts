import { useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

/**
 * 화면이 다시 보일 때마다 바뀌는 값. 웹의 stack 은 뒤로 가도 이전 화면을 다시 만들지 않아서
 * 진입 motion 이 재생되지 않는다. 이 값을 replayKey 로 넘기면 돌아왔을 때도 한 번 재생된다.
 */
export function useFocusReplay(): number {
  const focused = useIsFocused();
  const [key, setKey] = useState(0);
  const wasFocused = useRef(focused);
  useEffect(() => {
    if (focused && !wasFocused.current) setKey(value => value + 1);
    wasFocused.current = focused;
  }, [focused]);
  return key;
}
