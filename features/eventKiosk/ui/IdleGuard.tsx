import { usePathname } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { KioskButton } from './controls';
import { EVENT_HOME, resetToHome } from './navigation';
import { k } from './theme';

/** 이 화면들에서는 지울 것이 없거나(첫 화면) 방문자 휴대폰에서 열리는 화면이다. */
const QUIET_PATHS = new Set([EVENT_HOME, '/event/take']);

/**
 * 방문자가 자리를 떠나면 처음 화면으로 돌아간다.
 * 바로 지우지 않고 먼저 묻는다. 결과를 읽느라 가만히 있는 사람도 있다.
 */
export function IdleGuard({ resetSeconds, warningSeconds, onActivityRef }: {
  resetSeconds: number;
  warningSeconds: number;
  /** 네이티브에서는 전역 이벤트가 없어서, 틀이 터치를 받을 때 이 함수를 부른다. */
  onActivityRef?: (touch: () => void) => void;
}) {
  const pathname = usePathname();
  const active = !QUIET_PATHS.has(pathname);
  const last = useRef(Date.now());
  const [remaining, setRemaining] = useState<number | null>(null);

  const touch = useCallback(() => {
    last.current = Date.now();
    setRemaining(current => (current === null ? current : null));
  }, []);

  useEffect(() => { onActivityRef?.(touch); }, [onActivityRef, touch]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;
    for (const name of events) document.addEventListener(name, touch, { capture: true, passive: true });
    return () => { for (const name of events) document.removeEventListener(name, touch, { capture: true }); };
  }, [touch]);

  // 화면이 바뀌는 것도 활동이다.
  useEffect(() => { touch(); }, [pathname, touch]);

  useEffect(() => {
    if (!active) { setRemaining(null); return; }
    const timer = setInterval(() => {
      const idle = (Date.now() - last.current) / 1000;
      if (idle >= resetSeconds) {
        setRemaining(null);
        last.current = Date.now();
        resetToHome();
      } else if (idle >= resetSeconds - warningSeconds) {
        setRemaining(Math.ceil(resetSeconds - idle));
      }
    }, 500);
    return () => clearInterval(timer);
  }, [active, resetSeconds, warningSeconds]);

  return (
    <Modal visible={remaining !== null} transparent animationType="fade" onRequestClose={touch}>
      <View style={styles.scrim}>
        <View style={styles.dialog} accessibilityRole="alert" testID="kiosk-idle-warning">
          <Text style={k.type.title}>아직 보고 계신가요?</Text>
          <Text style={[k.type.bodyLg, { color: k.colors.textMuted }]}>
            {remaining}초 뒤에 입력한 정보를 지우고 처음 화면으로 돌아가요.
          </Text>
          <View style={styles.actions}>
            <KioskButton label="처음으로" variant="soft" icon="home" onPress={() => { setRemaining(null); resetToHome(); }} />
            <KioskButton testID="kiosk-idle-continue" label="계속 볼게요" onPress={touch} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(28,27,34,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 560, backgroundColor: k.colors.surface, borderRadius: 24, padding: 32, gap: 16 },
  actions: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 8 },
});
