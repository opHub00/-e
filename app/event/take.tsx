import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BUCKET_LABELS, type KioskBucket } from '../../features/eventKiosk/evaluate';
import { isOpaqueResultToken, readResultSession } from '../../features/eventKiosk/resultSessionClient';
import type { ResultSummary } from '../../features/eventKiosk/summary';
import { bucketTone, k } from '../../features/eventKiosk/ui/theme';

/**
 * 방문자 휴대폰에서 열리는 요약. URL에는 opaque token만 있고, 개인정보를
 * 제외한 임시 요약은 행사 RC 서버 메모리에서 6시간 동안만 조회한다.
 */
export default function TakeAway() {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'invalid' } | { status: 'ok'; summary: ResultSummary }>({ status: 'loading' });

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') { setState({ status: 'invalid' }); return; }
    const token = new URLSearchParams(window.location.search).get('token') ?? '';
    if (!isOpaqueResultToken(token)) { setState({ status: 'invalid' }); return; }
    let active = true;
    void readResultSession(window.location.origin, token)
      .then(summary => { if (active) setState(summary ? { status: 'ok', summary } : { status: 'invalid' }); })
      .catch(() => { if (active) setState({ status: 'invalid' }); });
    return () => { active = false; };
  }, []);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.inner}>
        <Text style={styles.brand}>완판e</Text>
        {state.status === 'loading' ? <Text style={styles.muted}>요약을 여는 중이에요…</Text> : null}
        {state.status === 'invalid' ? (
          <View style={styles.card} testID="take-invalid">
            <Text style={styles.title}>요약을 읽을 수 없어요</Text>
            <Text style={styles.muted}>token이 잘못되었거나 임시 결과가 만료됐어요. 행사 기기에서 QR을 다시 만들어 주세요.</Text>
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
  content: { padding: 16, alignItems: 'center' },
  inner: { width: '100%', maxWidth: 560, gap: 16 },
  brand: { ...k.type.section, color: k.colors.primary },
  stack: { gap: 14 },
  title: { ...k.type.title, color: k.colors.text },
  section: { ...k.type.bodyLgStrong, color: k.colors.text },
  body: { ...k.type.body, color: k.colors.text },
  muted: { ...k.type.caption, color: k.colors.textMuted },
  note: { ...k.type.caption, color: k.tint.amber.fg },
  card: { backgroundColor: k.colors.surface, borderRadius: 18, padding: 18, gap: 10, borderWidth: 1, borderColor: k.colors.surfaceHigh },
  counts: { flexDirection: 'row', gap: 8 },
  count: { flex: 1, borderRadius: 14, padding: 12, gap: 2 },
  countValue: { ...k.type.section },
  countLabel: { ...k.type.caption },
  item: { gap: 2, paddingVertical: 6 },
  itemTitle: { ...k.type.bodyStrong, color: k.colors.text },
});
