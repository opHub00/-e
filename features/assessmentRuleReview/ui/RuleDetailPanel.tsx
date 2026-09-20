import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import { colors, radius, size, spacing, type } from '../../../design/tokens';
import { Action, Badge } from './RuleReviewConsole';
import {
  EVIDENCE_STATUS_LABEL, EXCEPTION_STATUS_LABEL, RELATION_LABEL, REVIEW_STATUS_LABEL, historyLine,
} from './reviewLabels';
import type { getRuleDetail } from '../server/dto';
import type { ReviewableRuleSnapshot, RuleReviewRecord, RuleReviewWorkspace } from '../server/types';
import type { useRuleReviewWorkspace } from './useRuleReviewWorkspace';

type Props = {
  detail: ReturnType<typeof getRuleDetail>;
  record: RuleReviewRecord;
  workspace: RuleReviewWorkspace;
  blockReasons: string[];
  locked: boolean;
  actions: ReturnType<typeof useRuleReviewWorkspace>['actions'];
};

const REASON = '관리자 검수 콘솔에서 확인';
const OPERATOR_TEXT: Record<string, string> = { gte: '이상', lte: '이하', gt: '초과', lt: '미만', eq: '=' };
const valueText = (value: unknown) => value === null || value === undefined ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);

/**
 * A reviewer has to spot a wrong bound at a glance, so the stored expression is
 * rendered as a readable condition instead of JSON. Anything that does not match a
 * known shape falls back to the raw value rather than guessing at its meaning.
 */
function conditionText(operator: string | null, value: unknown): string {
  const clause = (op: unknown, raw: unknown) =>
    typeof op === 'string' && OPERATOR_TEXT[op] ? `${valueText(raw)} ${OPERATOR_TEXT[op]}` : `${valueText(op)} ${valueText(raw)}`;
  if (Array.isArray(value) && value.every(item => item && typeof item === 'object' && 'op' in item)) {
    return value.map(item => clause((item as { op: unknown }).op, (item as { value: unknown }).value)).join(' 그리고 ');
  }
  if (operator && OPERATOR_TEXT[operator]) return clause(operator, value);
  return `${operator ? `${operator} ` : ''}${valueText(value)}`;
}

export function RuleDetailPanel({ detail, record, workspace, blockReasons, locked, actions }: Props) {
    // Static export renders without a viewport; widening only after mount keeps
  // the server and client markup identical and avoids a hydration mismatch.
  const width = useWindowDimensions().width;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const wide = mounted && width >= 1024;
  const [showHistory, setShowHistory] = useState(false);
  const conflict = workspace.conflicts.find(item => item.candidateRuleIds.includes(detail.ruleId));
  const edited = detail.editedCandidate;
  const canApprove = !locked && blockReasons.length === 0;

  /** A minimal, explicit edit: the scope the reviewer is most likely to correct. */
  const proposeScopeEdit = (): ReviewableRuleSnapshot => ({
    ...structuredClone(record.originalCandidate),
    scope: record.originalCandidate.scope === 'APPLICANT' ? 'HOUSEHOLD' : 'APPLICANT',
  });

  return (
    <View style={styles.panel}>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.title}>{detail.ruleLabel}</Text>
        <Badge tone="plain" text={REVIEW_STATUS_LABEL[detail.reviewState]} />
      </View>
      <Text style={styles.role}>{detail.semanticRole}</Text>

      {blockReasons.length ? (
        <View style={styles.guard}>
          <Text accessibilityRole="header" style={styles.guardTitle}>지금은 승인할 수 없어요</Text>
          {blockReasons.map(reason => <Text key={reason} style={styles.guardReason}>• {reason}</Text>)}
        </View>
      ) : null}

      {/* 원문이 먼저, 해석이 다음. 모바일에서는 위/아래로 쌓인다. */}
      <View style={[styles.cols, wide && styles.colsWide]}>
        <View style={styles.col}>
          <Text accessibilityRole="header" style={styles.colTitle}>공고 원문</Text>
          {detail.source.map(source => (
            <View key={`${source.section}:${source.label}`} style={styles.sourceBlock}>
              <Text style={styles.sourceWhere}>{[source.section, source.tableLabel].filter(Boolean).join(' · ')}</Text>
              <Text selectable style={styles.excerpt}>{source.textExcerpt ?? '원문 발췌가 없습니다.'}</Text>
              <View style={styles.evidenceRow}>
                <Badge tone={source.review?.status === 'VALID' || source.review?.status === 'REPLACED' ? 'NORMAL' : source.review?.status === 'INVALID' ? 'CRITICAL_BLOCKER' : 'REVIEW_REQUIRED'}
                  text={EVIDENCE_STATUS_LABEL[source.review?.status ?? 'NEEDS_REVIEW']} />
              </View>
            </View>
          ))}
        </View>

        <View style={styles.col}>
          <Text accessibilityRole="header" style={styles.colTitle}>AI 원본 candidate</Text>
          {/* AI 원본은 수정 대상이 아니다. 입력이 아니라 읽기 전용 기록으로 보여준다. */}
          <View style={styles.readonlyNote}><Text style={styles.readonlyNoteText}>읽기 전용 · 추출 당시 기록</Text></View>
          <Field label="적용 대상" value={`${detail.originalCandidate.supplyType} / ${detail.originalCandidate.scope ?? '—'}`} />
          <Field label="공급단계" value={detail.originalCandidate.stage ?? '—'} />
          <Field label="조건" value={conditionText(detail.originalCandidate.operator, detail.originalCandidate.value)} />
          <Field label="배점" value={detail.originalCandidate.score === null ? '배점 없음' : `${detail.originalCandidate.score} / ${detail.originalCandidate.maxScore ?? '—'}`} />

          <Text accessibilityRole="header" style={[styles.colTitle, styles.editedTitle]}>관리자 수정본</Text>
          {edited ? (
            <>
              <View style={styles.editedNote}><Text style={styles.editedNoteText}>수정 후 승인됨 · 원본과 {record.editDiff.length}개 항목이 달라요</Text></View>
              {record.editDiff.map(change => (
                <Text key={change.path} style={styles.diff}>{change.path}: {valueText(change.before)} → {valueText(change.after)}</Text>
              ))}
            </>
          ) : (
            <Text style={styles.noEdit}>아직 수정본이 없어요. 원본 그대로 승인하거나, 고쳐서 승인할 수 있어요.</Text>
          )}
        </View>
      </View>

      {detail.warnings.length ? (
        <View style={styles.warnings}>
          <Text accessibilityRole="header" style={styles.warnTitle}>검증 경고 {detail.warnings.length}건</Text>
          {detail.warnings.map(warning => <Text key={warning} style={styles.warnItem}>• {warning}</Text>)}
        </View>
      ) : null}

      {detail.exceptionRelations.length ? (
        <View style={styles.exception}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>예외 관계</Text>
          {detail.exceptionRelations.map(relation => (
            <View key={relation.exceptionRuleId} style={styles.relationRow}>
              <Badge tone={relation.status === 'ORPHAN_EXCEPTION' || relation.status === 'WRONG_RELATION' ? 'CRITICAL_BLOCKER' : 'NORMAL'}
                text={EXCEPTION_STATUS_LABEL[relation.status]} />
              <Text style={styles.relationText}>
                {relation.baseRuleId
                  ? `${relation.baseRuleId} · ${relation.relationType ? RELATION_LABEL[relation.relationType] : '관계 미지정'}`
                  : '연결된 기본 규칙 없음'}
              </Text>
            </View>
          ))}
          {detail.exceptionRelations.some(item => item.status === 'ORPHAN_EXCEPTION') ? (
            <View style={styles.actionRow}>
              {(['LIMITED_BY', 'EXEMPTED_BY', 'QUALIFIED_BY'] as const).map(relationType => (
                <Action key={relationType} label={`youth.residence에 ${RELATION_LABEL[relationType]}`} disabled={locked}
                  onPress={() => actions.linkException(detail.ruleId, { status: 'LINKED', baseRuleId: 'youth.residence', relationType }, REASON)} />
              ))}
              <Action label="독립 예외로 둠" disabled={locked} onPress={() => actions.linkException(detail.ruleId, { status: 'INDEPENDENT' }, REASON)} />
            </View>
          ) : null}
        </View>
      ) : null}

      {conflict ? (
        <View style={styles.conflict}>
          <Text accessibilityRole="header" style={styles.conflictTitle}>기준 충돌 · {conflict.concept}</Text>
          <Text style={styles.guardReason}>AI가 한쪽을 고르지 않았어요. 원문을 확인한 뒤 채택할 근거를 선택해 주세요.</Text>
          {conflict.candidates.map((candidate, index) => (
            <View key={candidate.candidateId} style={styles.conflictOption}>
              <Text style={styles.conflictValue}>{index === 0 ? '①' : '②'} {valueText(candidate.value)}</Text>
              <Action label="이 근거 채택" disabled={locked}
                onPress={() => actions.resolveConflict(conflict.conflictId, { type: 'CANDIDATE', candidateId: candidate.candidateId, reason: REASON }, REASON)} />
            </View>
          ))}
          <Text style={styles.conflictState}>
            {conflict.resolution ? `현재: ${conflict.resolution.type === 'CANDIDATE' ? `${conflict.resolution.candidateId} 채택` : conflict.resolution.type === 'HELD' ? '보류' : '직접 입력'}` : '현재: 선택 없음'}
          </Text>
          <Action label="둘 다 보류하고 원문 재확인" disabled={locked}
            onPress={() => actions.resolveConflict(conflict.conflictId, { type: 'HELD', reason: REASON }, REASON)} />
        </View>
      ) : null}

      <View style={styles.evidenceActions}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>근거 검토</Text>
        {record.evidenceReviews.map(review => (
          <View key={review.evidenceId} style={styles.actionRow}>
            <Badge tone={review.status === 'VALID' || review.status === 'REPLACED' ? 'NORMAL' : review.status === 'INVALID' ? 'CRITICAL_BLOCKER' : 'REVIEW_REQUIRED'}
              text={EVIDENCE_STATUS_LABEL[review.status]} />
            <Action label="유효" disabled={locked} onPress={() => actions.reviewEvidence(detail.ruleId, review.evidenceId, 'VALID', REASON)} />
            <Action label="무효" disabled={locked} onPress={() => actions.reviewEvidence(detail.ruleId, review.evidenceId, 'INVALID', REASON)} />
          </View>
        ))}
      </View>

      <View style={styles.actionRow}>
        <Action label="승인" tone="primary" disabled={!canApprove} onPress={() => actions.approve(detail.ruleId, REASON)} />
        <Action label="수정 후 승인" disabled={!canApprove}
          onPress={() => actions.approveWithEdit(detail.ruleId, proposeScopeEdit(), record.safetyBlockers, REASON)} />
        <Action label="보류" disabled={locked} onPress={() => actions.hold(detail.ruleId, REASON)} />
        <Action label="제외" tone="danger" disabled={locked} onPress={() => actions.reject(detail.ruleId, REASON)} />
      </View>

      <MotionPressable accessibilityRole="button" accessibilityState={{ expanded: showHistory }} aria-expanded={showHistory}
        onPress={() => setShowHistory(value => !value)} style={styles.historyToggle}>
        <Text style={styles.historyToggleText}>검수 이력 {detail.history.length}건 {showHistory ? '접기' : '보기'}</Text>
      </MotionPressable>
      {showHistory ? (
        detail.history.length
          ? detail.history.map(entry => (
            <Text key={entry.sequence} style={styles.historyItem}>
              {entry.at.slice(0, 16).replace('T', ' ')} · {entry.actor} · {historyLine(entry.action)} · {entry.reason}
            </Text>
          ))
          : <Text style={styles.historyItem}>아직 기록된 검수 이력이 없어요.</Text>
      ) : null}
    </View>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceHigh, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm, minWidth: 0 },
  head: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center', justifyContent: 'space-between' },
  title: { ...type.section, color: colors.text, flexShrink: 1 },
  role: { ...type.caption, color: colors.textSubtle },
  guard: { borderRadius: radius.cardSm, borderWidth: 1, borderColor: colors.error, backgroundColor: '#FFDAD6', padding: spacing.sm, gap: 2 },
  guardTitle: { ...type.bodySmStrong, color: '#93000A' },
  guardReason: { ...type.bodySm, color: colors.textMuted },
  cols: { gap: spacing.md },
  colsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  col: { flex: 1, gap: spacing.xs, minWidth: 0 },
  colTitle: { ...type.bodySmStrong, color: colors.textSubtle },
  editedTitle: { marginTop: spacing.sm },
  sourceBlock: { gap: 2, paddingBottom: spacing.xs },
  sourceWhere: { ...type.caption, color: colors.textSubtle },
  excerpt: { ...type.bodySm, color: colors.textMuted, borderLeftWidth: 2, borderLeftColor: colors.outline, paddingLeft: spacing.sm },
  evidenceRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  readonlyNote: { alignSelf: 'flex-start', borderRadius: radius.pill, backgroundColor: colors.surfaceHigh, paddingHorizontal: spacing.sm, paddingVertical: 1 },
  readonlyNoteText: { ...type.caption, color: colors.textMuted },
  editedNote: { alignSelf: 'flex-start', borderRadius: radius.pill, backgroundColor: colors.lavender, paddingHorizontal: spacing.sm, paddingVertical: 1 },
  editedNoteText: { ...type.caption, color: colors.primary },
  diff: { ...type.bodySm, color: colors.text },
  noEdit: { ...type.bodySm, color: colors.textMuted },
  field: { flexDirection: 'row', gap: spacing.sm },
  fieldLabel: { ...type.bodySm, color: colors.textSubtle, width: 76 },
  fieldValue: { ...type.bodySmStrong, color: colors.text, flex: 1 },
  warnings: { borderRadius: radius.cardSm, backgroundColor: '#FFDCC3', padding: spacing.sm, gap: 2 },
  warnTitle: { ...type.bodySmStrong, color: '#8A4900' },
  warnItem: { ...type.bodySm, color: colors.textMuted },
  sectionTitle: { ...type.bodySmStrong, color: colors.text },
  exception: { gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: spacing.sm },
  relationRow: { flexDirection: 'row', gap: spacing.xs, alignItems: 'center', flexWrap: 'wrap' },
  relationText: { ...type.bodySm, color: colors.textMuted, flexShrink: 1 },
  conflict: { borderRadius: radius.cardSm, borderWidth: 1, borderColor: colors.error, padding: spacing.sm, gap: spacing.xs },
  conflictTitle: { ...type.bodySmStrong, color: '#93000A' },
  conflictOption: { borderRadius: radius.cardSm, borderWidth: 1, borderColor: colors.surfaceHigh, padding: spacing.sm, gap: spacing.xs },
  conflictValue: { ...type.bodySmStrong, color: colors.text },
  conflictState: { ...type.bodySm, color: colors.textMuted },
  evidenceActions: { gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: spacing.sm },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center' },
  historyToggle: { minHeight: size.touch, justifyContent: 'center' },
  historyToggleText: { ...type.bodySmStrong, color: colors.primary },
  historyItem: { ...type.bodySm, color: colors.textMuted },
});
