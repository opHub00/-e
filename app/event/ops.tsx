import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Snapshot = {
  period: 'LAST_24_HOURS'; approximate: boolean;
  baseline: { noticeIds: string[]; noticeVersion: string; noticeTitles: string[]; sourceStatus: 'STAGING_EVENT_FINAL_UNVERIFIED' };
  metrics: { consultationSessions: number; completedSessions: number; resultViewedSessions: number;
    registeredContacts: number; deliveryRequested: number; deliveryUnconfigured: number };
  contacts: Array<{ phoneMasked: string; deliveryStatus: string; registeredAt: string | null }>;
};

const labels: Array<[keyof Snapshot['metrics'], string]> = [
  ['consultationSessions', '상담 시작 세션'], ['completedSessions', '상담 완료 세션'],
  ['resultViewedSessions', '결과 조회 세션'], ['registeredContacts', '연락처 등록'],
  ['deliveryRequested', '결과 전달 요청'],
];

export default function EventOps() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch('/event-api/public-ops', { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error(response.status === 404 ? '행사 시연 화면이 비활성화되어 있습니다.' : '시연 데이터를 불러오지 못했습니다.');
      return response.json() as Promise<Snapshot>;
    }).then(data => { if (alive) { setSnapshot(data); setError(null); } })
      .catch(reason => { if (alive) { setSnapshot(null); setError(reason instanceof Error ? reason.message : '시연 데이터를 불러오지 못했습니다.'); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [refresh]);

  return <ScrollView style={styles.page} contentContainerStyle={styles.body}>
    <Text style={styles.eyebrow}>완판e · 행사 운영 시연</Text>
    <Text style={styles.title}>최근 24시간 상담 현황</Text>
    <Text style={styles.description}>삼도이동 행사 기준 Staging QA 데이터입니다. 공식 게시 확인 전이며, 이 화면은 읽기 전용입니다.</Text>
    <Pressable accessibilityRole="button" style={styles.refresh} onPress={() => setRefresh(value => value + 1)}>
      <Text style={styles.refreshText}>새로고침</Text>
    </Pressable>
    {loading ? <ActivityIndicator accessibilityLabel="데이터를 불러오는 중" /> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {snapshot ? <>
      <Text style={styles.description}>{snapshot.baseline.noticeTitles.join(' · ')} · {snapshot.baseline.noticeVersion} · 공식 원문 확인 전</Text>
      {snapshot.approximate ? <Text style={styles.notice}>이벤트가 5,000건을 넘어 세션 지표는 일부만 집계되었습니다.</Text> : null}
      <View style={styles.grid}>{labels.map(([key, label]) => <View key={key} style={styles.card}>
        <Text style={styles.cardLabel}>{label}</Text><Text style={styles.cardValue}>{snapshot.metrics[key].toLocaleString()}</Text>
      </View>)}</View>
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>결과 전달 상태</Text>
        <Text style={styles.description}>SMS 사업자가 연결되지 않은 요청은 실제 발송으로 표시하지 않습니다.</Text>
        <Text style={styles.status}>PROVIDER_UNCONFIGURED · 최근 24시간 {snapshot.metrics.deliveryUnconfigured}건</Text>
      </View>
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>최근 등록 연락처</Text>
        {snapshot.contacts.length ? snapshot.contacts.map((row, index) => <View key={`${index}-${row.registeredAt}`} style={styles.row}>
          <Text style={styles.phone}>{row.phoneMasked}</Text>
          <Text style={styles.rowStatus}>{row.deliveryStatus}</Text>
        </View>) : <Text style={styles.description}>등록된 연락처가 없습니다.</Text>}
      </View>
    </> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f5f7fb' }, body: { width: '100%', maxWidth: 900, alignSelf: 'center', padding: 24, gap: 16 },
  eyebrow: { color: '#3659a0', fontSize: 14, fontWeight: '700' },
  title: { color: '#18263e', fontSize: 32, fontWeight: '800' },
  description: { color: '#536278', fontSize: 15, lineHeight: 23 },
  refresh: { alignSelf: 'flex-start', backgroundColor: '#163c78', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12 },
  refreshText: { color: 'white', fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { minWidth: 150, flexGrow: 1, backgroundColor: 'white', borderRadius: 16, padding: 18 },
  cardLabel: { color: '#536278', fontSize: 14 }, cardValue: { color: '#18263e', fontSize: 30, fontWeight: '800', marginTop: 8 },
  panel: { backgroundColor: 'white', borderRadius: 16, padding: 18, gap: 10 },
  sectionTitle: { color: '#18263e', fontSize: 20, fontWeight: '700' },
  status: { color: '#9b5a12', fontWeight: '700' }, row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#e7ebf2' },
  phone: { color: '#18263e', fontWeight: '700' }, rowStatus: { color: '#536278', fontSize: 12 },
  error: { color: '#b22b2b', fontSize: 15 }, notice: { color: '#9b5a12', fontSize: 14 },
});
