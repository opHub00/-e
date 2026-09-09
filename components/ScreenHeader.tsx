import { StyleSheet, Text, View } from 'react-native';
import { colors, size, spacing, type } from '../design/tokens';
import { BackButton } from './BackButton';

type Props = {
  title: string;
  onBack: () => void;
};

/** 내부 화면의 작고 일관된 상단 바. SafeArea 안에서 사용한다. */
export function ScreenHeader({ title, onBack }: Props) {
  return (
    <View style={styles.header}>
      <BackButton onPress={onBack} />
      <View style={styles.copy}>
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
  copy: { flex: 1, alignItems: 'center' },
  title: { ...type.cardTitle, color: colors.text },
  /** 좌측 BackButton 과 같은 폭을 둬서 title 이 실제 중앙에 온다. */
  balance: { width: size.iconButton },
});
