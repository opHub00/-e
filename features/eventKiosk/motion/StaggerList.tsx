import { Children, isValidElement, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Appear } from '../../../components/motion/Appear';
import { AppearItem } from '../../../components/motion/AppearItem';
import { useFocusReplay } from './useFocusReplay';

/**
 * 목록 항목을 순서대로 보여 준다. 계단은 AppearItem 이 맡아 처음 몇 개만 움직이고 나머지는 그대로 그린다.
 * `after` 만큼 기다렸다가 시작해 위의 요약이 먼저 보이게 할 수 있다.
 * 목록의 배치(style)와 testID 는 안쪽 View 가 그대로 받는다.
 */
export function StaggerList({ children, style, itemStyle, after = 0, testID }: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 카드가 flex 로 폭을 나누는 목록이면, 감싸는 Animated.View 도 카드와 같은 몫을 가져야 줄이 깨지지 않는다. */
  itemStyle?: StyleProp<ViewStyle>;
  after?: number;
  testID?: string;
}) {
  const replay = useFocusReplay();
  const items = Children.toArray(children);
  return (
    <Appear delay={after} distance={0} replayKey={replay}>
      <View style={style} testID={testID}>
        {items.map((child, position) => (
          <AppearItem key={isValidElement(child) && child.key !== null ? child.key : position} index={position} style={itemStyle}>
            {child}
          </AppearItem>
        ))}
      </View>
    </Appear>
  );
}
