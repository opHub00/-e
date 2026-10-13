import { useEffect, useState } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BUCKET_LABELS, type KioskBucket } from '../../features/eventKiosk/evaluate';
import { isOpaqueResultToken, readResultSession } from '../../features/eventKiosk/resultSessionClient';
import type { PortfolioSummaryItem, ResultSummary, ResultSummaryV2 } from '../../features/eventKiosk/summary';
import { isRenderableSummary } from '../../features/eventKiosk/experience/safeSummary';
import { KIOSK_STATUS_LABELS, OFFICIAL_SCORE_STATUS_LABELS } from '../../features/eventKiosk/presentation';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { bucketTone, k } from '../../features/eventKiosk/ui/theme';
import { BrandMark } from '../../features/eventKiosk/brand/BrandMark';
import { PartnerBadge } from '../../features/eventKiosk/brand/PartnerBadge';
import { SAMDO_DEEP_RULE_PACKAGE } from '../../features/eventKiosk/samdo/rulePackage';

/** 삼도이동 1지구 전용 결과에서 만든 요약인지(제목이 그 공고). 그때만 파트너를 보여 준다. */
const isSamdoSummary = (summary: ResultSummary) =>
  [...summary.recommended, ...summary.favorites].some(item => item.title === SAMDO_DEEP_RULE_PACKAGE.title);

/**
 * 방문자 휴대폰에서 열리는 요약. URL에는 opaque token만 있고, 개인정보를
 * 제외한 임시 요약은 행사 RC 서버 메모리에서 6시간 동안만 조회한다.
 */
export default function TakeAway() {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'invalid' } | { status: 'unreachable' } | { status: 'ok'; summary: ResultSummary }>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') { setState({ status: 'invalid' }); return; }
    const token = new URLSearchParams(window.location.search).get('token') ?? '';
    if (!isOpaqueResultToken(token)) { setState({ status: 'invalid' }); return; }
    let active = true;
    void readResultSession(window.location.origin, token)
      .then(summary => { if (active) setState(summary && isRenderableSummary(summary) ? { status: 'ok', summary } : { status: 'invalid' }); })
      // 링크가 잘못된 것과 잠깐 연결이 안 되는 것은 다르다. 연결 문제면 다시 시도할 수 있게 둔다.
      .catch(() => { if (active) setState({ status: 'unreachable' }); });
    return () => { active = false; };
  }, [attempt]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.inner}>
        <View style={styles.brandRow}>
          <BrandMark size="mobile" />
          {state.status === 'ok' && isSamdoSummary(state.summary) ? <PartnerBadge compact /> : null}
        </View>
        {state.status === 'loading' ? <Text style={styles.muted}>요약을 여는 중이에요…</Text> : null}
        {state.status === 'invalid' ? (
          <View style={styles.card} testID="take-invalid">
            <View style={styles.invalidIcon}><MaterialIcons name="link-off" size={28} color={k.colors.primary} /></View>
            <Text style={styles.title}>요약을 읽을 수 없어요</Text>
            <Text style={styles.muted}>링크가 잘못되었거나 임시 결과 보관 시간이 지났어요. 결과는 개인정보 보호를 위해 잠시만 보관돼요. 행사장에서 QR을 다시 받아 주세요.</Text>
          </View>
        ) : null}
        {state.status === 'unreachable' ? (
          <View style={styles.card} testID="take-unreachable">
            <View style={styles.invalidIcon}><MaterialIcons name="wifi-off" size={28} color={k.colors.primary} /></View>
            <Text style={styles.title}>요약을 불러오지 못했어요</Text>
            <Text style={styles.muted}>인터넷 연결을 확인한 뒤 다시 시도해 주세요.</Text>
            <MotionPressable accessibilityRole="button" accessibilityLabel="다시 시도" onPress={() => { setState({ status: 'loading' }); setAttempt(value => value + 1); }} style={styles.retry}>
              <MaterialIcons name="refresh" size={22} color={k.colors.onPrimary} />
              <Text style={styles.retryText}>다시 시도</Text>
            </MotionPressable>
          </View>
        ) : null}
        {state.status === 'ok' ? <Summary summary={state.summary} /> : null}
      </View>
    </ScrollView>
  );
}

function Summary({ summary }: { summary: ResultSummary }) {
  if (summary.v === 2) return <PortfolioSummary summary={summary} />;
  return (
    <View style={styles.stack} testID="take-summary">
      <Text style={styles.title}>나의 청약 분석 요약</Text>
      <Text style={styles.muted}>{summary.date.replace(/-/g, '.')} 분석{summary.household ? ` · ${summary.household}` : ''}</Text>
      <View style={styles.counts}>
        {(Object.keys(BUCKET_LABELS) as KioskBucket[]).map(bucket => (
          <View key={bucket} style={[styles.count, { backgroundColor: bucketTone[bucket].bg }]}>
            <Text style={[styles.countValue, { color: bucketTone[bucket].fg }]}>{summary.counts[bucket]}</Text>
            <Text style={[styles.countLabel, { color: bucketTone[bucket].fg }]}>{BUCKET_LABELS[bucket]}</Text>
          </View>
        ))}
      </View>
      <Group title="추천 공고" items={summary.recommended} empty="바로 신청할 수 있는 공고는 없었어요." />
      <Group title="관심 공고" items={summary.favorites} empty="담은 관심 공고가 없어요." />
      <View style={styles.card}>
        <Text style={styles.section}>주의사항</Text>
        {summary.cautions.map(item => <Text key={item} style={styles.body}>· {item}</Text>)}
        <Text style={styles.muted}>· 입력한 정보로 계산한 예상 결과예요. 실제 자격은 모집공고와 증빙 서류로 확정돼요.</Text>
      </View>
    </View>
  );
}

function PortfolioSummary({ summary }: { summary: ResultSummaryV2 }) {
  const best = summary.recommended[0] ?? null;
  const favoriteKeys = new Set(summary.favorites.map(itemKey));
  const alternatives = summary.recommended.filter(item => itemKey(item) !== itemKey(best) && !favoriteKeys.has(itemKey(item))).slice(0, 3);
  return (
    <View style={styles.stack} testID="take-summary">
      <Text style={styles.title}>내가 다시 확인할 청약 공고 모음</Text>
      <Text style={styles.muted}>추천·관심 공고와 신청 일정을 다시 확인하세요. · {summary.date.replace(/-/g, '.')} 분석</Text>
      <View style={styles.guidance}><Text style={styles.guidanceText}>신청 가능 {summary.counts.eligible} · 추가 확인 필요 {summary.counts.review} · 신청 어려움 {summary.counts.difficult}. 완판e 판단은 공식 점수·당첨 확률이 아닙니다.</Text></View>
      <PortfolioGroup title="나에게 가장 맞는 공고" items={best ? [best] : []} empty="지금 정보로 바로 신청할 수 있는 공고는 없어요." emphasis />
      <PortfolioGroup title={`관심 공고 ${summary.favorites.length}개`} items={summary.favorites} empty="담은 관심 공고가 없어요." />
      <PortfolioGroup title="함께 검토할 공고" items={alternatives} empty="추가로 검토할 공고가 없어요." />
      <View style={styles.card}>
        <Text style={styles.section}>신청 일정 · 다시 확인할 날짜</Text>
        {[best, ...summary.favorites, ...alternatives].filter((item): item is PortfolioSummaryItem => Boolean(item)).filter(uniqueSummaryItem).map(item => <Text key={`schedule-${itemKey(item)}`} style={styles.body}>{item.title} · {dateRange(item)}</Text>)}
      </View>
      <View style={styles.card}>
        <Text style={styles.section}>추가 확인사항 · 주변환경</Text>
        {summary.cautions.length ? summary.cautions.map(item => <Text key={item} style={styles.note}>확인 · {item}</Text>) : <Text style={styles.muted}>따로 확인할 점이 없어요.</Text>}
        <Text style={styles.muted}>입력한 정보로 계산한 예상 결과예요. 실제 자격은 모집공고와 증빙 서류로 확정돼요.</Text>
      </View>
    </View>
  );
}

const itemKey = (item: PortfolioSummaryItem | null) => item ? `${item.title}\u0000${item.supply}` : '';
function uniqueSummaryItem(item: PortfolioSummaryItem, index: number, items: PortfolioSummaryItem[]) { return items.findIndex(candidate => itemKey(candidate) === itemKey(item)) === index; }
function dateRange(item: PortfolioSummaryItem) { return item.applicationStart || item.applicationEnd ? `${item.applicationStart ?? '확인 필요'} ~ ${item.applicationEnd ?? '확인 필요'}` : '일정 확인 필요'; }

function PortfolioGroup({ title, items, empty, emphasis }: { title: string; items: PortfolioSummaryItem[]; empty: string; emphasis?: boolean }) {
  return <View style={styles.portfolioGroup}><Text style={styles.groupTitle}>{title}</Text>{items.length ? items.map(item => <PortfolioCard key={itemKey(item)} item={item} emphasis={emphasis} />) : <View style={styles.card}><Text style={styles.muted}>{empty}</Text></View>}</View>;
}

function PortfolioCard({ item, emphasis }: { item: PortfolioSummaryItem; emphasis?: boolean }) {
  const status = item.status === 'INFORMATION_ONLY' ? '공고 정보만 제공' : KIOSK_STATUS_LABELS[item.status];
  return (
    <View style={[styles.portfolioCard, emphasis && styles.portfolioCardEmphasis]}>
      <Text style={styles.itemTitle}>{item.title}</Text>
      <Text style={styles.supply}>{item.supply}</Text>
      <Text style={[styles.body, { color: bucketTone[item.bucket].fg }]}>✓ {status}{item.stage ? ` · ${item.stage}` : ''}</Text>
      <View style={styles.axes}>
        <View style={styles.axis}><Text style={styles.axisLabel}>공식 점수</Text><Text style={styles.axisValue}>{OFFICIAL_SCORE_STATUS_LABELS[item.officialScoreStatus]}</Text></View>
        <View style={[styles.axis, styles.axisWanpan]}><Text style={[styles.axisLabel, { color: k.colors.primary }]}>완판e 판단</Text><Text style={[styles.axisValue, { color: k.colors.primary }]}>{item.wanpanRecommendation}</Text></View>
      </View>
      {item.location ? <Text style={styles.muted}>위치 · {item.location}</Text> : null}
      {item.whyMatched.length ? <><Text style={styles.subsection}>왜 나와 맞는지</Text>{item.whyMatched.slice(0, 2).map(line => <Text key={line} style={styles.body}>✓ {line}</Text>)}</> : null}
      {item.cautions.length ? item.cautions.slice(0, 2).map(line => <Text key={line} style={styles.note}>추가 확인 · {line}</Text>) : null}
      <Text style={styles.body}>접수 일정 · {dateRange(item)}</Text>
      {item.nearbyHighlights.slice(0, 2).map(line => <Text key={line} style={styles.muted}>주변 · {line}</Text>)}
      <Text accessibilityRole="link" style={styles.source} onPress={() => void Linking.openURL(item.sourceUrl)}>공식 출처 · {item.sourceLabel}</Text>
    </View>
  );
}

function Group({ title, items, empty }: { title: string; items: ResultSummary['recommended']; empty: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.section}>{title}</Text>
      {items.length ? items.map(item => (
        <View key={`${item.title}-${item.supply}`} style={styles.item}>
          <Text style={styles.itemTitle}>{item.title}</Text>
          <Text style={styles.muted}>{item.supply} · {BUCKET_LABELS[item.bucket]}{item.stage ? ` · ${item.stage}` : ''}</Text>
          {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
          {'whyMatched' in item ? (
            <View style={styles.portfolioDetails}>
              {item.applicationStart || item.applicationEnd ? <Text style={styles.muted}>신청 일정 · {item.applicationStart ?? '확인 필요'} ~ {item.applicationEnd ?? '확인 필요'}</Text> : null}
              <Text style={styles.muted}>완판e 추천 · {item.wanpanRecommendation} · {OFFICIAL_SCORE_STATUS_LABELS[item.officialScoreStatus]}</Text>
              {item.whyMatched.map(line => <Text key={`why-${line}`} style={styles.body}>· {line}</Text>)}
              {item.cautions.slice(1).map(line => <Text key={`caution-${line}`} style={styles.note}>확인 · {line}</Text>)}
              {item.nearbyHighlights.map(line => <Text key={`near-${line}`} style={styles.muted}>주변 · {line}</Text>)}
              <Text accessibilityRole="link" style={styles.source} onPress={() => void Linking.openURL(item.sourceUrl)}>공식 출처 · {item.sourceLabel}</Text>
            </View>
          ) : null}
        </View>
      )) : <Text style={styles.muted}>{empty}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: k.colors.background },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48, alignItems: 'center' },
  inner: { width: '100%', maxWidth: 560, gap: 16 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 8 },
  stack: { gap: 14 },
  title: { ...k.type.title, color: k.colors.text },
  section: { ...k.type.bodyLgStrong, color: k.colors.text },
  body: { ...k.type.body, color: k.colors.text },
  muted: { ...k.type.caption, color: k.colors.textMuted },
  note: { ...k.type.caption, color: k.tint.amber.fg },
  card: { backgroundColor: k.colors.surface, borderRadius: 20, padding: 20, gap: 10, borderWidth: 1, borderColor: k.colors.outline },
  counts: { flexDirection: 'row', gap: 8 },
  count: { flex: 1, borderRadius: 12, padding: 12, gap: 2 },
  countValue: { ...k.type.section },
  countLabel: { ...k.type.caption },
  item: { gap: 2, paddingVertical: 6 },
  itemTitle: { ...k.type.bodyStrong, color: k.colors.text },
  portfolioDetails: { gap: 4, paddingTop: 4 },
  source: { ...k.type.caption, color: k.colors.primary, textDecorationLine: 'underline' },
  guidance: { backgroundColor: k.colors.lavender, borderRadius: 6, padding: 12 },
  guidanceText: { ...k.type.caption, color: k.colors.primary },
  portfolioGroup: { gap: 10 },
  groupTitle: { ...k.type.section, color: k.colors.text },
  portfolioCard: { backgroundColor: k.colors.surface, borderRadius: 10, padding: 18, gap: 9, borderWidth: 1, borderColor: k.colors.outline },
  portfolioCardEmphasis: { backgroundColor: k.colors.lavender },
  supply: { ...k.type.bodyStrong, color: k.colors.primary },
  subsection: { ...k.type.bodyStrong, color: k.colors.text, marginTop: 4 },
  axes: { flexDirection: 'row', gap: 8 },
  axis: { flex: 1, minWidth: 0, borderRadius: 6, borderWidth: 1, borderColor: k.colors.outline, backgroundColor: k.colors.surface, padding: 10, gap: 2 },
  axisWanpan: { borderWidth: 0, backgroundColor: k.colors.lavender },
  axisLabel: { ...k.type.caption, color: k.colors.textMuted },
  axisValue: { ...k.type.bodyStrong, color: k.colors.text },
  retry: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, borderRadius: 12, backgroundColor: k.colors.primary, marginTop: 4 },
  retryText: { ...k.type.bodyStrong, color: k.colors.onPrimary },
  invalidIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: k.colors.primaryFixed, alignItems: 'center', justifyContent: 'center' },
});
