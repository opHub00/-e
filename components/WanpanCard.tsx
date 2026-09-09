import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../design/tokens';

type Props = PropsWithChildren<{
  tone?: 'surface' | 'lavender';
  style?: ViewStyle;
}>;

/**
 * 기본 카드 표면. 깊이는 그림자가 아니라 1px 테두리와 톤으로 만든다.
 *
 * 테두리는 surfaceHigh 다. outline 은 입력창·외곽선 버튼처럼
 * 눌리는 컨트롤을 위한 값이라 카드에 쓰면 화면에서 혼자 진하게 뜬다.
 * 이 컴포넌트가 오래 쓰이지 않은 원인도 그것이었다.
 */
export function WanpanCard({ children, tone = 'surface', style }: Props) {
  return <View style={[styles.card, tone === 'lavender' && styles.lavender, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
    padding: spacing.md,
  },
  lavender: {
    backgroundColor: colors.lavender,
    borderColor: colors.primaryFixed,
  },
});
