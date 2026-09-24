import { MaterialIcons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../../components/PrimaryButton';
import { WanpanCard } from '../../components/WanpanCard';
import { colors, radius, spacing, tint, type } from '../../design/tokens';
import { INSIGHT_VIEW } from './domain';
import type { ListingInsightState } from './useListingInsight';

type Props = {
  state: ListingInsightState;
  deadline: string | null;
  onContinueAssessment: () => void;
};

/**
 * 상세 화면 상단의 "내 현재 분석".
 *
 * 엔진이 준 PASS/FAIL/UNKNOWN 을 그대로 보여준다. 확인 필요(UNKNOWN)는 충족과 같은 색·같은 자리에
 * 두지 않고, 개수도 충족에 더하지 않는다. 정보가 부족한 것은 실패가 아니므로 "분석 실패"라고 쓰지 않는다.
 * 규칙이 연결되지 않은 공고에서는 이 섹션 자체가 나오지 않는다.
 */
export function ListingInsightSection({ state, deadline, onContinueAssessment }: Props) {
  if (state.phase === 'IDLE' || state.phase === 'NONE') return null;
  if (state.phase === 'LOADING') {
    return (
      <WanpanCard style={styles.card}>
        <View style={styles.headRow}>
          <Text accessibilityRole="header" style={styles.title}>내 현재 분석</Text>
          <ActivityIndicator color={colors.primary} />
        </View>
        <View style={styles.skeletonGroup}>{[0, 1].map(n => <View key={n} style={styles.skeleton} />)}</View>
      </WanpanCard>
    );
  }

  const { insight } = state;
  const view = INSIGHT_VIEW[insight.status];
  return (
    <WanpanCard style={styles.card}>
      <View style={styles.headRow}>
        <Text accessibilityRole="header" style={styles.title}>내 현재 분석</Text>
        {deadline ? <Text style={styles.deadline}>{deadline}</Text> : null}
      </View>

      <View style={[styles.statusRow, { backgroundColor: tint[view.tone].bg }]}>
        <MaterialIcons name={view.icon} size={18} color={tint[view.tone].fg} />
        <Text style={[styles.statusText, { color: tint[view.tone].fg }]}>{insight.label}</Text>
      </View>
      <Text style={styles.sentence}>{insight.sentence}</Text>

      {/* 충족 · 확인 필요 · 미충족을 각각 다른 색과 아이콘으로 나눈다. */}
      <View style={styles.counts}>
        <Count icon="check-circle" tone="green" label="충족" value={insight.passed} />
        <Count icon="help-outline" tone="amber" label="확인 필요" value={insight.unknown} />
        <Count icon="error-outline" tone="pink" label="미충족" value={insight.failed} />
      </View>

      {insight.scoreText ? <Text style={styles.meta}>배점: {insight.scoreText}</Text> : null}
      {insight.scoring === 'PENDING' ? <Text style={styles.meta}>배점은 정보가 더 모이면 계산돼요.</Text> : null}

      {insight.missingLabels.length ? (
        <View style={styles.missing}>
          <Text style={styles.missingTitle}>더 알려주시면 좋은 정보 {insight.missingLabels.length}개</Text>
          {insight.missingLabels.slice(0, 4).map(label => (
            <Text key={label} style={styles.missingItem}>· {label}</Text>
          ))}
        </View>
      ) : null}

      {insight.announcementMissingLabels.length ? (
        <Text style={styles.meta}>공고 기준이 더 확인돼야 하는 항목도 {insight.announcementMissingLabels.length}개 있어요. 입력으로는 풀 수 없어요.</Text>
      ) : null}
      {insight.profileMissingLabels.length ? (
        <Text style={styles.meta}>프로필에서 채우면 되는 항목 {insight.profileMissingLabels.length}개가 있어요.</Text>
      ) : null}

      <PrimaryButton
        label={insight.answerableMissing > 0 ? `정보 ${insight.answerableMissing}개 입력하고 이어서 판정하기` : '맞춤판정 자세히 보기'}
        icon="fact-check"
        onPress={onContinueAssessment}
      />
    </WanpanCard>
  );
}

const Count = ({ icon, tone, label, value }: { icon: 'check-circle' | 'help-outline' | 'error-outline'; tone: 'green' | 'amber' | 'pink'; label: string; value: number }) => (
  <View style={[styles.count, { backgroundColor: tint[tone].bg }]}>
    <MaterialIcons name={icon} size={15} color={tint[tone].fg} />
    <Text style={[styles.countValue, { color: tint[tone].fg }]}>{value}</Text>
    <Text style={[styles.countLabel, { color: tint[tone].fg }]}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...type.cardTitle, color: colors.text },
  deadline: { ...type.micro, color: tint.amber.fg },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.button, padding: spacing.sm },
  statusText: { ...type.bodyStrong, flexShrink: 1 },
  sentence: { ...type.bodySm, color: colors.textMuted },
  counts: { flexDirection: 'row', gap: spacing.xs },
  count: { flex: 1, alignItems: 'center', gap: 2, borderRadius: radius.button, paddingVertical: spacing.sm },
  countValue: { ...type.bodyStrong },
  countLabel: { ...type.micro },
  meta: { ...type.micro, color: colors.textSubtle },
  missing: { gap: 2, backgroundColor: colors.surfaceContainer, borderRadius: radius.button, padding: spacing.sm },
  missingTitle: { ...type.bodySmStrong, color: colors.text },
  missingItem: { ...type.bodySm, color: colors.textMuted },
  skeletonGroup: { gap: spacing.xs },
  skeleton: { height: 14, borderRadius: radius.button, backgroundColor: colors.surfaceHigh },
});
