import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors, spacing, type } from '../../../design/tokens';
import { KpiGrid, SectionCard } from '../../../features/adminPortal/ui/AdminKit';
import { ConsoleShell } from '../../../features/adminConsole/ConsoleShell';
import { HealthBanner, ShareBars } from '../../../features/adminConsole/ConsoleKit';
import { AI_MODE_LABEL, ASSESSMENT_LABEL, buildDashboard, percent, shortTime } from '../../../features/adminConsole/consoleModel';

/** 통합 운영 콘솔 대시보드: 정상 여부 → 숫자 6개 → 바로 볼 목록. */
export default function ConsoleDashboard() {
  return (
    <ConsoleShell
      menuKey="dashboard"
      title="대시보드"
      subtitle="시스템 정상 여부, 활성 공고, AI 문제, 사용자가 막히는 곳을 한 화면에서 봐요."
      testID="console-dashboard"
      needs={['공고 상태 목록(Generic Notice)', '오늘 판정 집계', 'AI 상담 로그(mode·fallback·grounding)', '오류 로그']}
    >
      {snapshot => <Dashboard snapshot={snapshot} />}
    </ConsoleShell>
  );
}

function Dashboard({ snapshot }: { snapshot: Parameters<typeof buildDashboard>[0] }) {
  const model = buildDashboard(snapshot);
  const { width } = useWindowDimensions();
  const two = width >= 1100;
  const k = model.kpis;
  return (
    <View style={styles.stack}>
      <HealthBanner ok={model.health.ok} issues={model.health.issues} />
      <KpiGrid items={[
        { label: '활성 공고', value: `${k.activeNotices}건`, hint: '사용자 화면에서 서비스 중', tone: 'green', icon: 'campaign' },
        { label: '검토 필요 규칙 패키지', value: `${k.reviewRequired}건`, hint: '승인 전 규칙이 남은 공고', tone: k.reviewRequired ? 'amber' : 'neutral', icon: 'fact-check' },
        { label: '오늘 판정', value: `${k.assessmentsToday.toLocaleString('ko-KR')}건`, hint: snapshot.assessments.date, tone: 'purple', icon: 'insights' },
        { label: 'AI 상담', value: `${k.aiToday}건`, hint: '오늘 질문 수', tone: 'purple', icon: 'smart-toy' },
        { label: '대체 답변 비율', value: percent(k.fallbackRate), hint: 'AI 대신 규칙형 답변', tone: (k.fallbackRate ?? 0) >= 0.3 ? 'amber' : 'neutral', icon: 'swap-horiz' },
        { label: '근거 검증 실패', value: `${k.groundingFailures}건`, hint: '답변과 공고 근거 불일치', tone: k.groundingFailures ? 'pink' : 'neutral', icon: 'gpp-maybe' },
      ]} />
      <View style={[styles.grid, two && styles.gridTwo]}>
        <View style={two ? styles.col : null}>
          <SectionCard title="최근 공고 변경" description="누가 어떤 공고를 바꿨는지">
            <View testID="console-recent-changes" style={styles.list}>
              {model.recentNoticeChanges.map(item => (
                <View key={`${item.at}-${item.title}`} style={styles.line}>
                  <Text style={styles.time}>{shortTime(item.at)}</Text>
                  <View style={styles.lineCopy}>
                    <Text style={styles.lineTitle} numberOfLines={2}>{item.title}</Text>
                    <Text style={styles.lineMeta}>{item.summary} · {item.actor}</Text>
                  </View>
                </View>
              ))}
            </View>
          </SectionCard>
        </View>
        <View style={two ? styles.col : null}>
          <SectionCard title="최근 오류" description={model.recentErrors.length ? '최근 5건' : '기록된 오류가 없어요'}>
            <View testID="console-recent-errors" style={styles.list}>
              {model.recentErrors.map(error => (
                <View key={`${error.at}-${error.message}`} style={styles.line}>
                  <Text style={styles.time}>{shortTime(error.at)}</Text>
                  <View style={styles.lineCopy}>
                    <Text style={styles.lineTitle}>{error.source}</Text>
                    <Text style={styles.lineMeta}>{error.message}</Text>
                  </View>
                </View>
              ))}
            </View>
          </SectionCard>
        </View>
      </View>
      <View style={[styles.grid, two && styles.gridTwo]}>
        <View style={two ? styles.col : null}>
          <SectionCard title="판정 상태 분포" description={`${snapshot.assessments.date} 기준`}>
            <ShareBars testID="console-assessment-bars" rows={model.assessmentDistribution.map(row => ({ key: row.status, label: ASSESSMENT_LABEL[row.status].label, count: row.count, share: row.share, tone: ASSESSMENT_LABEL[row.status].tone }))} />
          </SectionCard>
        </View>
        <View style={two ? styles.col : null}>
          <SectionCard title="AI 답변 방식" description="오늘 질문 기준">
            <ShareBars testID="console-ai-bars" rows={model.aiModes.map(row => ({ key: row.mode, label: AI_MODE_LABEL[row.mode].label, count: row.count, share: row.share, tone: AI_MODE_LABEL[row.mode].tone }))} />
          </SectionCard>
        </View>
      </View>
      <SectionCard title="사용자가 가장 많이 막히는 항목" description="답하지 못해 판정이 멈춘 항목 순서예요. 질문 문구나 안내를 먼저 손볼 곳이에요.">
        <ShareBars testID="console-blockers" hideShare rows={model.blockers.map((row, index) => ({ key: row.label, label: `${index + 1}. ${row.label}`, count: row.count, share: model.blockers[0] ? row.count / model.blockers[0].count : 0, tone: 'amber' }))} />
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
  lineCopy: { flex: 1, minWidth: 0, gap: 1 },
  lineTitle: { ...type.bodySmStrong, color: colors.text },
  lineMeta: { ...type.caption, color: colors.textMuted },
});
