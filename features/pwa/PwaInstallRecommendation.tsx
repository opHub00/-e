import { MaterialIcons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '../../components/PrimaryButton';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { colors, radius, shadow, size, spacing, type } from '../../design/tokens';
import { usePwaInstallRecommendation } from '../../hooks/usePwaInstallRecommendation';

/**
 * Home가 보인 뒤 나타나는 최소 설치 추천 UI.
 * Claude UI branch가 같은 hook contract를 유지한 채 presentation만 교체할 수 있다.
 */
export function PwaInstallRecommendation() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const recommendation = usePwaInstallRecommendation({ enabled: pathname === '/home' });

  if (!recommendation.canRecommend) return null;
  const ios = recommendation.platform === 'ios-safari';

  return (
    <Modal
      animationType="fade"
      onRequestClose={recommendation.dismiss}
      statusBarTranslucent
      transparent
      visible
    >
      <View style={styles.stage}>
        <MotionPressable
          accessibilityLabel="앱 설치 추천 닫기"
          accessibilityRole="button"
          onPress={recommendation.dismiss}
          style={styles.scrim}
        />
        <View
          accessibilityViewIsModal
          testID="pwa-install-recommendation"
          style={[
            styles.card,
            { marginBottom: Math.max(insets.bottom, spacing.md) },
          ]}
        >
          <View style={styles.heading}>
            <View style={styles.icon}>
              <MaterialIcons name="install-mobile" size={22} color={colors.primary} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.title}>앱으로 설치하면 더 편해요</Text>
              <Text style={styles.body}>홈 화면에서 완판e를 바로 열 수 있어요.</Text>
            </View>
            <MotionPressable
              accessibilityLabel="설치 추천 닫기"
              accessibilityRole="button"
              hitSlop={8}
              onPress={recommendation.dismiss}
              style={styles.close}
            >
              <MaterialIcons name="close" size={20} color={colors.textMuted} />
            </MotionPressable>
          </View>

          {recommendation.showIosInstructions ? (
            <View accessibilityLiveRegion="polite" style={styles.iosHelp}>
              <MaterialIcons name="ios-share" size={19} color={colors.primary} />
              <Text style={styles.iosText}>
                Safari의 공유 버튼을 누른 뒤 ‘홈 화면에 추가’를 선택해 주세요.
              </Text>
            </View>
          ) : null}

          <PrimaryButton
            icon={ios ? 'ios-share' : 'install-mobile'}
            label={ios ? '홈 화면 추가 방법 보기' : '앱으로 설치하기'}
            loading={recommendation.isInstalling}
            onPress={() => void recommendation.install()}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: spacing.screen,
  },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(28,27,34,0.28)' },
  card: {
    width: '100%',
    maxWidth: 480,
    gap: spacing.md,
    borderRadius: radius.bento,
    backgroundColor: colors.surface,
    padding: spacing.md,
    ...shadow.floating,
  },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  icon: {
    width: size.touch,
    height: size.touch,
    borderRadius: radius.cardSm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lavender,
  },
  copy: { flex: 1, gap: 2 },
  title: { ...type.section, color: colors.text },
  body: { ...type.bodySm, color: colors.textMuted },
  close: {
    width: size.touch,
    height: size.touch,
    marginRight: -10,
    marginTop: -10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iosHelp: {
    minHeight: size.touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.cardSm,
    backgroundColor: colors.lavender,
    padding: 12,
  },
  iosText: { ...type.bodySm, color: colors.textMuted, flex: 1 },
});
