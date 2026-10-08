import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import { useKioskWidth } from '../../features/eventKiosk/ui/useKioskWidth';
import { kioskEvent } from '../../features/eventKiosk/kioskEvent';
import { useKioskStore } from '../../features/eventKiosk/useKioskStore';
import { KioskButton } from '../../features/eventKiosk/ui/controls';
import { k } from '../../features/eventKiosk/ui/theme';
import { Appear } from '../../components/motion/Appear';
import { travel } from '../../design/motion';
import { eventMotion } from '../../features/eventKiosk/motion/eventMotion';
import { useFocusReplay } from '../../features/eventKiosk/motion/useFocusReplay';
import { ProductStory } from '../../features/eventKiosk/story/ProductStory';
import { hasSeenStory, markStorySeen } from '../../features/eventKiosk/story/storyPreference';
import { STORY_AUTOPLAY_MS } from '../../features/eventKiosk/story/storyScript';

/**
 * 처음 온 브라우저에서만 Product Story 를 자동으로 연다. 자동화 브라우저(회귀 점검)는 기존 흐름을 그대로 검사하도록 자동 재생하지 않는다.
 * 소개는 첫 화면의 '완판e 소개 보기'나 /event/story 로 언제든 다시 볼 수 있다.
 */
function shouldAutoplayStory(): boolean {
  if (typeof navigator !== 'undefined' && (navigator as { webdriver?: boolean }).webdriver) return false;
  return !hasSeenStory();
}

/** 첫 화면. 행사장 화면에 계속 떠 있는 대기 화면이기도 하다. */
export default function EventLanding() {
  const load = kioskEvent();
  const width = useKioskWidth();
  const replay = useFocusReplay();
  // 정적으로 그린 화면과 첫 화면이 같도록, 저장된 '봤음' 표시는 붙은 뒤에 읽는다.
  const [storyOpen, setStoryOpen] = useState(false);
  useEffect(() => { if (shouldAutoplayStory()) setStoryOpen(true); }, []);
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
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.mark}><Text style={styles.markText}>e</Text></View>
          <Text style={styles.brand}>{copy.brand}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.inner, wide && styles.innerWide]}>
          <View style={[styles.hero, wide && styles.heroWide]}>
            <Appear replayKey={replay} distance={travel.md}>
            <View style={styles.heroCopy}>
              <Text style={styles.eyebrow}>2026 제주 청약 체험</Text>
              <Text style={[styles.title, wide && styles.titleWide]} accessibilityRole="header">{copy.landingTitle}</Text>
              <Text style={styles.subtitle}>{copy.landingSubtitle}</Text>
            </View>
            </Appear>
            <Appear replayKey={replay} delay={eventMotion.sequence} style={styles.heroRest}>
            <View style={styles.facts}>
              <Fact value={`${listings.length}개`} label="분석하는 공고" />
              <Fact value="약 3분" label="입력 시간" />
              <Fact value="저장 안 함" label="입력한 정보" />
            </View>
            <View style={styles.cta}>
              <KioskButton testID="event-start" label={copy.landingCta} icon="arrow-forward" onPress={start} large grow />
            </View>
            <View style={styles.storyLink}>
              <KioskButton testID="landing-story" label={`완판e 소개 보기 · ${Math.round(STORY_AUTOPLAY_MS / 1000)}초`} icon="play-circle-outline" variant="ghost" onPress={() => setStoryOpen(true)} />
            </View>
            <View style={styles.privacyRow}>
              <MaterialIcons name="verified-user" size={22} color={k.colors.primary} />
              <Text style={styles.privacy}>입력한 정보는 이 기기에 저장하지 않고, 체험을 마치면 바로 지워져요.</Text>
            </View>
            </Appear>
          </View>
          <Appear replayKey={replay} delay={eventMotion.sequence * 2} style={[styles.preview, wide && styles.previewWide]}>
            <Text style={styles.previewLabel}>한 번 입력하고 한눈에 비교해요</Text>
            <View style={styles.previewRows}>
              <PreviewRow icon="check-circle" title="신청 가능 여부" detail="자격·순위·추가 확인 사항" />
              <PreviewRow icon="account-balance" title="공식 점수" detail="공식 배점이 있을 때만 표시" />
              <PreviewRow icon="auto-awesome" title="완판e 추천" detail="적극 검토·검토 가능·조건 확인" />
            </View>
          </Appear>
        </View>
      </ScrollView>
      <View style={styles.footer}><Text style={styles.footerText}>완판e 제주 청약 체험 · 행사 전용 데모</Text></View>
      {storyOpen ? (
        <View style={StyleSheet.absoluteFill}>
          <ProductStory
            onStart={() => { markStorySeen(); setStoryOpen(false); start(); }}
            onSkip={() => { markStorySeen(); setStoryOpen(false); }}
          />
        </View>
      ) : null}
    </View>
  );
}

function PreviewRow({ icon, title, detail }: { icon: ComponentProps<typeof MaterialIcons>['name']; title: string; detail: string }) {
  return (
    <View style={styles.previewRow}>
      <View style={styles.previewIcon}><MaterialIcons name={icon} size={24} color={k.colors.primary} /></View>
      <View style={styles.previewCopy}><Text style={styles.previewTitle}>{title}</Text><Text style={styles.previewDetail}>{detail}</Text></View>
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
  storyLink: { flexDirection: 'row' },
  root: { flex: 1, backgroundColor: k.colors.surface, minHeight: '100%' as unknown as number },
  header: { minHeight: 88, paddingHorizontal: 32, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: k.colors.hairline },
  scroll: { flexGrow: 1, paddingHorizontal: 48, paddingTop: 40, paddingBottom: 32, alignItems: 'center' },
  inner: { width: '100%', maxWidth: 1120, gap: 32 },
  innerWide: { flexDirection: 'row', alignItems: 'center', gap: 48 },
  hero: { gap: 28 },
  heroWide: { flex: 1.2 },
  heroCopy: { gap: 12 },
  heroRest: { gap: 28 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: { width: 44, height: 44, borderRadius: 12, backgroundColor: k.colors.primary, alignItems: 'center', justifyContent: 'center' },
  markText: { ...k.type.section, color: k.colors.onPrimary, lineHeight: 30 },
  brand: { ...k.type.section, fontSize: 25, color: k.colors.primary },
  eyebrow: { ...k.type.label, color: k.colors.primary },
  title: { ...k.type.display, color: k.colors.text },
  titleWide: { fontSize: 52, lineHeight: 68 },
  subtitle: { ...k.type.bodyLg, fontSize: 22, lineHeight: 34, color: k.colors.textMuted },
  facts: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  fact: { flexGrow: 1, flexBasis: 150, paddingTop: 20, borderTopWidth: 1, borderTopColor: k.colors.outline, gap: 2 },
  factValue: { ...k.type.title, color: k.colors.text },
  factLabel: { ...k.type.body, color: k.colors.textMuted },
  cta: { flexDirection: 'row', marginTop: 4 },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  privacy: { ...k.type.caption, color: k.colors.textMuted, flex: 1 },
  preview: { backgroundColor: k.colors.primaryFixed, borderRadius: 20, padding: 24, gap: 20 },
  previewWide: { flex: 0.8, minWidth: 360 },
  previewLabel: { ...k.type.section, color: k.colors.text },
  previewRows: { gap: 12 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8 },
  previewIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: k.colors.surface, alignItems: 'center', justifyContent: 'center' },
  previewCopy: { flex: 1, gap: 1 },
  previewTitle: { ...k.type.bodyStrong, color: k.colors.text },
  previewDetail: { ...k.type.caption, color: k.colors.textMuted },
  footer: { minHeight: 62, paddingHorizontal: 48, justifyContent: 'center', backgroundColor: k.colors.background },
  footerText: { ...k.type.caption, color: k.colors.textMuted },
});
