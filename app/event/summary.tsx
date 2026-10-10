import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useAttached } from '../../features/adminPortal/useIsWide';
import { kioskEvent } from '../../features/eventKiosk/kioskEvent';
import { createResultSession } from '../../features/eventKiosk/resultSessionClient';
import { buildPortfolioSummary, buildSummary } from '../../features/eventKiosk/summary';
import { buildRecommendationPortfolio } from '../../features/eventKiosk/live/recommendation';
import { useServiceListingPortfolio } from '../../features/eventKiosk/live/useServiceListingPortfolio';
import { useKioskStore } from '../../features/eventKiosk/useKioskStore';
import { KioskButton, Notice } from '../../features/eventKiosk/ui/controls';
import { KioskFrame } from '../../features/eventKiosk/ui/KioskFrame';
import { goBack, listingPath, resetToHome } from '../../features/eventKiosk/ui/navigation';
import { QrCode } from '../../features/eventKiosk/ui/QrCode';
import { EmptyState } from '../../features/eventKiosk/ui/resultParts';
import { k } from '../../features/eventKiosk/ui/theme';
import { Appear } from '../../components/motion/Appear';
import { travel } from '../../design/motion';
import { Emphasis } from '../../features/eventKiosk/motion/Emphasis';
import { useKioskWidth } from '../../features/eventKiosk/ui/useKioskWidth';
import { evidenceOnlyFacts } from '../../features/eventKiosk/experience/explain';
import { RecommendationSummaryV2View } from '../../features/eventKiosk/v2/RecommendationSummaryV2View';

/** 최종 요약. 휴대폰으로 가져갈 수 있게 QR 을 만들고, 끝나면 처음 화면으로. */
export default function SummaryScreen() {
  const load = kioskEvent();
  const attached = useAttached();
  const width = useKioskWidth();
  const evaluation = useKioskStore(state => state.evaluation);
  const favorites = useKioskStore(state => state.favorites);
  const householdType = useKioskStore(state => state.answers.householdType);
  const { portfolio: serviceListings } = useServiceListingPortfolio(load.ok ? load.event.dataset : null);
  const [session, setSession] = useState<
    { status: 'idle' } | { status: 'creating' } | { status: 'ready'; link: string; expiresAt: string } | { status: 'error' }
  >({ status: 'idle' });

  const recommendationPortfolio = useMemo(() => {
    if (!evaluation || !serviceListings) return null;
    return buildRecommendationPortfolio({ listings: serviceListings, evaluation, favoriteIds: favorites });
  }, [evaluation, favorites, serviceListings]);
  const summary = useMemo(() => {
    if (!load.ok || !evaluation) return null;
    if (recommendationPortfolio) {
      return buildPortfolioSummary({
        eventId: load.event.config.id,
        portfolio: recommendationPortfolio,
      });
    }
    return buildSummary({ eventId: load.event.config.id, householdType, evaluation, favoriteIds: favorites, evidenceOnly: evidenceOnlyFacts(load.event.dataset) });
  }, [evaluation, favorites, householdType, load, recommendationPortfolio]);
  const showQr = session.status === 'ready';
  const answers = useKioskStore(state => state.answers);

  const makeQr = async () => {
    if (!summary || !attached || !load.ok || session.status === 'creating') return;
    const base = load.event.config.shareBaseUrl ?? (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : null);
    if (!base) { setSession({ status: 'error' }); return; }
    setSession({ status: 'creating' });
    try {
      const created = await createResultSession(base, summary);
      setSession({ status: 'ready', link: created.url, expiresAt: created.expiresAt });
    } catch {
      setSession({ status: 'error' });
    }
  };

  if (!load.ok) return null;
  const brand = load.event.config.copy.brand;
  if (!summary || !recommendationPortfolio) {
    return (
      <KioskFrame brand={brand} confirmHome={false}>
        <EmptyState title="아직 분석한 결과가 없어요" body="처음부터 정보를 입력하면 결과 요약을 만들어 드려요." action={{ label: '처음부터 시작하기', onPress: resetToHome }} />
      </KioskFrame>
    );
  }
  const wide = width >= 1000;
  // QR 이 만들어지면 패널이 떠오르고 테두리가 한 번 강조된다. 크기를 키우거나 흔들지 않는다.
  const qrPanel = (
        <Appear distance={travel.md} style={styles.qrWrap}>
        <Emphasis color={k.colors.primary} radius={20} testID="summary-qr-emphasis">
          <View style={[styles.qrPanel, wide && styles.qrPanelWide]} testID="summary-qr-panel">
            {session.status === 'ready' ? (
              <View style={styles.qrVisual}>
                {/* data-link: 자동 점검이 QR 이 담은 주소를 그대로 따라가 볼 수 있게. */}
                <View style={styles.qrBox} {...({ dataSet: { link: session.link } } as object)}><QrCode value={session.link} size={300} testID="summary-qr-code" /></View>
              </View>
            ) : (
              <Notice tone="warn">휴대폰 링크를 아직 만들지 못했어요. 잠시 후 다시 시도해 주세요.</Notice>
            )}
            <View style={styles.qrCopy}>
              <Text style={styles.qrTitle}>휴대폰 카메라로 찍어 주세요</Text>
              <Text style={styles.qrHint}>추천·관심 공고와 다시 확인할 일정을 같은 구조로 이어서 볼 수 있어요. 앱 설치가 필요 없고 링크는 6시간 뒤 만료돼요.</Text>
              <View style={styles.privacy}>
                <MaterialIcons name="lock" size={22} color={k.colors.textMuted} />
                <Text style={styles.muted}>QR에는 임시 결과를 찾는 무작위 token만 들어가요. 이름·생년월일·소득·자산은 저장하지 않아요.</Text>
              </View>
            </View>
          </View>
        </Emphasis>
        </Appear>
  );

  return (
    <KioskFrame
      brand={brand}
      progress={{ label: '결과 요약' }}
      confirmHome={!showQr}
      footer={
        showQr ? (
          <>
            <View />
            <KioskButton testID="summary-reset" label="처음 화면으로 돌아가기" icon="home" onPress={resetToHome} large />
          </>
        ) : (
          <>
            <KioskButton label="결과 목록" variant="ghost" icon="arrow-back" onPress={() => goBack('/event/results')} />
            <KioskButton
              testID="summary-qr"
              label={session.status === 'creating' ? '임시 링크 만드는 중…' : session.status === 'error' ? '다시 시도하기' : '휴대폰으로 가져가기'}
              icon="smartphone"
              onPress={() => void makeQr()}
              disabled={session.status === 'creating'}
              large
            />
          </>
        )
      }
    >
      {session.status === 'error' ? (
        <View testID="summary-qr-error">
          <Notice tone="warn">휴대폰으로 보낼 링크를 지금 만들지 못했어요. 잠시 후 아래 ‘다시 시도하기’를 눌러 주세요. 계속 안 되면 화면을 사진으로 남기거나 행사 안내 직원에게 알려 주세요.</Notice>
        </View>
      ) : null}
      <View style={styles.pageHead}>
        <Text style={styles.title} accessibilityRole="header">{showQr ? '휴대폰으로 공고 모음 가져가기' : '내가 다시 확인할 청약 공고 모음'}</Text>
        <Text style={styles.subtitle}>{showQr ? '추천·관심·일정·확인사항을 휴대폰에서도 같은 구조로 이어서 봐요.' : '추천 공고와 관심 공고를 함께 가져가세요. 프로필이 아닌 공고 중심 요약입니다.'}</Text>
      </View>
      {showQr ? qrPanel : null}
      <View style={styles.main} testID="summary">
          {/* Summary V2: 어디에 신청하면 되는지가 먼저, 내 입력 정보는 접힌 보조 영역. QR 요약 모양은 그대로다. */}
          <RecommendationSummaryV2View
            portfolio={recommendationPortfolio}
            answers={answers}
            onOpen={outcomeId => router.push(listingPath(outcomeId) as never)}
          />
          {summary.favorites.length ? null : <KioskButton label="관심 공고 담으러 가기" variant="soft" onPress={() => router.push('/event/results' as never)} />}
      </View>
    </KioskFrame>
  );
}

const styles = StyleSheet.create({
  pageHead: { gap: 6, marginBottom: 20 },
  main: { flex: 1, gap: 18 },
  title: { ...k.type.hero, color: k.colors.text, marginBottom: 8 },
  subtitle: { ...k.type.body, color: k.colors.textMuted },
  card: { backgroundColor: k.colors.surface, borderRadius: 20, padding: 24, gap: 12, borderWidth: 1, borderColor: k.colors.outline },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: { ...k.type.section, color: k.colors.text },
  body: { ...k.type.bodyLg, color: k.colors.text },
  muted: { ...k.type.body, color: k.colors.textMuted, flexShrink: 1 },
  note: { ...k.type.caption, color: k.tint.amber.fg },
  counts: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  count: { flexGrow: 1, flexBasis: 140, borderRadius: 12, padding: 16, gap: 2 },
  countValue: { ...k.type.title },
  countLabel: { ...k.type.bodyStrong },
  items: { gap: 14 },
  item: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 9 },
  itemTitle: { ...k.type.bodyLgStrong, color: k.colors.text },
  qrWrap: { width: '100%', alignSelf: 'center', marginBottom: 20 },
  qrPanel: { width: '100%', backgroundColor: k.colors.surface, borderRadius: 10, padding: 20, gap: 18, alignItems: 'center', borderWidth: 1, borderColor: k.colors.outline },
  qrPanelWide: { flexDirection: 'row', alignItems: 'stretch' },
  qrVisual: { width: '100%', maxWidth: 320, alignItems: 'center', justifyContent: 'center' },
  qrCopy: { flex: 1, minWidth: 0, gap: 12, justifyContent: 'center', alignItems: 'flex-start' },
  qrTitle: { ...k.type.section, color: k.colors.text },
  qrBox: { padding: 8, backgroundColor: '#FFFFFF', borderRadius: 12 },
  qrHint: { ...k.type.body, color: k.colors.textMuted, textAlign: 'center' },
  privacy: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
});
