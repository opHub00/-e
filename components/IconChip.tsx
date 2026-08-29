import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { radius, tint } from '../design/tokens';

type Props = {
  name: React.ComponentProps<typeof MaterialIcons>['name'];
  tone: keyof typeof tint;
  size?: 'sm' | 'md';
};

/** Stitch 카드 좌상단의 tint 아이콘 칩. 배경 옅게 + 글리프 진하게. */
export function IconChip({ name, tone, size = 'sm' }: Props) {
  const box = size === 'md' ? 48 : 36;
  const glyph = size === 'md' ? 24 : 20;

  return (
    <View
      style={[
        styles.chip,
        { width: box, height: box, borderRadius: box / 2, backgroundColor: tint[tone].bg },
      ]}
    >
      <MaterialIcons name={name} size={glyph} color={tint[tone].fg} />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
});
