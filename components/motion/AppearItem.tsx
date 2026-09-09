import type { StyleProp, ViewStyle } from 'react-native';
import { listReveal, travel } from '../../design/motion';
import { Appear } from './Appear';

type Props = {
  children: React.ReactNode;
  /** 목록에서의 순서. 0부터. */
  index: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * 목록 항목의 등장.
 *
 * 첫 화면에 보이는 `listReveal.count` 개까지만 계단을 두고,
 * 그 뒤 항목은 Animated.View 조차 만들지 않고 그대로 그린다.
 * 100개짜리 목록 전체에 Animated.Value 를 붙이면 스크롤이 무거워지고,
 * 스크롤로 들어오는 항목이 하나씩 튀면 읽기도 어렵다.
 *
 * 화면 진입에서 한 번만 재생된다. 스크롤은 재생 조건이 아니다.
 */
export function AppearItem({ children, index, distance = travel.sm, style }: Props) {
  if (index >= listReveal.count) return <>{children}</>;

  return (
    <Appear delay={index * listReveal.step} distance={distance} style={style}>
      {children}
    </Appear>
  );
}
