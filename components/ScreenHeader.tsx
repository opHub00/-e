import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, size, spacing, type } from '../design/tokens';
import { MotionPressable } from './motion/MotionPressable';

type Props = {
  title: string;
  onBack: () => void;
  eyebrow?: string;
};

/** Visual V2 내부 화면의 작고 일관된 상단 바. SafeArea 안에서 사용한다. */
export function ScreenHeader({ title, onBack, eyebrow }: Props) {
  return (
    <View style={styles.header}>
      <MotionPressable
        accessibilityRole="button"
        accessibilityLabel="뒤로 가기"
        onPress={onBack}
        style={styles.back}
      >
        <MaterialIcons name="arrow-back-ios-new" size={20} color={colors.text} />
      </MotionPressable>
      <View style={styles.copy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.balance} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.screen,
    backgroundColor: colors.background,
  },
  back: {
    width: size.touch,
    height: size.touch,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -12,
  },
  copy: { flex: 1, alignItems: 'center' },
  eyebrow: { ...type.caption, color: colors.primary },
  title: { ...type.cardTitle, color: colors.text },
  balance: { width: 32 },
});
