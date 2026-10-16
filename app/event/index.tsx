import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import type { ComponentProps } from 'react';
import { useKioskWidth } from '../../features/eventKiosk/ui/useKioskWidth';
import { useViewportHeight } from '../../features/eventKiosk/layout/DensityContext';
import { kioskEvent } from '../../features/eventKiosk/kioskEvent';
import { useKioskStore } from '../../features/eventKiosk/useKioskStore';
import { KioskButton } from '../../features/eventKiosk/ui/controls';
import { k } from '../../features/eventKiosk/ui/theme';
import { Appear } from '../../components/motion/Appear';
import { travel } from '../../design/motion';
import { eventMotion } from '../../features/eventKiosk/motion/eventMotion';
import { useFocusReplay } from '../../features/eventKiosk/motion/useFocusReplay';
import { ProductStory } from '../../features/eventKiosk/story/ProductStory';
import { BrandMark } from '../../features/eventKiosk/brand/BrandMark';
import { PartnerBadge, partnerSizeFor } from '../../features/eventKiosk/brand/PartnerBadge';
import { hasSeenStory, markStorySeen } from '../../features/eventKiosk/story/storyPreference';
import { STORY_AUTOPLAY_MS } from '../../features/eventKiosk/story/storyScript';
import { buildDistrictComparison } from '../../features/eventKiosk/districts/districtAdapter';
import { DISTRICT_COPY } from '../../features/eventKiosk/districts/districtCopy';
import type { DistrictCardModel } from '../../features/eventKiosk/districts/districtContract';

/**
 * 처음 온 브라우저에서만 Product Story 를 자동으로 연다. 자동화 브라우저(회귀 점검)는 기존 흐름을 그대로 검사하도록 자동 재생하지 않는다.
 * 소개는 첫 화면의 '완판e 소개 보기'나 /event/story 로 언제든 다시 볼 수 있다.
 */
function shouldAutoplayStory(): boolean {
  if (typeof navigator !== 'undefined' && (navigator as { webdriver?: boolean }).webdriver) return false;
  return !hasSeenStory();
}

/** 첫 화면: 삼도이동 1·2지구를 한 화면에서 소개하고, 한 번 입력해 두 지구를 비교하도록 안내한다. */
export default function EventLanding() {
  const load = kioskEvent();
  const width = useKioskWidth();
  const height = useViewportHeight();
  const replay = useFocusReplay();
  // 정적으로 그린 화면과 첫 화면이 같도록, 저장된 '봤음' 표시는 붙은 뒤에 읽는다.
  const [storyOpen, setStoryOpen] = useState(false);
  useEffect(() => { if (shouldAutoplayStory()) setStoryOpen(true); }, []);
  const districts = useMemo(() => buildDistrictComparison({ dual: null }), []);
  if (!load.ok) return null;
  const { copy } = load.event.config;
  const wide = width >= 900;
  const phone = width > 0 && width < 600;
  // 낮은 화면(노트북 720px, 휴대폰 844px 이하)에서는 여백만 줄여 내용이 한 화면에 들어오게 한다.
  const short = height > 0 && (phone ? height < 900 : height <= 800);

  const start = () => {
    // 시작할 때 한 번 더 비운다. 이전 방문자가 '처음으로'를 누르지 않고 떠났어도 남는 것이 없다.
    useKioskStore.getState().reset();
    router.push('/event/intro' as never);
  };

  return (
    <View style={styles.root} testID="event-landing">
      <View style={[styles.header, phone && styles.headerPhone]}>
        <BrandMark size="hero" label={copy.brand} compact={phone} />
        <PartnerBadge size={partnerSizeFor(width)} />
      </View>
      <ScrollView contentContainerStyle={[styles.scroll, phone && styles.scrollPhone, short && (phone ? styles.scrollPhoneShort : styles.scrollShort)]}>
        <View style={[styles.inner, wide && styles.innerWide, short && phone && styles.innerPhoneShort]}>
          <View style={[styles.hero, wide && styles.heroWide, phone && styles.heroPhone, short && styles.heroShort]}>
            <Appear replayKey={replay} distance={travel.md}>
              <View style={styles.heroCopy}>
                <Text style={[styles.eyebrow, phone && styles.eyebrowPhone]}>{DISTRICT_COPY.eyebrow}</Text>
                <Text style={[styles.title, wide && styles.titleWide, phone && styles.titlePhone]} accessibilityRole="header">{DISTRICT_COPY.landingTitle}</Text>
                <Text style={[styles.subtitle, phone && styles.subtitlePhone]}>{DISTRICT_COPY.landingSubtitle}</Text>
              </View>
            </Appear>
            <Appear replayKey={replay} delay={eventMotion.sequence} style={[styles.heroRest, phone && styles.heroRestPhone, short && styles.heroRestShort]}>
              <View testID="landing-districts" style={[styles.districts, phone && styles.districtsPhone]}>
                {districts.cards.map(card => <DistrictIntro key={card.id} card={card} phone={phone} />)}
              </View>
              <View style={styles.cta}>
                <KioskButton testID="event-start" label={DISTRICT_COPY.landingCta} icon="arrow-forward" onPress={start} large grow />
              </View>
              <View style={styles.storyLink}>
                <KioskButton testID="landing-story" label={`완판e 소개 보기 · ${Math.round(STORY_AUTOPLAY_MS / 1000)}초`} icon="play-circle-outline" variant="ghost" onPress={() => setStoryOpen(true)} />
              </View>
              <View style={styles.privacyRow}>
                <MaterialIcons name="verified-user" size={20} color={k.colors.primary} />
                <Text style={[styles.privacy, phone && styles.privacyPhone]}>입력한 정보는 이 기기에 저장하지 않고, 체험을 마치면 바로 지워져요.</Text>
              </View>
            </Appear>
          </View>
          <Appear replayKey={replay} delay={eventMotion.sequence * 2} style={[styles.preview, wide && styles.previewWide, phone && styles.previewPhone]}>
            <Text style={[styles.previewLabel, phone && styles.previewLabelPhone]}>결과에서 두 지구를 나란히 보여드려요</Text>
            <View style={styles.previewRows}>
              <PreviewRow icon="check-circle" title="신청 가능 여부" detail="지구별 추천 공급유형과 자격 상태" phone={phone} />
              <PreviewRow icon="format-list-numbered" title="우선단계 · 공식 점수" detail="공식 배점이 있는 유형만 표시" phone={phone} />
              <PreviewRow icon="payments" title="분양가 · 월 토지임대료" detail="49㎡ / 59㎡ 공고 금액 비교" phone={phone} />
              <PreviewRow icon="event-available" title="접수일 · 당첨자 발표" detail="특별공급 · 일반 1·2순위 일정" phone={phone} />
            </View>
          </Appear>
        </View>
      </ScrollView>
      <View style={[styles.footer, phone && styles.footerPhone]}><Text style={styles.footerText}>{DISTRICT_COPY.programTitle} · 행사 전용 분석</Text></View>
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

/** 지구 소개 카드: 총 세대와 49/59㎡ 세대. 값은 adapter(공고 패키지·Codex·브리프)에서 온다. */
function DistrictIntro({ card, phone }: { card: DistrictCardModel; phone: boolean }) {
  const inv = card.inventory;
  return (
    <View testID={`landing-district-${card.id}`} style={[styles.district, phone && styles.districtPhone, { borderTopColor: card.id === 'D1' ? k.colors.primary : k.colors.success }]}>
      <View style={[styles.districtPill, { backgroundColor: card.id === 'D1' ? k.colors.primary : k.colors.success }]}>
        <Text style={styles.districtPillText}>{card.label}</Text>
      </View>
      <Text style={[styles.districtTotal, phone && styles.districtTotalPhone]}>{inv ? `총 ${inv.total}세대` : '공고 확인 중'}</Text>
      {inv ? (
        <View style={styles.units}>
          <Text style={[styles.unit, phone && styles.unitPhone]}>49㎡ <Text style={styles.unitStrong}>{inv.units49}세대</Text></Text>
          <Text style={[styles.unitDivider, phone && styles.unitPhone]}>·</Text>
          <Text style={[styles.unit, phone && styles.unitPhone]}>59㎡ <Text style={styles.unitStrong}>{inv.units59}세대</Text></Text>
        </View>
      ) : null}
    </View>
  );
}

function PreviewRow({ icon, title, detail, phone }: { icon: ComponentProps<typeof MaterialIcons>['name']; title: string; detail: string; phone: boolean }) {
  return (
    <View style={[styles.previewRow, phone && styles.previewRowPhone]}>
      <View style={[styles.previewIcon, phone && styles.previewIconPhone]}><MaterialIcons name={icon} size={phone ? 20 : 24} color={k.colors.primary} /></View>
      <View style={styles.previewCopy}><Text style={[styles.previewTitle, phone && styles.previewTitlePhone]}>{title}</Text><Text style={styles.previewDetail}>{detail}</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  storyLink: { flexDirection: 'row' },
  root: { flex: 1, backgroundColor: k.colors.surface, minHeight: '100%' as unknown as number },
  header: { minHeight: 88, paddingHorizontal: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottomWidth: 1, borderBottomColor: k.colors.hairline },
  headerPhone: { minHeight: 56, paddingHorizontal: 16, gap: 8 },
  scroll: { flexGrow: 1, paddingHorizontal: 48, paddingTop: 40, paddingBottom: 32, alignItems: 'center' },
  scrollPhone: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 20 },
  scrollShort: { paddingTop: 24, paddingBottom: 20 },
  scrollPhoneShort: { paddingTop: 16, paddingBottom: 12 },
  innerPhoneShort: { gap: 16 },
  inner: { width: '100%', maxWidth: 1120, gap: 32 },
  innerWide: { flexDirection: 'row', alignItems: 'center', gap: 48 },
  hero: { gap: 28 },
  heroWide: { flex: 1.2 },
  heroPhone: { gap: 16 },
  heroShort: { gap: 12 },
  heroCopy: { gap: 10 },
  heroRest: { gap: 22 },
  heroRestPhone: { gap: 14 },
  heroRestShort: { gap: 12 },
  eyebrow: { ...k.type.label, color: k.colors.primary },
  eyebrowPhone: { fontSize: 13, lineHeight: 18 },
  title: { ...k.type.display, color: k.colors.text, wordBreak: 'keep-all' } as object,
  titleWide: { fontSize: 50, lineHeight: 64 },
  titlePhone: { fontSize: 28, lineHeight: 36 },
  subtitle: { ...k.type.bodyLg, color: k.colors.textMuted, wordBreak: 'keep-all' } as object,
  subtitlePhone: { fontSize: 15, lineHeight: 22 },
  districts: { flexDirection: 'row', gap: 14 },
  districtsPhone: { gap: 10 },
  district: { flex: 1, minWidth: 0, gap: 6, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: k.colors.surfaceHigh, borderTopWidth: 4, backgroundColor: k.colors.surface },
  districtPhone: { padding: 12, gap: 4, borderRadius: 14 },
  districtPill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  districtPillText: { ...k.type.label, fontSize: 14, lineHeight: 20, color: k.colors.onPrimary },
  districtTotal: { ...k.type.title, color: k.colors.text },
  districtTotalPhone: { fontSize: 22, lineHeight: 30 },
  units: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 6 },
  unit: { ...k.type.body, color: k.colors.textMuted },
  unitPhone: { fontSize: 13, lineHeight: 19 },
  unitStrong: { fontFamily: k.type.bodyStrong.fontFamily, color: k.colors.text },
  unitDivider: { ...k.type.body, color: k.colors.textSubtle },
  cta: { flexDirection: 'row', marginTop: 2 },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  privacy: { ...k.type.caption, color: k.colors.textMuted, flex: 1 },
  privacyPhone: { fontSize: 12, lineHeight: 17 },
  preview: { backgroundColor: k.colors.primaryFixed, borderRadius: 20, padding: 24, gap: 16 },
  previewWide: { flex: 0.8, minWidth: 360 },
  previewPhone: { padding: 16, gap: 8, borderRadius: 16 },
  previewLabel: { ...k.type.section, color: k.colors.text },
  previewLabelPhone: { fontSize: 17, lineHeight: 24 },
  previewRows: { gap: 8 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 6 },
  previewRowPhone: { gap: 10, paddingVertical: 2 },
  previewIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: k.colors.surface, alignItems: 'center', justifyContent: 'center' },
  previewIconPhone: { width: 36, height: 36, borderRadius: 10 },
  previewCopy: { flex: 1, gap: 1 },
  previewTitle: { ...k.type.bodyStrong, color: k.colors.text },
  previewTitlePhone: { fontSize: 15, lineHeight: 21 },
  previewDetail: { ...k.type.caption, color: k.colors.textMuted },
  footer: { minHeight: 62, paddingHorizontal: 48, justifyContent: 'center', backgroundColor: k.colors.background },
  footerPhone: { minHeight: 44, paddingHorizontal: 16 },
  footerText: { ...k.type.caption, color: k.colors.textMuted },
});
