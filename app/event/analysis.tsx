import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { kioskEvent } from '../../features/eventKiosk/kioskEvent';
import { useKioskStore } from '../../features/eventKiosk/useKioskStore';
import { KioskButton, Notice } from '../../features/eventKiosk/ui/controls';
import { KioskFrame } from '../../features/eventKiosk/ui/KioskFrame';
import { EmptyState } from '../../features/eventKiosk/ui/resultParts';
import { resetToHome, stepPath } from '../../features/eventKiosk/ui/navigation';
import { k } from '../../features/eventKiosk/ui/theme';
import { useAttached } from '../../features/adminPortal/useIsWide';

const PHASES = ['입력한 정보를 정리하고 있어요', '공고별 신청 조건을 확인하고 있어요', '나에게 유리한 순서로 정리하고 있어요'];

/** 분석 중 화면. 계산은 금방 끝나지만, 무엇을 하는지 보여 줄 시간을 조금 둔다. */
export default function AnalysisScreen() {
  const load = kioskEvent();
  const attached = useAttached();
  const householdType = useKioskStore(state => state.answers.householdType);
  const analysis = useKioskStore(state => state.analysis);
  const error = useKioskStore(state => state.analysisError);
  const adaptivePlan = useKioskStore(state => state.adaptivePlan);
  const runAnalysis = useKioskStore(state => state.runAnalysis);
  const started = useRef(false);
  // 이전 결과가 'done' 으로 남아 있을 수 있다. 이 화면에서 시작한 분석이 끝났을 때만 넘어간다.
  const sawRunning = useRef(false);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!load.ok || !householdType || started.current) return;
    started.current = true;
    void runAnalysis(load.event);
  }, [householdType, load, runAnalysis]);

  useEffect(() => {
    if (analysis !== 'running') return;
    const timer = setInterval(() => setPhase(current => Math.min(PHASES.length - 1, current + 1)), 550);
    return () => clearInterval(timer);
  }, [analysis]);

  useEffect(() => {
    if (analysis === 'running') sawRunning.current = true;
    if (analysis === 'done' && sawRunning.current) {
      router.replace((adaptivePlan?.questions.length ? '/event/adaptive' : '/event/results') as never);
    }
  }, [adaptivePlan, analysis]);

  if (!load.ok) return null;
  const brand = load.event.config.copy.brand;

  if (!attached) return <KioskFrame brand={brand} hideChat confirmHome={false}><View /></KioskFrame>;

  if (!householdType) {
    return (
      <KioskFrame brand={brand} hideChat confirmHome={false}>
        <EmptyState title="입력한 정보가 없어요" body="처음부터 정보를 입력하면 분석해 드려요." action={{ label: '처음부터 시작하기', onPress: resetToHome }} />
      </KioskFrame>
    );
  }

  if (analysis === 'error') {
    return (
      <KioskFrame brand={brand} hideChat>
        <View style={styles.center} testID="analysis-error">
          <Notice tone="error">분석하는 중에 문제가 생겼어요. 입력한 정보는 그대로 남아 있어요. ({error})</Notice>
          <View style={styles.actions}>
            <KioskButton label="입력 고치기" variant="soft" icon="edit" onPress={() => router.replace(stepPath('subscription') as never)} />
            <KioskButton label="다시 분석하기" icon="refresh" onPress={() => { started.current = true; void runAnalysis(load.event); }} large />
          </View>
        </View>
      </KioskFrame>
    );
  }

  return (
    <KioskFrame brand={brand} hideChat confirmHome={false}>
      <View style={styles.center} testID="analysis-running" accessibilityLiveRegion="polite">
        <View style={styles.spinner}><ActivityIndicator size="large" color={k.colors.primary} /></View>
        <Text style={styles.title}>분석하고 있어요</Text>
        <View style={styles.phases}>
          {PHASES.map((text, index) => (
            <Text key={text} style={[styles.phase, index <= phase && styles.phaseOn]}>
              {index < phase ? '✓ ' : index === phase ? '• ' : '  '}{text}
            </Text>
          ))}
        </View>
      </View>
    </KioskFrame>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: 24, paddingVertical: 64, paddingHorizontal: 24 },
  spinner: { width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: k.colors.primaryFixed },
  title: { ...k.type.hero, color: k.colors.text },
  phases: { width: '100%', maxWidth: 520, gap: 12, padding: 24, borderRadius: 20, backgroundColor: k.colors.surface, borderWidth: 1, borderColor: k.colors.outline },
  phase: { ...k.type.bodyLg, color: k.colors.textSubtle },
  phaseOn: { color: k.colors.text },
  actions: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
});
