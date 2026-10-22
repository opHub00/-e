import { useRouter } from 'expo-router';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors, spacing, type } from '../../../design/tokens';
import { AdminButton, EmptyState, KpiGrid, SectionCard } from '../../../features/adminPortal/ui/AdminKit';
import { ConsoleShell, useConsole } from '../../../features/adminConsole/ConsoleShell';
import { AlertList, LevelBadge, ReasonTag, ShareBars } from '../../../features/adminConsole/ConsoleKit';
import {
  aiSummary, ALERT_LEVEL_META, buildAlerts, buildDashboard, fallbackReasonMeta, maskPii, percent, shortTime, type AlertLevel,
} from '../../../features/adminConsole/consoleModel';
import { collected, emptyCopy } from '../../../features/adminConsole/consoleState';
import type { ConsoleSnapshot } from '../../../features/adminConsole/contract';

const analyticsCategoryLabel: Record<string, string> = {
  residency: '거주', subscription_account: '청약통장', income: '소득', assets: '자산',
  rewinning_restriction: '재당첨 제한', household: '세대·주택소유', marriage_child: '혼인·자녀',
  evidence: '증빙 확인', other: '기타 확인',
};

/**
 * 통합 운영 콘솔 대시보드. 운영자가 첫 화면에서 볼 순서 그대로:
 * 1 장애·오류 → 2 검토 필요 → 3 대체 답변 → 4 근거 실패 → 5 판정이 멈추는 곳 → 6 최근 공고 변경 → 7 일반 지표.
 */
export default function ConsoleDashboard() {
  return (
    <ConsoleShell
      menuKey="dashboard"
      title="대시보드"
      subtitle="지금 처리할 문제부터 위에 보여요. 아래로 갈수록 일반 지표예요."
      testID="console-dashboard"
      needs={['공고 상태 목록(Generic Notice)', '오늘 판정 집계', 'AI 상담 로그(mode·fallback·grounding)', '오류 로그']}
    >
      {snapshot => <Dashboard snapshot={snapshot} />}
    </ConsoleShell>
  );
}

function Dashboard({ snapshot }: { snapshot: ConsoleSnapshot }) {
  const { now, link } = useConsole();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const two = width >= 1100;
  const model = buildDashboard(snapshot);
  const alerts = buildAlerts(snapshot, now);
  const counts = (['ERROR', 'ACTION_REQUIRED', 'WARNING', 'INFO'] as AlertLevel[]).map(level => ({ level, count: alerts.filter(alert => alert.level === level).length })).filter(item => item.count);
  const aiCollected = collected(snapshot.coverage, 'ai');
  const assessmentsCollected = collected(snapshot.coverage, 'assessments');
  const day = snapshot.assessments.date;
  const aiToday = snapshot.ai.filter(event => event.at.slice(0, 10) === day);
  const fallbacks = aiToday.filter(event => event.mode === 'fallback');
  const reasons = Object.entries(fallbacks.reduce<Record<string, number>>((acc, event) => {
    const key = event.fallbackReason ?? 'unknown';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
  const grounding = aiToday.filter(event => event.groundingRejected).sort((a, b) => b.at.localeCompare(a.at));
  const review = snapshot.notices
    .map(notice => ({ notice, pending: snapshot.rules.filter(rule => rule.noticeId === notice.id && rule.status === 'PENDING'), fail: snapshot.rules.filter(rule => rule.noticeId === notice.id && rule.validation.status === 'FAIL').length }))
    .filter(item => item.notice.status === 'REVIEW_REQUIRED' || item.pending.length)
    .sort((a, b) => b.fail - a.fail || b.pending.length - a.pending.length);
  const total = Object.values(snapshot.assessments.byStatus).reduce((sum, count) => sum + count, 0);
  const summary = aiSummary(aiToday);

  const col = (node: React.ReactNode) => <View style={two ? styles.col : null}>{node}</View>;
  return (
    <View style={styles.stack}>
      {/* 1. 장애·오류 + 모든 알림(수준 순) */}
      <SectionCard title="지금 확인할 일" description={counts.length ? counts.map(item => `${ALERT_LEVEL_META[item.level].label} ${item.count}`).join(' · ') : '오류·조치 필요 항목이 없어요'}>
        <AlertList alerts={alerts} onOpen={alert => router.push(link(`/admin/console${alert.target === 'dashboard' ? '' : `/${alert.target}`}`))} />
      </SectionCard>

      {/* 2. 검토 필요 */}
      <SectionCard
        title={`검토 대기 공고 ${review.length}건`}
        description="승인 전 규칙이 남은 공고예요. 검증 실패가 많은 공고부터."
        action={review.length ? <AdminButton label="규칙 검토로" tone="quiet" icon="chevron-right" onPress={() => router.push(link('/admin/console/rules'))} /> : undefined}
      >
        <View testID="console-review-queue" style={styles.list}>
          {review.length ? review.slice(0, 5).map(item => (
            <View key={item.notice.id} style={styles.line}>
              <View style={styles.lineCopy}>
                <Text style={styles.lineTitle} numberOfLines={2}>{item.notice.title}</Text>
                <Text style={styles.lineMeta}>승인 전 규칙 {item.pending.length}건{item.fail ? ` · 검증 실패 ${item.fail}건` : ''}</Text>
              </View>
              {item.fail ? <LevelBadge level="ACTION_REQUIRED" /> : null}
            </View>
          )) : <Text style={styles.lineMeta}>검토를 기다리는 공고가 없어요.</Text>}
          {review.length > 5 ? <Text style={styles.lineMeta}>외 {review.length - 5}건은 규칙 검토 화면에서 볼 수 있어요.</Text> : null}
        </View>
      </SectionCard>

      {/* 3·4. AI 품질 */}
      <View style={[styles.grid, two && styles.gridTwo]}>
        {col(
          <SectionCard title="대체 답변" description={aiCollected ? `오늘 ${aiToday.length}건 중 ${fallbacks.length}건 · ${percent(summary.fallbackRate)}` : '수집 전'}>
            {!aiCollected || !aiToday.length ? <EmptyState {...emptyCopy('ai', aiCollected)} /> : (
              <View testID="console-fallback-reasons" style={styles.list}>
                {reasons.length ? reasons.map(([reason, count]) => (
                  <View key={reason} style={styles.reasonRow}>
                    <ReasonTag reason={reason} />
                    <Text style={styles.count}>{count}건</Text>
                  </View>
                )) : <Text style={styles.lineMeta}>오늘 대체 답변이 없어요.</Text>}
              </View>
            )}
          </SectionCard>,
        )}
        {col(
          <SectionCard title={`근거 검증 실패 ${aiCollected ? `${grounding.length}건` : ''}`} description="답변이 공고 근거와 맞지 않아 폐기된 질문">
            {!aiCollected ? <EmptyState {...emptyCopy('ai', false)} /> : (
              <View testID="console-grounding" style={styles.list}>
                {grounding.length ? grounding.slice(0, 3).map(event => (
                  <View key={event.id} style={styles.line}>
                    <Text style={styles.time}>{shortTime(event.at)}</Text>
                    <View style={styles.lineCopy}>
                      <Text style={styles.lineTitle} numberOfLines={2}>{maskPii(event.question).text}</Text>
                      <Text style={styles.lineMeta}>{fallbackReasonMeta(event.fallbackReason)?.label ?? '근거 검증 실패'} · 근거 {event.evidenceCount}건</Text>
                    </View>
                  </View>
                )) : <Text style={styles.lineMeta}>오늘 근거 검증 실패가 없어요.</Text>}
              </View>
            )}
          </SectionCard>,
        )}
      </View>

      {/* 5. 판정이 멈추는 곳 */}
      <SectionCard
        title="사용자가 가장 많이 막히는 항목"
        description={assessmentsCollected && total ? `추가 입력 필요 ${percent(snapshot.assessments.byStatus.NEEDS_USER_INPUT / total)} · 질문 문구나 안내를 먼저 손볼 곳이에요.` : '판정 집계 기준'}
      >
        {!assessmentsCollected || !model.blockers.length
          ? <EmptyState {...emptyCopy('assessments', assessmentsCollected)} />
          : <ShareBars testID="console-blockers" hideShare rows={model.blockers.slice(0, 5).map((row, index) => ({ key: row.label, label: `${index + 1}. ${row.label}`, count: row.count, share: model.blockers[0] ? row.count / model.blockers[0].count : 0, tone: 'amber' }))} />}
      </SectionCard>

      {/* 6. 최근 공고 변경 · 최근 오류 */}
      <View style={[styles.grid, two && styles.gridTwo]}>
        {col(
          <SectionCard title="최근 공고 변경" description="누가 어떤 공고를 바꿨는지">
            <View testID="console-recent-changes" style={styles.list}>
              {model.recentNoticeChanges.length ? model.recentNoticeChanges.map(item => (
                <View key={`${item.at}-${item.title}`} style={styles.line}>
                  <Text style={styles.time}>{shortTime(item.at)}</Text>
                  <View style={styles.lineCopy}>
                    <Text style={styles.lineTitle} numberOfLines={2}>{item.title}</Text>
                    <Text style={styles.lineMeta}>{item.summary} · {item.actor}</Text>
                  </View>
                </View>
              )) : <Text style={styles.lineMeta}>최근 바뀐 공고가 없어요.</Text>}
            </View>
          </SectionCard>,
        )}
        {col(
          <SectionCard title="최근 오류" description={model.recentErrors.length ? '최근 5건' : '기록된 오류가 없어요'}>
            <View testID="console-recent-errors" style={styles.list}>
              {model.recentErrors.map(error => (
                <View key={`${error.at}-${error.message}`} style={styles.line}>
                  <Text style={styles.time}>{shortTime(error.at)}</Text>
                  <View style={styles.lineCopy}>
                    <View style={styles.errorHead}><LevelBadge level={error.level ?? 'ERROR'} /><Text style={styles.lineTitle}>{error.source}</Text></View>
                    <Text style={styles.lineMeta}>{error.message}</Text>
                  </View>
                </View>
              ))}
            </View>
          </SectionCard>,
        )}
      </View>

      {/* 7. 일반 지표 */}
      {snapshot.analytics ? <SectionCard
        title="상담·판정 세션 · QA 기록"
        description={snapshot.analytics.status === 'CONNECTED' ? 'Staging · QA · 최근 7일 · 운영 실적 아님 · 사람 수 아님' : 'Analytics migration 또는 수집 연결 전'}
        action={<AdminButton label="운영 지표로" tone="quiet" icon="chevron-right" onPress={() => router.push(link('/admin/console/analytics'))} />}
      >
        {snapshot.analytics.status === 'CONNECTED' ? <View testID="console-analytics-card" style={styles.list}>
          <KpiGrid items={[
            { label: '상담 시작 세션', value: `${snapshot.analytics.summary.sessionsStarted}세션`, hint: '익명 세션 기준', tone: 'purple', icon: 'chat' },
            { label: '판정 시작 세션', value: `${snapshot.analytics.summary.assessmentsStarted}세션`, hint: '분석 시작', tone: 'purple', icon: 'insights' },
            { label: '판정 완료 세션', value: `${snapshot.analytics.summary.assessmentsCompleted}세션`, hint: `완료율 ${percent(snapshot.analytics.summary.completionRate)}`, tone: 'green', icon: 'check-circle' },
            { label: 'QR 생성', value: `${snapshot.analytics.summary.qrCreates}회`, hint: '횟수 · 토큰 저장 안 함', tone: 'neutral', icon: 'qr-code' },
          ]} />
          <Text style={styles.lineMeta}>판정 결과 · 완료 {snapshot.analytics.summary.assessmentStatusDistribution.COMPLETE} · 추가 확인 {snapshot.analytics.summary.assessmentStatusDistribution.NEEDS_USER_INPUT} · 신청 어려움 {snapshot.analytics.summary.assessmentStatusDistribution.INELIGIBLE} · 판정 불가 {snapshot.analytics.summary.assessmentStatusDistribution.UNAVAILABLE}</Text>
          <Text style={styles.lineMeta}>많이 남은 확인 항목 · {Object.entries(snapshot.analytics.summary.unresolvedCategoryDistribution).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([key, count]) => `${analyticsCategoryLabel[key] ?? '기타 확인'} ${count}`).join(' · ') || '기록 없음'}</Text>
        </View> : <Text style={styles.lineMeta}>아직 수집 전 · 0건으로 추정하지 않습니다.</Text>}
      </SectionCard> : null}
      <SectionCard title="일반 지표" description={`${day} 기준`}>
        <KpiGrid items={[
          { label: '활성 공고', value: `${model.kpis.activeNotices}건`, hint: '사용자 화면에서 서비스 중', tone: 'green', icon: 'campaign' },
          { label: '오늘 판정', value: assessmentsCollected ? `${model.kpis.assessmentsToday.toLocaleString('ko-KR')}건` : '수집 전', hint: day, tone: 'purple', icon: 'insights' },
          { label: 'AI 상담', value: aiCollected ? `${model.kpis.aiToday}건` : '수집 전', hint: '오늘 질문 수', tone: 'purple', icon: 'smart-toy' },
          { label: '평균 응답', value: summary.averageMs === null ? '—' : `${(summary.averageMs / 1000).toFixed(1)}초`, hint: summary.p95Ms === null ? '오늘 질문 기준' : `p95 ${(summary.p95Ms / 1000).toFixed(1)}초`, tone: 'neutral', icon: 'speed' },
        ]} />
      </SectionCard>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  grid: { gap: spacing.md },
  gridTwo: { flexDirection: 'row', alignItems: 'flex-start' },
  col: { flex: 1, minWidth: 0 },
  list: { gap: 10 },
  line: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  time: { ...type.caption, color: colors.textMuted, width: 72 },
  lineCopy: { flex: 1, minWidth: 0, gap: 2 },
  lineTitle: { ...type.bodySmStrong, color: colors.text, flexShrink: 1 },
  lineMeta: { ...type.caption, color: colors.textMuted },
  errorHead: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  reasonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 28 },
  count: { ...type.bodySmStrong, color: colors.text },
});
