import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useKioskWidth } from '../../features/eventKiosk/ui/useKioskWidth';
import { kioskEvent } from '../../features/eventKiosk/kioskEvent';
import { useKioskStore } from '../../features/eventKiosk/useKioskStore';
import { KioskButton } from '../../features/eventKiosk/ui/controls';
import { k } from '../../features/eventKiosk/ui/theme';

/** 첫 화면. 행사장 화면에 계속 떠 있는 대기 화면이기도 하다. */
export default function EventLanding() {
  const load = kioskEvent();
  const width = useKioskWidth();
  if (!load.ok) return null;
  const { copy, listings } = load.event.config;
  const wide = width >= 900;

  const start = () => {
    // 시작할 때 한 번 더 비운다. 이전 방문자가 '처음으로'를 누르지 않고 떠났어도 남는 것이 없다.
    useKioskStore.getState().reset();
    router.push('/event/intro' as never);
  };

  return (
    <View style={styles.root} testID="event-landing">
      <View style={[styles.inner, wide && styles.innerWide]}>
        <View style={styles.brandRow}>
          <View style={styles.mark}><Text style={styles.markText}>e</Text></View>
          <Text style={styles.brand}>{copy.brand}</Text>
        </View>
        <Text style={[styles.title, wide && styles.titleWide]} accessibilityRole="header">{copy.landingTitle}</Text>
        <Text style={styles.subtitle}>{copy.landingSubtitle}</Text>
        <View style={styles.facts}>
          <Fact value={`${listings.length}개`} label="분석하는 공고" />
          <Fact value="약 3분" label="입력 시간" />
          <Fact value="저장 안 함" label="입력한 정보" />
        </View>
        <View style={styles.cta}>
          <KioskButton testID="event-start" label={copy.landingCta} icon="arrow-forward" onPress={start} variant="soft" large />
        </View>
        <Text style={styles.privacy}>입력한 정보는 이 기기에 저장하지 않고, 체험을 마치면 바로 지워져요.</Text>
      </View>
    </View>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factValue}>{value}</Text>
      <Text style={styles.factLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: k.colors.primary, alignItems: 'center', justifyContent: 'center', padding: 32, minHeight: '100%' as unknown as number },
  inner: { width: '100%', maxWidth: 760, gap: 28 },
  innerWide: { maxWidth: 900 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  mark: { width: 56, height: 56, borderRadius: 16, backgroundColor: k.colors.onPrimary, alignItems: 'center', justifyContent: 'center' },
  markText: { ...k.type.title, color: k.colors.primary },
  brand: { ...k.type.title, color: k.colors.onPrimary },
  title: { ...k.type.display, color: k.colors.onPrimary },
  titleWide: { fontSize: 56, lineHeight: 70 },
  subtitle: { ...k.type.bodyLg, fontSize: 22, lineHeight: 34, color: 'rgba(255,255,255,0.86)' },
  facts: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  fact: { flexGrow: 1, flexBasis: 180, padding: 20, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', gap: 4 },
  factValue: { ...k.type.title, color: k.colors.onPrimary },
  factLabel: { ...k.type.body, color: 'rgba(255,255,255,0.8)' },
  cta: { alignItems: 'flex-start', marginTop: 8 },
  privacy: { ...k.type.body, color: 'rgba(255,255,255,0.75)' },
});
