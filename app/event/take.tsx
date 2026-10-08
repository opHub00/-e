import { useEffect, useState } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BUCKET_LABELS, type KioskBucket } from '../../features/eventKiosk/evaluate';
import { isOpaqueResultToken, readResultSession } from '../../features/eventKiosk/resultSessionClient';
import type { ResultSummary } from '../../features/eventKiosk/summary';
import { isRenderableSummary } from '../../features/eventKiosk/experience/safeSummary';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { bucketTone, k } from '../../features/eventKiosk/ui/theme';

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
        <View style={styles.brandRow}><View style={styles.mark}><Text style={styles.markText}>e</Text></View><Text style={styles.brand}>완판e</Text></View>
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

function Group({ title, items, empty }: { title: string; items: ResultSummary['recommended']; empty: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.section}>{title}</Text>
      {items.length ? items.map(item => (
        <View key={`${item.title}-${item.supply}`} style={styles.item}>
          <Text style={styles.itemTitle}>{item.title}</Text>
          <Text style={styles.muted}>{item.supply} · {BUCKET_LABELS[item.bucket]}{item.stage ? ` · ${item.stage}` : ''}</Text>
          {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
        </View>
      )) : <Text style={styles.muted}>{empty}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: k.colors.background },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48, alignItems: 'center' },
  inner: { width: '100%', maxWidth: 560, gap: 16 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 8 },
  mark: { width: 40, height: 40, borderRadius: 12, backgroundColor: k.colors.primary, alignItems: 'center', justifyContent: 'center' },
  markText: { ...k.type.bodyLgStrong, color: k.colors.onPrimary },
  brand: { ...k.type.section, color: k.colors.primary },
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
  retry: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, borderRadius: 12, backgroundColor: k.colors.primary, marginTop: 4 },
  retryText: { ...k.type.bodyStrong, color: k.colors.onPrimary },
  invalidIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: k.colors.primaryFixed, alignItems: 'center', justifyContent: 'center' },
});
