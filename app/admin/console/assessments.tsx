import { useRouter } from 'expo-router';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors, radius, spacing, type } from '../../../design/tokens';
import { AdminButton, EmptyState, SectionCard } from '../../../features/adminPortal/ui/AdminKit';
import { ConsoleShell, useConsole } from '../../../features/adminConsole/ConsoleShell';
import { LevelBadge, ShareBars } from '../../../features/adminConsole/ConsoleKit';
import { ASSESSMENT_LABEL, assessmentInsights, percent } from '../../../features/adminConsole/consoleModel';
import { collected, emptyCopy } from '../../../features/adminConsole/consoleState';
import type { ConsoleSnapshot } from '../../../features/adminConsole/contract';

/** 판정 현황: 숫자만이 아니라 '그래서 무엇을 할지'. 급한 상태가 위로 온다. */
export default function ConsoleAssessments() {
  return (
    <ConsoleShell
      menuKey="assessments"
      title="판정 현황"
      subtitle="판정이 어디서 멈추는지, 어떤 항목에서 사용자가 답하지 못하는지, 무엇부터 손볼지 봐요."
      testID="console-assessments"
      needs={['일자별 판정 상태 집계(COMPLETE·NEEDS_USER_INPUT·INELIGIBLE·UNAVAILABLE)', '미해결 fact 집계(라벨·건수)']}
    >
      {snapshot => <Assessments snapshot={snapshot} />}
    </ConsoleShell>
  );
}

function Assessments({ snapshot }: { snapshot: ConsoleSnapshot }) {
  const router = useRouter();
  const { link } = useConsole();
  const { width } = useWindowDimensions();
  const two = width >= 1100;
  const isCollected = collected(snapshot.coverage, 'assessments');
  const stats = snapshot.assessments;
  const total = Object.values(stats.byStatus).reduce((sum, count) => sum + count, 0);
  if (!isCollected || !total) return <EmptyState {...emptyCopy('assessments', isCollected)} />;
  const insights = assessmentInsights(stats);
  const blockers = [...stats.blockers].sort((a, b) => b.count - a.count);
  const top = blockers[0]?.count ?? 0;
  const needs = stats.byStatus.NEEDS_USER_INPUT;
  return (
    <View style={styles.stack}>
      <SectionCard title="상태별 다음 행동" description={`${stats.date} · 전체 ${total.toLocaleString('ko-KR')}건 · 급한 상태부터`}>
        <View testID="console-assessment-insights" style={styles.insights}>
          {insights.map(item => (
            <View key={item.status} testID={`console-insight-${item.status}`} style={[styles.insight, two && styles.insightWide]}>
              <View style={styles.insightHead}>
                <Text style={styles.insightLabel}>{ASSESSMENT_LABEL[item.status].label}</Text>
                <Text style={styles.code}>{item.status}</Text>
                {item.level ? <LevelBadge level={item.level} /> : null}
              </View>
              <Text style={styles.insightValue}>{item.count.toLocaleString('ko-KR')}건 <Text style={styles.share}>· {percent(item.share)}</Text></Text>
              <Text style={styles.action}>{item.action}</Text>
              {item.level && item.target && item.target !== 'assessments' ? (
                <AdminButton label="규칙 상태 확인" tone="quiet" icon="chevron-right" onPress={() => router.push(link(`/admin/console/${item.target}`))} />
              ) : null}
            </View>
          ))}
        </View>
      </SectionCard>
      <View style={[styles.grid, two && styles.gridTwo]}>
        <View style={two ? styles.col : null}>
          <SectionCard title="가장 많이 막히는 항목" description={`추가 입력 필요 ${needs.toLocaleString('ko-KR')}건이 어떤 항목에서 멈췄는지`}>
            {blockers.length ? (
              <>
                <ShareBars testID="console-blocker-bars" hideShare rows={blockers.map((row, index) => ({ key: row.label, label: `${index + 1}. ${row.label}`, count: row.count, share: top ? row.count / top : 0, tone: 'amber' }))} />
                <Text style={styles.note}>1위 항목의 질문 문구·'확인 방법' 안내를 먼저 보강해요. 같은 판정에서 여러 항목이 막힐 수 있어 합이 전체보다 클 수 있어요.</Text>
              </>
            ) : <Text style={styles.note}>막힌 항목 집계가 아직 없어요.</Text>}
          </SectionCard>
        </View>
        <View style={two ? styles.col : null}>
          <SectionCard title="상태 분포" description="막대 길이는 전체 대비 비율">
            <ShareBars testID="console-status-bars" rows={insights.map(item => ({ key: item.status, label: ASSESSMENT_LABEL[item.status].label, count: item.count, share: item.share, tone: ASSESSMENT_LABEL[item.status].tone }))} />
          </SectionCard>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  grid: { gap: spacing.md },
  gridTwo: { flexDirection: 'row', alignItems: 'flex-start' },
  col: { flex: 1, minWidth: 0 },
  insights: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  insight: { flexGrow: 1, flexBasis: '100%', minWidth: 0, gap: 4, padding: spacing.sm, borderRadius: radius.cardSm, borderWidth: 1, borderColor: colors.surfaceContainer },
  insightWide: { flexBasis: '45%' },
  insightHead: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  insightLabel: { ...type.bodyStrong, color: colors.text },
  code: { ...type.caption, color: colors.textSubtle },
  insightValue: { ...type.section, color: colors.text },
  share: { ...type.bodySm, color: colors.textMuted },
  action: { ...type.bodySm, color: colors.textMuted },
  note: { ...type.caption, color: colors.textMuted, marginTop: 8 },
});
