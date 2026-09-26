import { useRouter, type Href } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusPill } from '../../components/StatusPill';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { colors, radius, size, spacing, tint, type } from '../../design/tokens';
import { AdminShell } from '../../features/adminPortal/AdminShell';
import { useLearningRows } from '../../features/adminPortal/useLearningRows';
import {
  AUTOMATION_DEBT_NOTE, AUTOMATION_STATUS_NOTE, RLS_LIMIT_NOTE, buildAdminDashboard,
} from '../../features/adminPortal/dashboard';
import { adminAccessMessage } from '../../features/adminPortal/access';

/**
 * 관리자 홈.
 *
 * 숫자는 전부 관측된 행에서 센다. 수집된 공고와 실제 판정이 열리는 분석 가능 공고를 나눠 보여주고,
 * 확인할 수 없는 값은 빈칸 대신 "확인 불가"라고 적는다. 자동 학습 진행률은 만들지 않는다.
 */
export default function AdminHomeRoute() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const columns = width >= 1100 ? 3 : width >= 720 ? 2 : 1;
  return (
    <AdminShell title="완판e 운영 관리" subtitle="지금 관측할 수 있는 운영 상태예요.">
      {() => <Dashboard columns={columns} router={router} />}
    </AdminShell>
  );
}

function Dashboard({ columns, router }: { columns: number; router: ReturnType<typeof useRouter> }) {
  const state = useLearningRows(true);
  if (state.phase === 'LOADING') {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} /><Text style={styles.body}>운영 현황을 불러오는 중이에요</Text></View>;
  }
  if (state.phase === 'FAILED') {
    return (
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.cardTitle}>운영 현황을 불러오지 못했어요</Text>
        <Text style={styles.body}>{adminAccessMessage(state.code)}</Text>
        <MotionPressable accessibilityRole="button" onPress={state.refresh} style={styles.link}>
          <Text style={styles.linkText}>다시 불러오기</Text>
        </MotionPressable>
      </View>
    );
  }

  const summary = buildAdminDashboard(state.rows);
  const cards: { label: string; value: string; hint?: string; tone: keyof typeof tint }[] = [
    { label: '수집된 공고', value: `${summary.collectedAnnouncements}건`, hint: '공고 등록만 된 것 포함', tone: 'neutral' },
    { label: '분석 가능 공고', value: `${summary.analyzableAnnouncements}건`, hint: '활성 규칙 + listing 연결 완료', tone: 'green' },
    { label: '활성 rule set', value: `${summary.activeRuleSets}건`, tone: 'purple' },
    {
      label: '승인된 규칙',
      value: `${summary.approvedRules}개`,
      hint: summary.approvedRulesUnknownFor ? `공고 ${summary.approvedRulesUnknownFor}건은 확인 불가` : undefined,
      tone: 'purple',
    },
    { label: 'listing 연결', value: `${summary.listingBindings}건`, tone: 'green' },
    { label: '확인 필요한 공고', value: `${summary.needsAttention}건`, hint: '관측된 제약이 있는 공고', tone: summary.needsAttention ? 'amber' : 'neutral' },
  ];

  return (
    <>
      <View style={[styles.grid, { flexDirection: columns === 1 ? 'column' : 'row' }]}>
        {cards.map(card => (
          <View key={card.label} style={[styles.metric, columns > 1 && { flexBasis: `${100 / columns - 2}%` }]}>
            <Text style={styles.metricLabel}>{card.label}</Text>
            <Text style={[styles.metricValue, { color: tint[card.tone].fg }]}>{card.value}</Text>
            {card.hint ? <Text style={styles.metricHint}>{card.hint}</Text> : null}
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text accessibilityRole="header" style={styles.cardTitle}>분석 가능 공고 {summary.analyzableAnnouncements}건</Text>
          <MotionPressable accessibilityRole="button" onPress={() => router.push('/admin/announcements' as Href)} style={styles.link}>
            <Text style={styles.linkText}>공고 관리 열기</Text>
          </MotionPressable>
        </View>
        {summary.analyzable.length === 0 ? (
          <Text style={styles.body}>지금 판정까지 열리는 공고가 없어요. 활성 규칙과 listing 연결이 모두 있어야 분석이 열려요.</Text>
        ) : (
          summary.analyzable.map(item => (
            <View key={item.announcementId} style={styles.analyzable}>
              <Text style={styles.analyzableTitle}>{item.title}</Text>
              <View style={styles.pills}>
                <StatusPill label={item.officialLabel} tone={item.officialLabel === '공식 공고 기준' ? 'green' : 'neutral'} icon="verified" />
                <StatusPill
                  label={item.approvedCount === null || item.ruleCount === null ? '승인 규칙 확인 불가' : `${item.approvedCount} / ${item.ruleCount} 승인`}
                  tone={item.approvedCount !== null && item.approvedCount === item.ruleCount ? 'green' : 'amber'}
                  icon="fact-check"
                />
                <StatusPill label="활성" tone="green" icon="bolt" />
                <StatusPill label={`listing 연결 ${item.listingIds.length}건`} tone="green" icon="link" />
              </View>
              <View style={styles.links}>
                {item.ruleSetId ? (
                  <MotionPressable accessibilityRole="button" onPress={() => router.push(`/admin/rule-review?ruleSetId=${item.ruleSetId}` as Href)} style={styles.link}>
                    <Text style={styles.linkText}>검수 콘솔</Text>
                  </MotionPressable>
                ) : null}
                <MotionPressable accessibilityRole="button" onPress={() => router.push('/admin/learning-status' as Href)} style={styles.link}>
                  <Text style={styles.linkText}>학습 현황</Text>
                </MotionPressable>
                <MotionPressable accessibilityRole="button" onPress={() => router.push('/admin/listing-bindings' as Href)} style={styles.link}>
                  <Text style={styles.linkText}>listing 연결</Text>
                </MotionPressable>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text accessibilityRole="header" style={styles.cardTitle}>운영 안내</Text>
          <MaterialIcons name="info-outline" size={16} color={colors.textSubtle} />
        </View>
        <Text style={styles.body}>{AUTOMATION_STATUS_NOTE}</Text>
        <Text style={styles.note}>{AUTOMATION_DEBT_NOTE}</Text>
        <Text style={styles.note}>{RLS_LIMIT_NOTE}</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  grid: { flexWrap: 'wrap', gap: spacing.sm },
  metric: { flexGrow: 1, minWidth: 150, backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.surfaceHigh, padding: spacing.md, gap: 2 },
  metricLabel: { ...type.bodySm, color: colors.textMuted },
  metricValue: { ...type.page },
  metricHint: { ...type.micro, color: colors.textSubtle },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.surfaceHigh, padding: spacing.md, gap: spacing.sm },
  cardTitle: { ...type.cardTitle, color: colors.text },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  analyzable: { gap: 6, borderTopWidth: 1, borderTopColor: colors.surfaceHigh, paddingTop: spacing.sm },
  analyzableTitle: { ...type.bodyStrong, color: colors.text },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  link: { minHeight: size.touch, justifyContent: 'center' },
  linkText: { ...type.bodySmStrong, color: colors.primary },
  body: { ...type.body, color: colors.textMuted },
  note: { ...type.bodySm, color: colors.textSubtle },
  center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
});
