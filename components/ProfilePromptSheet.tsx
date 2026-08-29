import { MaterialIcons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadow, spacing, type } from '../design/tokens';
import { PROFILE_BUNDLES, type ProfileQuestionBundleId } from '../features/profile/domain';
import { Appear } from './motion/Appear';
import { MotionPressable } from './motion/MotionPressable';

type Props = {
  bundleId: ProfileQuestionBundleId | null;
  onEdit: (bundleId: ProfileQuestionBundleId) => void;
  onLater: (bundleId: ProfileQuestionBundleId) => void;
};

export function ProfilePromptSheet({ bundleId, onEdit, onLater }: Props) {
  const insets = useSafeAreaInsets();
  const bundle = PROFILE_BUNDLES.find((item) => item.id === bundleId);
  if (!bundle || !bundleId) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => onLater(bundleId)}>
      <View style={styles.layer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="나중에 입력하기"
          style={styles.scrim}
          onPress={() => onLater(bundleId)}
        />
        <Appear
          replayKey={bundleId}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}
        >
          <View style={styles.handle} />
          <View style={styles.icon}>
            <MaterialIcons name="badge" size={22} color={colors.primary} />
          </View>
          <Text style={styles.eyebrow}>왜 필요한가요?</Text>
          <Text style={styles.title}>{bundle.title}를 확인하면 더 정확해져요</Text>
          <Text style={styles.body}>{bundle.reason}</Text>
          <View style={styles.countPill}>
            <MaterialIcons name="schedule" size={14} color={colors.textMuted} />
            <Text style={styles.countText}>질문 {bundle.estimatedQuestionCount}개 · 나중에 수정 가능</Text>
          </View>
          <MotionPressable
            accessibilityRole="button"
            onPress={() => onEdit(bundleId)}
            style={styles.primary}
          >
            <Text style={styles.primaryText}>지금 입력하기</Text>
          </MotionPressable>
          <MotionPressable
            accessibilityRole="button"
            onPress={() => onLater(bundleId)}
            style={styles.later}
          >
            <Text style={styles.laterText}>나중에</Text>
          </MotionPressable>
        </Appear>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  layer: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(19, 18, 31, 0.38)' },
  sheet: {
    borderTopLeftRadius: radius.bento,
    borderTopRightRadius: radius.bento,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.screen,
    paddingTop: 10,
    gap: spacing.sm,
    ...shadow.floating,
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceHighest,
    marginBottom: spacing.sm,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lavender,
  },
  eyebrow: { ...type.micro, color: colors.primary, letterSpacing: 0.5 },
  title: { ...type.title, color: colors.text, letterSpacing: -0.5 },
  body: { ...type.bodySm, color: colors.textMuted, lineHeight: 22 },
  countPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainer,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: spacing.xs,
  },
  countText: { ...type.caption, color: colors.textMuted },
  primary: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    backgroundColor: colors.primary,
  },
  primaryText: { ...type.bodyLgStrong, color: colors.onPrimary },
  later: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  laterText: { ...type.bodySmStrong, color: colors.textMuted },
});
