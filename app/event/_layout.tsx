import { Stack } from 'expo-router';
import { useCallback, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { kioskEvent } from '../../features/eventKiosk/kioskEvent';
import { IdleGuard } from '../../features/eventKiosk/ui/IdleGuard';
import { k } from '../../features/eventKiosk/ui/theme';

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
        <Text style={[k.type.bodyLg, { color: k.colors.textMuted }]}>행사 설정을 확인해 주세요.</Text>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: k.colors.background },
  error: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, backgroundColor: k.colors.background },
});
