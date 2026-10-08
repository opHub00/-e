import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { kioskEvent } from '../../features/eventKiosk/kioskEvent';
import type { AdaptiveInfo, KioskAnswers } from '../../features/eventKiosk/model';
import { phase4Personas } from '../../features/eventKiosk/phase4Personas';
import { useKioskStore } from '../../features/eventKiosk/useKioskStore';
import { KioskButton, Notice } from '../../features/eventKiosk/ui/controls';
import { KioskFrame } from '../../features/eventKiosk/ui/KioskFrame';
import { resetToHome } from '../../features/eventKiosk/ui/navigation';
import { k } from '../../features/eventKiosk/ui/theme';

/**
 * 개발·QA 전용 도우미. 행사용(production) 빌드에서는 아무 기능도 보여 주지 않는다.
 * 어떤 행사 화면에서도 이 주소로 가는 링크를 두지 않는다. 운영자가 주소를 직접 입력해야 열린다.
 */
const QA_ENABLED = typeof __DEV__ !== 'undefined' && __DEV__;

const ROUTES: [string, string][] = [
  ['첫 화면', '/event'],
  ['가구 형태', '/event/household'],
  ['신청자 정보', '/event/applicant'],
  ['추가 질문', '/event/adaptive'],
  ['결과', '/event/results'],
  ['관심 공고', '/event/favorites'],
  ['AI 상담', '/event/chat'],
  ['결과 요약', '/event/summary'],
];

function withAdaptive(answers: KioskAnswers, adaptive: Partial<AdaptiveInfo>): KioskAnswers {
  const merged = structuredClone(answers);
  merged.adaptive = { ...merged.adaptive, ...adaptive } as AdaptiveInfo;
  return merged;
}

function inject(index: number, includeAdaptive: boolean) {
  const persona = phase4Personas[index];
  const answers = includeAdaptive ? withAdaptive(persona.initialAnswers, persona.adaptiveAnswers) : persona.initialAnswers;
  const answered = includeAdaptive ? Object.keys(persona.adaptiveAnswers).map(key => `adaptive.${key}`) : [];
  useKioskStore.getState().qaLoadAnswers(answers, answered);
  // 분석 화면부터 실제 흐름을 그대로 탄다. 판정을 건너뛰지 않는다.
  router.push('/event/analysis' as never);
}

export default function EventQa() {
  const load = kioskEvent();
  const brand = load.ok ? load.event.config.copy.brand : '완판e';
  if (!QA_ENABLED) {
    return (
      <KioskFrame brand={brand} hideChat confirmHome={false}>
        <View style={styles.off} testID="event-qa-disabled">
          <Text style={k.type.title}>찾는 화면이 없어요</Text>
          <KioskButton label="처음 화면으로" icon="home" onPress={resetToHome} />
        </View>
      </KioskFrame>
    );
  }
  return (
    <KioskFrame brand={brand} hideChat confirmHome={false} progress={{ label: 'QA 도우미 · 개발 빌드 전용' }}>
      <View style={styles.stack} testID="event-qa">
        <Notice tone="warn">개발 빌드에서만 보이는 화면이에요. 행사용 빌드에서는 동작하지 않아요.</Notice>
        <Text style={styles.section}>테스트 persona 넣기</Text>
        {phase4Personas.map((persona, index) => (
          <View key={persona.id} style={styles.row}>
            <Text style={styles.label}>{persona.label}</Text>
            <View style={styles.actions}>
              <KioskButton label="입력만" variant="soft" onPress={() => inject(index, false)} testID={`qa-inject-${persona.id}`} />
              <KioskButton label="추가 질문까지" onPress={() => inject(index, true)} testID={`qa-inject-full-${persona.id}`} />
            </View>
          </View>
        ))}
        <Text style={styles.section}>세션</Text>
        <KioskButton label="전체 세션 초기화" icon="restart-alt" variant="soft" onPress={resetToHome} testID="qa-reset" />
        <Text style={styles.section}>빠른 이동</Text>
        <View style={styles.actions}>
          {ROUTES.map(([label, path]) => (
            <KioskButton key={path} label={label} variant="ghost" onPress={() => router.push(path as never)} />
          ))}
        </View>
      </View>
    </KioskFrame>
  );
}

const styles = StyleSheet.create({
  off: { alignItems: 'center', gap: 20, paddingVertical: 80 },
  stack: { gap: 16 },
  section: { ...k.type.section, color: k.colors.text, marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: k.colors.hairline },
  label: { ...k.type.bodyLgStrong, color: k.colors.text },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
});
