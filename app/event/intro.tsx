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
          <KioskButton testID="intro-next" label="정보 입력 시작" icon="arrow-forward" onPress={() => router.push('/event/household' as never)} large />
        </>
      }
    >
      <View style={styles.list} testID="event-intro">
        {steps.map((sentence, index) => (
          <View key={sentence} style={[styles.row, index >= shown && styles.hidden]} aria-hidden={index >= shown}>
            <View style={styles.badge}><Text style={styles.badgeText}>{index + 1}</Text></View>
            <Text style={styles.sentence}>{sentence}</Text>
          </View>
        ))}
      </View>
    </KioskFrame>
  );
}

const styles = StyleSheet.create({
  list: { gap: 36, paddingVertical: 48 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  hidden: { opacity: 0 },
  badge: { width: 64, height: 64, borderRadius: 32, backgroundColor: k.colors.primary, alignItems: 'center', justifyContent: 'center' },
  badgeText: { ...k.type.title, color: k.colors.onPrimary },
  sentence: { ...k.type.hero, color: k.colors.text, flex: 1 },
});
