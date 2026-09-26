import { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';

/**
 * 넓은 화면인가.
 *
 * 화면 폭으로 **구조**를 바꾸는 곳에서만 쓴다(사이드바 ↔ 서랍, 표 ↔ 카드).
 * 웹은 정적으로 미리 그려 둔 HTML 을 브라우저가 이어받는다. 그때 미리 그린 것과
 * 브라우저가 처음 그린 것이 다르면 React 가 통째로 다시 그리고 콘솔에 오류를 남긴다.
 *
 * 그래서 첫 렌더는 항상 좁은 화면으로 맞추고, 붙은 뒤에 실제 폭을 반영한다.
 * 여백이나 열 수처럼 구조가 아닌 값은 이 훅 없이 폭을 바로 써도 된다.
 */
export function useIsWide(breakpoint: number): boolean {
  const { width } = useWindowDimensions();
  const attached = useAttached();
  return attached && width >= breakpoint;
}

/**
 * 브라우저가 미리 그려 둔 화면을 이어받았는가.
 *
 * 주소의 일부를 읽어 내용을 정하는 화면(`/admin/scoring/[id]`)에 쓴다.
 * 미리 그릴 때는 그 값이 없어서, 이어받는 순간 내용이 달라져 같은 오류가 난다.
 * 그래서 이어받기 전에는 자리만 잡아 두고, 붙은 뒤에 실제 내용을 그린다.
 */
export function useAttached(): boolean {
  const [attached, setAttached] = useState(false);
  useEffect(() => setAttached(true), []);
  return attached;
}
