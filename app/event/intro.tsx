import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { kioskEvent } from '../../features/eventKiosk/kioskEvent';
import { KioskButton } from '../../features/eventKiosk/ui/controls';
import { KioskFrame } from '../../features/eventKiosk/ui/KioskFrame';
import { k } from '../../features/eventKiosk/ui/theme';

const STEP_MS = 700;

/** 무엇을 하게 되는지 세 문장으로. 기다리지 않고 바로 넘어갈 수 있다. */
export default function EventIntro() {
  const load = kioskEvent();
  const [shown, setShown] = useState(1);
  const steps = load.ok ? load.event.config.copy.introSteps : [];

  useEffect(() => {
    if (shown >= steps.length) return;
    const timer = setTimeout(() => setShown(count => count + 1), STEP_MS);
    return () => clearTimeout(timer);
  }, [shown, steps.length]);

  if (!load.ok) return null;
  return (
    <KioskFrame
      brand={load.event.config.copy.brand}
      hideChat
      confirmHome={false}
      footer={
        <>
          <View />
          <View style={styles.footerAction}>
            <KioskButton testID="intro-next" label="정보 입력 시작" icon="arrow-forward" onPress={() => router.push('/event/household' as never)} large grow />
          </View>
        </>
      }
    >
      <View style={styles.head}>
        <Text style={styles.eyebrow}>이렇게 진행해요</Text>
        <Text style={styles.title} accessibilityRole="header">내 조건에 맞는 제주 청약을{`\n`}한 번에 비교해 보세요.</Text>
      </View>
      <View style={styles.list} testID="event-intro">
        {steps.map((sentence, index) => (
          <View key={sentence} style={[styles.row, index >= shown && styles.hidden]} aria-hidden={index >= shown}>
            <View style={styles.badge}><Text style={styles.badgeText}>0{index + 1}</Text></View>
            <Text style={styles.sentence}>{sentence}</Text>
          </View>
        ))}
      </View>
    </KioskFrame>
  );
}

const styles = StyleSheet.create({
  head: { gap: 10, marginBottom: 28 },
  eyebrow: { ...k.type.label, color: k.colors.primary },
  title: { ...k.type.hero, color: k.colors.text },
  list: { gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 20, padding: 24, borderRadius: 20, borderWidth: 1, borderColor: k.colors.outline, backgroundColor: k.colors.surface },
  hidden: { opacity: 0 },
  badge: { width: 56, height: 56, borderRadius: 16, backgroundColor: k.colors.primaryFixed, alignItems: 'center', justifyContent: 'center' },
  badgeText: { ...k.type.bodyLgStrong, color: k.colors.primary },
  sentence: { ...k.type.question, color: k.colors.text, flex: 1 },
  footerAction: { flex: 1, maxWidth: 520, flexDirection: 'row' },
});
