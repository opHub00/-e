import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors, spacing, type } from '../../../design/tokens';
import { KpiGrid, SectionCard } from '../../../features/adminPortal/ui/AdminKit';
import { ConsoleShell } from '../../../features/adminConsole/ConsoleShell';
import { ShareBars } from '../../../features/adminConsole/ConsoleKit';
import { ASSESSMENT_LABEL } from '../../../features/adminConsole/consoleModel';
import type { AssessmentStatus, ConsoleSnapshot } from '../../../features/adminConsole/contract';

/** 판정 현황: 상태 분포와 사용자가 가장 많이 막히는 항목. */
export default function ConsoleAssessments() {
  return (
    <ConsoleShell
      menuKey="assessments"
      title="판정 현황"
      subtitle="판정이 어디서 멈추는지, 어떤 항목에서 사용자가 답하지 못하는지 봐요."
      testID="console-assessments"
      needs={['일자별 판정 상태 집계(COMPLETE·NEEDS_USER_INPUT·INELIGIBLE·UNAVAILABLE)', '미해결 fact 집계(라벨·건수)']}
    >
      {snapshot => <Assessments snapshot={snapshot} />}
    </ConsoleShell>
  );
}

function Assessments({ snapshot }: { snapshot: ConsoleSnapshot }) {
  const { width } = useWindowDimensions();
  const two = width >= 1100;
  const entries = Object.entries(snapshot.assessments.byStatus) as Array<[AssessmentStatus, number]>;
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  const blockers = [...snapshot.assessments.blockers].sort((a, b) => b.count - a.count);
  const top = blockers[0]?.count ?? 0;
  return (
    <View style={styles.stack}>
      <KpiGrid items={entries.map(([status, count]) => ({
        label: ASSESSMENT_LABEL[status].label,
        value: `${count.toLocaleString('ko-KR')}건`,
        hint: total ? `전체의 ${Math.round((count / total) * 100)}%` : undefined,
        tone: ASSESSMENT_LABEL[status].tone,
      }))} />
      <View style={[styles.grid, two && styles.gridTwo]}>
        <View style={two ? styles.col : null}>
          <SectionCard title="상태 분포" description={`${snapshot.assessments.date} · 전체 ${total.toLocaleString('ko-KR')}건`}>
            <ShareBars testID="console-status-bars" rows={entries.map(([status, count]) => ({ key: status, label: ASSESSMENT_LABEL[status].label, count, share: total ? count / total : 0, tone: ASSESSMENT_LABEL[status].tone }))} />
          </SectionCard>
        </View>
        <View style={two ? styles.col : null}>
          <SectionCard title="가장 많이 막히는 항목" description="이 항목에 답하지 못해 '추가 입력 필요'로 끝난 판정 수예요.">
            <ShareBars testID="console-blocker-bars" hideShare rows={blockers.map((row, index) => ({ key: row.label, label: `${index + 1}. ${row.label}`, count: row.count, share: top ? row.count / top : 0, tone: 'amber' }))} />
            <Text style={styles.note}>질문 문구·안내를 바꾸거나 '확인 방법'을 보강할 우선순위로 써요.</Text>
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
  note: { ...type.caption, color: colors.textMuted, marginTop: 8 },
});
