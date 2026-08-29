import { Platform, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { duration, easing, travel } from '../../design/motion';
import { Appear } from './Appear';

/**
 * push 로 열리는 stack 화면의 등장 모션.
 *
 * web 의 expo-router stack 은 화면 전환 계층 자체가 없다.
 * (`react-navigation/native-stack/views/NativeStackView.js` 웹 구현이 정적 View 라서
 *  `animation` / `animationDuration` 옵션이 무시된다.)
 * native 는 navigator 가 전환을 처리하므로 web 에서만 등장 모션을 준다.
 * 두 곳 모두에서 돌면 같은 화면에 animation 이 두 번 걸린다.
 */
const WEB = Platform.OS === 'web';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function ScreenEnter({ children, style }: Props) {
  if (!WEB) return <View style={[styles.fill, style]}>{children}</View>;
  return (
    <Appear
      distance={travel.stack}
      durationMs={duration.screen}
      easingFn={easing.standard}
      style={[styles.fill, style]}
    >
      {children}
    </Appear>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
