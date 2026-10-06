import { useWindowDimensions } from 'react-native';
import { useAttached } from '../../adminPortal/useIsWide';

/**
 * 화면 폭. 정적으로 미리 그린 HTML 을 이어받기 전에는 0 이다.
 * 미리 그린 화면과 첫 화면이 같아야 React 가 통째로 다시 그리지 않는다(useIsWide 와 같은 이유).
 */
export function useKioskWidth(): number {
  const { width } = useWindowDimensions();
  return useAttached() ? width : 0;
}
