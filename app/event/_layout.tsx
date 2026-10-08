import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { useCallback, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { kioskEvent } from '../../features/eventKiosk/kioskEvent';
import { IdleGuard } from '../../features/eventKiosk/ui/IdleGuard';
import { k } from '../../features/eventKiosk/ui/theme';
import { KioskButton } from '../../features/eventKiosk/ui/controls';
import { resetToHome } from '../../features/eventKiosk/ui/navigation';
import { useKioskStore } from '../../features/eventKiosk/useKioskStore';

/**
 * 행사 체험 화면 묶음. 일반 앱 화면과 저장소·내비게이션을 공유하지 않는다.
 */
export default function EventLayout() {
  const load = kioskEvent();
  const touchRef = useRef<(() => void) | null>(null);
  const register = useCallback((touch: () => void) => { touchRef.current = touch; }, []);

  if (!load.ok) {
    return (
      <View style={styles.error} accessibilityRole="alert">
        <Text style={k.type.title}>행사 화면을 준비하지 못했어요</Text>
        <Text style={[k.type.bodyLg, { color: k.colors.textMuted }]}>잠시 후 다시 시도해 주세요. 계속되면 행사 안내 직원에게 알려 주세요.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root} onTouchStart={() => touchRef.current?.()}>
      <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: k.colors.background } }} />
      <IdleGuard
        resetSeconds={load.event.config.idleResetSeconds}
        warningSeconds={load.event.config.idleWarningSeconds}
        onActivityRef={register}
      />
    </View>
  );
}

/**
 * 행사 화면 어디서든 예상하지 못한 데이터로 화면이 깨지면 여기로 온다.
 * 개발자용 오류 문구는 보여 주지 않고, 방문자가 할 수 있는 두 가지만 남긴다.
 */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.error} accessibilityRole="alert" testID="event-error-boundary">
      <Text style={[k.type.title, { textAlign: 'center' }]}>화면을 표시하는 중에 문제가 생겼어요</Text>
      <Text style={[k.type.bodyLg, { color: k.colors.textMuted, textAlign: 'center' }]}>
        다시 시도하거나 처음 화면으로 돌아가 주세요. 처음 화면으로 가면 입력한 정보는 모두 지워져요.
      </Text>
      <View style={styles.actions}>
        <KioskButton label="다시 시도" variant="soft" icon="refresh" onPress={() => void retry()} />
        <KioskButton
          label="처음 화면으로"
          icon="home"
          onPress={() => {
            useKioskStore.getState().reset();
            void retry();
            resetToHome();
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: k.colors.background },
  error: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, backgroundColor: k.colors.background },
  actions: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 12 },
});
