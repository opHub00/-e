import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useAttached } from '../../features/adminPortal/useIsWide';
import { BUCKET_LABELS, type KioskBucket } from '../../features/eventKiosk/evaluate';
import { kioskEvent } from '../../features/eventKiosk/kioskEvent';
import { createResultSession } from '../../features/eventKiosk/resultSessionClient';
import { buildSummary, type SummaryItem } from '../../features/eventKiosk/summary';
import { useKioskStore } from '../../features/eventKiosk/useKioskStore';
import { KioskButton, Notice } from '../../features/eventKiosk/ui/controls';
import { KioskFrame } from '../../features/eventKiosk/ui/KioskFrame';
import { goBack, resetToHome } from '../../features/eventKiosk/ui/navigation';
import { QrCode } from '../../features/eventKiosk/ui/QrCode';
import { EmptyState } from '../../features/eventKiosk/ui/resultParts';
import { bucketTone, k } from '../../features/eventKiosk/ui/theme';
import { Appear } from '../../components/motion/Appear';
import { travel } from '../../design/motion';
import { Emphasis } from '../../features/eventKiosk/motion/Emphasis';
import { useKioskWidth } from '../../features/eventKiosk/ui/useKioskWidth';

/** 최종 요약. 휴대폰으로 가져갈 수 있게 QR 을 만들고, 끝나면 처음 화면으로. */
export default function SummaryScreen() {
  const load = kioskEvent();
  const attached = useAttached();
  const width = useKioskWidth();
  const evaluation = useKioskStore(state => state.evaluation);
  const favorites = useKioskStore(state => state.favorites);
  const householdType = useKioskStore(state => state.answers.householdType);
  const [session, setSession] = useState<
    { status: 'idle' } | { status: 'creating' } | { status: 'ready'; link: string; expiresAt: string } | { status: 'error' }
  >({ status: 'idle' });

  const summary = useMemo(
    () => (load.ok && evaluation ? buildSummary({ eventId: load.event.config.id, householdType, evaluation, favoriteIds: favorites }) : null),
    [evaluation, favorites, householdType, load],
  );
  const showQr = session.status === 'ready';

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
  if (!summary) {
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
          <View style={styles.qrPanel} testID="summary-qr-panel">
            <Text style={styles.qrTitle}>휴대폰 카메라로 찍어 주세요</Text>
            {session.status === 'ready' ? (
              <>
                {/* data-link: 자동 점검이 QR 이 담은 주소를 그대로 따라가 볼 수 있게. */}
                <View style={styles.qrBox} {...({ dataSet: { link: session.link } } as object)}><QrCode value={session.link} size={300} testID="summary-qr-code" /></View>
                <Text style={styles.qrHint}>요약이 휴대폰 화면에 열려요. 앱 설치가 필요 없고 6시간 뒤 만료돼요.</Text>
              </>
            ) : (
              <Notice tone="warn">이 기기에서는 휴대폰 링크를 만들 수 없어요. 행사 설정의 공유 주소를 확인해 주세요.</Notice>
            )}
            <View style={styles.privacy}>
              <MaterialIcons name="lock" size={22} color={k.colors.textMuted} />
              <Text style={styles.muted}>QR에는 임시 결과를 찾는 무작위 token만 들어가요. 이름·생년월일·소득·자산은 임시 요약에도 저장하지 않아요.</Text>
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
              label={session.status === 'creating' ? '임시 링크 만드는 중…' : '휴대폰으로 가져가기'}
              icon="smartphone"
              onPress={() => void makeQr()}
              disabled={session.status === 'creating'}
              large
            />
          </>
        )
      }
    >
      {session.status === 'error' ? <Notice tone="warn">임시 결과 링크를 만들지 못했어요. 행사 RC 서버가 실행 중인지 확인한 뒤 다시 시도해 주세요.</Notice> : null}
      <View style={[styles.layout, wide && styles.layoutWide]}>
        {/* 좁은 화면에서는 QR 을 맨 위에 둔다. 버튼을 누른 뒤 스크롤하지 않아도 바로 보이게. */}
        {showQr && !wide ? qrPanel : null}
        <View style={styles.main} testID="summary">
          <Text style={styles.title} accessibilityRole="header">나의 청약 분석 요약</Text>
          <Card title="분석 요약" icon="person-search">
            <Text style={styles.body}>{summary.household ? `${summary.household} 기준으로 ` : ''}공고별 신청 조건을 확인했어요.</Text>
            <View style={styles.counts}>
              {(Object.keys(BUCKET_LABELS) as KioskBucket[]).map(bucket => (
                <View key={bucket} style={[styles.count, { backgroundColor: bucketTone[bucket].bg }]}>
                  <Text style={[styles.countValue, { color: bucketTone[bucket].fg }]}>{summary.counts[bucket]}</Text>
                  <Text style={[styles.countLabel, { color: bucketTone[bucket].fg }]}>{BUCKET_LABELS[bucket]}</Text>
                </View>
              ))}
            </View>
          </Card>
          <Card title="추천 공고" icon="thumb-up">
            <Items items={summary.recommended} empty="지금 정보로 바로 신청할 수 있는 공고는 없어요. 추가 확인이 필요한 공고를 먼저 살펴보세요." />
          </Card>
          <Card title={`선택한 관심 공고 ${summary.favorites.length}개`} icon="star">
            <Items items={summary.favorites} empty="담은 관심 공고가 없어요." />
            {summary.favorites.length ? null : <KioskButton label="관심 공고 담으러 가기" variant="soft" onPress={() => router.push('/event/results' as never)} />}
          </Card>
          <Card title="주요 주의사항" icon="report-problem">
            {summary.cautions.length
              ? summary.cautions.map(item => <Text key={item} style={styles.body}>· {item}</Text>)
              : <Text style={styles.muted}>따로 주의할 조건이 없어요.</Text>}
            <Text style={styles.muted}>· 입력한 정보로 계산한 예상 결과예요. 실제 자격은 모집공고와 증빙 서류로 확정돼요.</Text>
          </Card>
        </View>

        {showQr && wide ? qrPanel : null}
      </View>
    </KioskFrame>
  );
}

function Card({ title, icon, children }: { title: string; icon: React.ComponentProps<typeof MaterialIcons>['name']; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <MaterialIcons name={icon} size={26} color={k.colors.primary} />
        <Text style={styles.cardTitle} accessibilityRole="header">{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Items({ items, empty }: { items: SummaryItem[]; empty: string }) {
  if (!items.length) return <Text style={styles.muted}>{empty}</Text>;
  return (
    <View style={styles.items}>
      {items.map(item => (
        <View key={`${item.title}-${item.supply}`} style={styles.item}>
          <View style={[styles.dot, { backgroundColor: bucketTone[item.bucket].fg }]} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.itemTitle}>{item.title}</Text>
            <Text style={styles.muted}>
              {item.supply} · {BUCKET_LABELS[item.bucket]}{item.stage ? ` · ${item.stage}` : ''}
            </Text>
            {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layout: { gap: 24 },
  layoutWide: { flexDirection: 'row', alignItems: 'flex-start' },
  main: { flex: 1, gap: 18 },
  title: { ...k.type.hero, color: k.colors.text, marginBottom: 8 },
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
  qrWrap: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  qrPanel: { width: '100%', backgroundColor: k.colors.surface, borderRadius: 20, padding: 28, gap: 18, alignItems: 'center', borderWidth: 1, borderColor: k.colors.outline },
  qrTitle: { ...k.type.section, color: k.colors.text, textAlign: 'center' },
  qrBox: { padding: 8, backgroundColor: '#FFFFFF', borderRadius: 12 },
  qrHint: { ...k.type.body, color: k.colors.textMuted, textAlign: 'center' },
  privacy: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
});
