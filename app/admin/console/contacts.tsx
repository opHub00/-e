import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ConsoleShell, useConsole, type ConsoleMode } from '../../../features/adminConsole/ConsoleShell';
import { connectedContacts, type AdminContactPage } from '../../../features/adminConsole/contactSource';
import { connectedAnalytics } from '../../../features/adminConsole/source';
import type { AnalyticsSummary } from '../../../features/productV3/analytics/contract';
import { useAuthStore } from '../../../features/auth/useAuthStore';
import { AdminButton } from '../../../features/adminPortal/ui/AdminKit';
import { colors, radius, spacing, type } from '../../../design/tokens';

export default function ConsultationContactsScreen() {
  return <ConsoleShell menuKey="contacts" title="상담 결과 전달" subtitle="동의한 연락처와 결과 전달 상태만 확인합니다. 상세 답변·소득·자산은 표시하지 않습니다."
    testID="console-contacts" needs={['승인 관리자 권한', '별도 연락처 저장소']}>
    {(_snapshot, mode) => <Contacts mode={mode} />}
  </ConsoleShell>;
}

function Contacts({ mode }: { mode: ConsoleMode }) {
  const token = useAuthStore(state => state.session?.access_token ?? null);
  const { refreshCount } = useConsole();
  const [cursor, setCursor] = useState(0);
  const [page, setPage] = useState<AdminContactPage | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (mode !== 'CONNECTED' || !token) return;
    let active = true;
    setLoading(true); setError('');
    void connectedContacts(token, cursor).then(result => { if (active) setPage(result); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error && reason.message === 'FORBIDDEN' ? '관리자 권한이 필요해요.' : '연락처 데이터를 불러올 수 없어요.'); })
      .finally(() => { if (active) setLoading(false); });
    const to = new Date(); const from = new Date(to.getTime() - 30 * 86_400_000);
    void connectedAnalytics(token, { from: from.toISOString(), to: to.toISOString(), environment: 'staging', trafficType: 'qa' })
      .then(result => { if (active) setAnalytics(result); }).catch(() => { if (active) setAnalytics(null); });
    return () => { active = false; };
  }, [cursor, mode, refreshCount, token]);
  if (mode !== 'CONNECTED') return <Text style={styles.note}>연락처 예시 데이터는 제공하지 않습니다. 승인 관리자 계정으로 실제 Staging에서 확인해 주세요.</Text>;
  if (loading && !page) return <Text style={styles.note}>연락처 등록 현황을 불러오는 중…</Text>;
  if (error) return <Text testID="console-contacts-error" style={styles.note}>{error}</Text>;
  if (!page) return <Text style={styles.note}>아직 불러온 데이터가 없어요.</Text>;
  return <View style={styles.stack}>
    <Text style={styles.note}>익명 Analytics · Staging QA · 최근 30일 (사람 수가 아닌 세션)</Text>
    <View style={styles.metrics} testID="console-contact-session-metrics">
      <Metric label="상담 시작 세션" count={analytics?.sessionsStarted ?? null} />
      <Metric label="판정 완료 세션" count={analytics?.assessmentsCompleted ?? null} />
      <Metric label="결과 조회 세션" count={analytics?.resultViews ?? null} />
    </View>
    <Text style={styles.note}>연락처·전달 상태 · Staging 저장소 전체 (익명 세션 집계와 합산하지 않음)</Text>
    <View style={styles.metrics} testID="console-contact-metrics">
      <Metric label="연락처 등록 건" count={page.metrics.registered} />
      <Metric label="결과 전달 요청 건" count={page.metrics.requested} />
      <Metric label="전달 성공 건" count={page.metrics.sent} />
      <Metric label="전달 실패 건" count={page.metrics.failed} />
      <Metric label="SMS 미연결 건" count={page.metrics.unconfigured} />
    </View>
    <Text style={styles.note}>연락처 등록 건수도 사람 수가 아닙니다. 더 자세한 익명 지표는 ‘운영 지표’에서 확인하세요.</Text>
    {page.rows.length === 0 ? <Text style={styles.note}>등록된 연락처가 없습니다.</Text> : page.rows.map(row => <View key={row.id} style={styles.card} testID="console-contact-row">
      <Text style={styles.name}>{row.name} · {row.phoneMasked}</Text>
      <Text style={styles.note}>상담 {row.consultationAt.slice(0, 16).replace('T', ' ')} · 공고 {row.noticeId}</Text>
      <Text style={styles.note}>결과 {resultLabel(row.resultStatus)} · 전달 {deliveryLabel(row.deliveryStatus)}</Text>
    </View>)}
    <View style={styles.actions}>
      {cursor > 0 ? <AdminButton label="이전" onPress={() => setCursor(Math.max(0, cursor - 25))} /> : null}
      {page.nextCursor !== null ? <AdminButton label="더 보기" onPress={() => setCursor(page.nextCursor!)} /> : null}
    </View>
  </View>;
}

const resultLabel = (value: string) => ({ ELIGIBLE: '신청 가능', CONDITIONAL: '조건 확인', INELIGIBLE: '신청 어려움', EVIDENCE_REQUIRED: '서류 확인 필요', NOT_DETERMINED: '판정 미확정' }[value] ?? '확인 필요');
const deliveryLabel = (value: string) => ({ REQUESTED: '요청됨', PROVIDER_UNCONFIGURED: 'SMS 미연결', SENDING: '전송 중', SENT: '전송 완료', FAILED: '전송 실패', EXPIRED: '링크 만료' }[value] ?? '확인 필요');
function Metric({ label, count }: { label: string; count: number | null }) { return <View style={styles.metric}><Text style={styles.name}>{count === null ? '조회 불가' : count.toLocaleString('ko-KR')}</Text><Text style={styles.note}>{label}</Text></View>; }
const styles = StyleSheet.create({
  stack: { gap: spacing.md }, metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: { minWidth: 140, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.card },
  card: { padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.card, gap: 4 },
  actions: { flexDirection: 'row', gap: spacing.sm }, name: { ...type.bodyStrong, color: colors.text },
  note: { ...type.caption, color: colors.textMuted },
});
