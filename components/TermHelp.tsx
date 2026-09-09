import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '../design/tokens';
import { Appear } from './motion/Appear';
import { MotionPressable } from './motion/MotionPressable';

export type TermHelpContent = { title: string; description: string };

type Props = { term: TermHelpContent };

/**
 * 용어 하나를 접었다 펴는 설명.
 *
 * `/profile` 의 Field 안에 있던 "이게 뭐예요?" 를 화면 밖에서도 쓸 수 있게
 * 표현만 떼어낸 것이다. 설명 문구 자체는 호출부가 넘긴다.
 */
export function TermHelp({ term }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.wrap}>
      <MotionPressable
        accessibilityRole="button"
        accessibilityLabel={`${term.title} 설명 ${open ? '닫기' : '보기'}`}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        hitSlop={8}
        onPress={() => setOpen((current) => !current)}
        style={styles.trigger}
      >
        <MaterialIcons name="info-outline" size={15} color={colors.primary} />
        <Text style={styles.triggerText}>이게 뭐예요?</Text>
      </MotionPressable>
      {open ? (
        <Appear distance={0} style={styles.card}>
          <Text style={styles.title}>{term.title}</Text>
          <Text style={styles.body}>{term.description}</Text>
        </Appear>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs, marginTop: spacing.xs },
  trigger: {
    minHeight: 44,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.lavender,
  },
  triggerText: { ...type.micro, color: colors.primary },
  card: {
    borderRadius: radius.cardSm,
    backgroundColor: colors.surfaceLow,
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
    padding: 12,
    gap: 4,
  },
  title: { ...type.bodySmStrong, color: colors.text },
  body: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
});
