import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { buildInfo, DEMO_PERSONAS, DEMO_ROUTES, injectPersona, isDemoModeEnabled, type InjectMode } from '../../features/eventKiosk/demo/demoMode';
import { kioskEvent } from '../../features/eventKiosk/kioskEvent';
import type { Phase4PersonaId } from '../../features/eventKiosk/phase4Personas';
import { useKioskStore } from '../../features/eventKiosk/useKioskStore';
import { KioskButton, Notice } from '../../features/eventKiosk/ui/controls';
import { KioskFrame } from '../../features/eventKiosk/ui/KioskFrame';
import { listingPath, resetToHome } from '../../features/eventKiosk/ui/navigation';
import { k } from '../../features/eventKiosk/ui/theme';
import { forgetStorySeen } from '../../features/eventKiosk/story/storyPreference';

/**
 * 행사 운영용 Demo Mode. 개발 빌드나 EXPO_PUBLIC_EVENT_DEMO_MODE=1 빌드에서만 동작한다.
 * 방문자 화면 어디에도 이 주소로 가는 링크가 없다. 운영자가 주소를 직접 입력해야 열린다.
 */
export default function EventDemo() {
  const load = kioskEvent();
  const evaluation = useKioskStore(state => state.evaluation);
  const householdType = useKioskStore(state => state.answers.householdType);
  const brand = load.ok ? load.event.config.copy.brand : '완판e';

  if (!isDemoModeEnabled()) {
    return (
      <KioskFrame brand={brand} hideChat confirmHome={false}>
        <View style={styles.off} testID="event-demo-disabled">
          <Text style={k.type.title}>찾는 화면이 없어요</Text>
          <KioskButton label="처음 화면으로" icon="home" onPress={resetToHome} />
        </View>
      </KioskFrame>
    );
  }

  const info = buildInfo();
  const inject = (id: Phase4PersonaId, mode: InjectMode) => {
    injectPersona(id, mode);
    // 판정을 건너뛰지 않는다. 분석 화면에서 실제 엔진이 계산하고, 질문이 남으면 추가 확인으로 간다.
    router.push('/event/analysis' as never);
  };
  const go = (path: string) => {
    if (path === 'detail') {
      const first = evaluation?.outcomes[0];
      if (first) router.push(listingPath(first.id) as never);
      return;
    }
    router.push(path as never);
  };

  return (
    <KioskFrame brand={brand} hideChat confirmHome={false} progress={{ label: 'Demo Mode · 운영자 전용' }}>
      <View style={styles.stack} testID="event-demo">
        <Notice tone="warn">운영자 전용 화면이에요. 방문자에게 보여 주지 마세요. 판정은 항상 실제 엔진으로 계산해요.</Notice>

        <Text style={styles.section}>버전</Text>
        <View style={styles.table} testID="demo-version">
          <Row label="행사" value={load.ok ? load.event.config.id : '불러오지 못함'} />
          <Row label="Dataset" value={load.ok ? load.event.dataset.datasetVersion : '-'} />
          <Row label="Dataset frozen" value={load.ok ? load.event.dataset.frozenAt : '-'} />
          <Row label="Fingerprint" value={load.ok ? `${load.event.dataset.fingerprint.slice(0, 19)}…` : '-'} />
          <Row label="Build commit" value={info.commit} />
          <Row label="Build time" value={info.builtAt} />
          <Row label="Demo Mode" value={info.mode === 'development' ? '개발 빌드' : '운영 flag'} />
          <Row label="현재 세션" value={evaluation ? `결과 있음 · 신청 가능 ${evaluation.counts.eligible} / 확인 ${evaluation.counts.review} / 어려움 ${evaluation.counts.difficult}` : householdType ? '입력 중' : '비어 있음'} />
        </View>

        <Text style={styles.section}>테스트 persona</Text>
        {DEMO_PERSONAS.map(persona => (
          <View key={persona.id} style={styles.row}>
            <Text style={styles.label}>{persona.label}</Text>
            <View style={styles.actions}>
              <KioskButton label="입력만 넣기" variant="soft" onPress={() => inject(persona.id, 'inputs')} testID={`demo-inject-${persona.id}`} />
              <KioskButton label="추가 질문 답까지" onPress={() => inject(persona.id, 'withAdaptive')} testID={`demo-inject-full-${persona.id}`} />
            </View>
          </View>
        ))}

        <Text style={styles.section}>빠른 이동</Text>
        <View style={styles.actions}>
          {DEMO_ROUTES.map(route => (
            <KioskButton
              key={route.key}
              label={route.label}
              variant="ghost"
              disabled={route.needsResult && !evaluation}
              onPress={() => go(route.path)}
              testID={`demo-go-${route.key}`}
            />
          ))}
        </View>
        {!evaluation ? <Text style={styles.hint}>Adaptive·Dashboard·Detail·QR 은 persona 를 넣어 분석한 뒤에 열려요.</Text> : null}

        <Text style={styles.section}>Product Story</Text>
        <View style={styles.actions}>
          <KioskButton label="소개 보기" variant="ghost" icon="play-circle-outline" onPress={() => router.push('/event/story' as never)} testID="demo-story" />
          <KioskButton label="첫 화면 자동 재생 다시 켜기" variant="ghost" icon="replay" onPress={forgetStorySeen} testID="demo-story-reset" />
        </View>

        <Text style={styles.section}>세션</Text>
        <KioskButton label="전체 세션 reset" icon="restart-alt" variant="soft" onPress={resetToHome} testID="demo-reset" />
      </View>
    </KioskFrame>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.tableRow}>
      <Text style={styles.tableLabel}>{label}</Text>
      <Text style={styles.tableValue} selectable>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  off: { alignItems: 'center', gap: 20, paddingVertical: 80 },
  stack: { gap: 14 },
  section: { ...k.type.section, color: k.colors.text, marginTop: 14 },
  table: { borderRadius: 16, borderWidth: 1, borderColor: k.colors.outline, backgroundColor: k.colors.surface },
  tableRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: k.colors.hairline },
  tableLabel: { ...k.type.bodyStrong, color: k.colors.textMuted, width: 140 },
  tableValue: { ...k.type.body, color: k.colors.text, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: k.colors.hairline },
  label: { ...k.type.bodyLgStrong, color: k.colors.text },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  hint: { ...k.type.caption, color: k.colors.textMuted },
});
