import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '../../design/tokens';
import { SUPPLY_LABELS, STAGE_LABELS } from '../applicationAssessment/labels';
import { STATUS_HEADLINE, scoreLabel, type ConsultationAssessment } from './contract';

/**
 * Compact summary of a deterministic assessment inside the conversation.
 *
 * Deliberately not a second AssessmentResult: it answers "가능한가 / 어떤 유형 / 몇 단계 /
 * 몇 점 / 무엇이 남았나" and then hands off to the full result screen. The detailed
 * condition lists, documents and evidence stay where they already live.
 */
export function ConsultationResultCard({ assessment }: { assessment: ConsultationAssessment }) {
  const tone = assessment.status === 'INELIGIBLE' ? colors.error
    : assessment.status === 'NEEDS_MORE_INFORMATION' ? colors.warning : colors.primary;
  return (
    <View accessibilityRole="summary" style={styles.card}>
      <View style={[styles.stripe, { backgroundColor: tone }]} />
      <View style={styles.body}>
        <Text accessibilityRole="header" style={[styles.status, { color: tone }]}>{STATUS_HEADLINE[assessment.status]}</Text>
        <View style={styles.rows}>
          <Row label="공급유형" value={SUPPLY_LABELS[assessment.supplyType]} />
          <Row label="공급단계" value={assessment.stage ? STAGE_LABELS[assessment.stage] : '확인 전'} />
          {/* 배점이 없는 유형에서 0점으로 읽히지 않도록 문구 자체를 바꾼다. */}
          <Row label="가점" value={scoreLabel(assessment)} muted={assessment.scoring !== 'AVAILABLE'} />
        </View>
        {assessment.blocking.length ? (
          <Text style={styles.detail}>충족하지 못한 조건 {assessment.blocking.length}개 · {assessment.blocking.join(', ')}</Text>
        ) : null}
        {assessment.pending.length ? (
          <Text style={styles.detail}>확인이 필요한 항목 {assessment.pending.length}개 · {assessment.pending.join(', ')}</Text>
        ) : null}
      </View>
    </View>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, muted && styles.rowValueMuted]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.cardSm, borderWidth: 1, borderColor: colors.surfaceHigh, overflow: 'hidden' },
  stripe: { width: 4 },
  body: { flex: 1, padding: spacing.md, gap: spacing.sm },
  status: { ...type.bodyLgStrong, color: colors.primary },
  rows: { gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  rowLabel: { ...type.bodySm, color: colors.textSubtle, width: 64 },
  rowValue: { ...type.bodyStrong, color: colors.text, flex: 1 },
  rowValueMuted: { ...type.body, color: colors.textMuted },
  detail: { ...type.bodySm, color: colors.textMuted },
});
