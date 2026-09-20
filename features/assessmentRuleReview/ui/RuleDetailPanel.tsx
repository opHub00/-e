import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import { colors, radius, size, spacing, type } from '../../../design/tokens';
import { Action, Badge } from './RuleReviewConsole';
import { RuleEditForm } from './RuleEditForm';
import { ReviewRadioChoice } from './ReviewRadioChoice';
import { SCOPE_TEXT, STAGE_TEXT, canEditScore, describeChange, ruleConditionText } from './ruleFields';
import { reviewStatusPresentation } from './reviewPresentation';
import { clearReviewDraft, readReviewDraft } from './reviewDraftStore';
import {
  EVIDENCE_STATUS_LABEL, EXCEPTION_STATUS_LABEL, RELATION_LABEL, historyLine,
} from './reviewLabels';
import type { getRuleDetail } from '../server/dto';
import type { ReviewEvidence, RuleReviewRecord, RuleReviewWorkspace } from '../server/types';
import type { useRuleReviewWorkspace } from './useRuleReviewWorkspace';

type Props = {
  detail: ReturnType<typeof getRuleDetail>;
  record: RuleReviewRecord;
  workspace: RuleReviewWorkspace;
  blockReasons: string[];
  locked: boolean;
  /** A save is in flight: controls freeze, but an open edit keeps its input. */
  saving: boolean;
  revalidation: boolean;
  actions: ReturnType<typeof useRuleReviewWorkspace>['actions'];
  onDirtyChange: (dirty: boolean) => void;
  draftScope?: string;
};

const REASON = '관리자 검수 콘솔에서 확인';
const RELATION_CHOICES = ['LIMITED_BY', 'EXEMPTED_BY', 'OVERRIDDEN_BY', 'QUALIFIED_BY', 'APPLIES_ONLY_IF'] as const;

export function RuleDetailPanel({ detail, record, workspace, blockReasons, locked, saving, revalidation, actions, onDirtyChange, draftScope }: Props) {
  // Controls are inert while the session is locked or a save is in flight; only a
  // locked session closes the editor, because a pending save must not discard input.
  const inert = locked || saving;
  // Static export renders without a viewport; widening only after mount avoids a mismatch.
  const width = useWindowDimensions().width;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const wide = mounted && width >= 1024;

  const [showHistory, setShowHistory] = useState(false);
  const restoredDraft = useMemo(() => {
    const draft = readReviewDraft(draftScope);
    return draft && draft.ruleId === detail.ruleId ? draft : null;
  }, [detail.ruleId, draftScope]);
  const [editing, setEditing] = useState(false);
  const [replacingEvidence, setReplacingEvidence] = useState<string | null>(null);
  const [linkingBase, setLinkingBase] = useState<string | null>(null);
  const [customValue, setCustomValue] = useState('');
  const [customEvidence, setCustomEvidence] = useState<string | null>(null);

  const conflict = workspace.conflicts.find(item => item.candidateRuleIds.includes(detail.ruleId));
  const edited = detail.editedCandidate;
  const canApprove = !inert && blockReasons.length === 0;
  const orphan = detail.exceptionRelations.find(item => item.exceptionRuleId === detail.ruleId && item.status !== 'LINKED');
  const statusPresentation = reviewStatusPresentation(detail.reviewState, workspace.lifecycleStatus);

  // Editing is only meaningful while the session is open; leaving it closes the form.
  useEffect(() => { if (locked) { setEditing(false); onDirtyChange(false); } }, [locked, onDirtyChange]);

  /** Evidence a reviewer may swap in: anything else attached to the same document. */
  const replacementOptions = useMemo<ReviewEvidence[]>(() => workspace.rules
    .flatMap(rule => rule.originalCandidate.evidence)
    .filter(evidence => evidence.documentId === workspace.document.id && !record.originalCandidate.evidence.some(own => own.id === evidence.id))
    .filter((evidence, index, all) => all.findIndex(item => item.id === evidence.id) === index), [record, workspace]);

  /** Base rules an exception can hang from: any non-exception rule in the same package. */
  const baseOptions = useMemo(() => workspace.rules
    .filter(rule => rule.ruleId !== detail.ruleId && rule.originalCandidate.category !== 'EXCEPTION')
    .map(rule => ({ id: rule.ruleId, snapshot: rule.editedRuleSnapshot ?? rule.originalCandidate })), [detail.ruleId, workspace]);

  const conflictEvidenceIds = useMemo(
    () => [...new Set((conflict?.candidates ?? []).flatMap(candidate => candidate.evidenceIds))], [conflict]);

  return (
    <View style={styles.panel}>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.title}>{detail.ruleLabel}</Text>
        <Badge tone={statusPresentation.tone} text={statusPresentation.currentLabel} />
      </View>
      <Text style={styles.role}>{detail.semanticRole}</Text>
      {revalidation ? (
        <View style={styles.revalidationNotice}>
          <Text style={styles.revalidationNoticeText}>현재 공고문 기준 재확인이 필요합니다.</Text>
          {statusPresentation.previousLabel ? <Text style={styles.previousDecision}>{statusPresentation.previousLabel}</Text> : null}
        </View>
      ) : null}

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
            </View>
          ))}
        </View>

        <View style={styles.col}>
          <Text accessibilityRole="header" style={styles.colTitle}>AI 원본 candidate</Text>
          {/* AI 원본은 수정 대상이 아니다. 입력이 아니라 읽기 전용 기록으로 보여준다. */}
          <View style={styles.readonlyNote}><Text style={styles.readonlyNoteText}>읽기 전용 · 추출 당시 기록</Text></View>
          <Field label="적용 대상" value={`${detail.originalCandidate.supplyType} / ${SCOPE_TEXT[detail.originalCandidate.scope ?? ''] ?? detail.originalCandidate.scope ?? '—'}`} />
          <Field label="공급단계" value={detail.originalCandidate.stage ? STAGE_TEXT[detail.originalCandidate.stage] : '단계 없음'} />
          <Field label="조건" value={ruleConditionText(detail.originalCandidate)} />
          {canEditScore(detail.originalCandidate) ? (
            <Field label="배점" value={detail.originalCandidate.score === null ? '배점 없음' : `${detail.originalCandidate.score} / ${detail.originalCandidate.maxScore ?? '—'}`} />
          ) : null}

          <Text accessibilityRole="header" style={[styles.colTitle, styles.editedTitle]}>관리자 수정본</Text>
          {edited ? (
            <>
              <View style={styles.editedNote}><Text style={styles.editedNoteText}>수정 후 승인됨 · 원본과 {record.editDiff.length}개 항목이 달라요</Text></View>
              {record.editDiff.map(change => {
                const described = describeChange(change.path, change.before, change.after);
                return <Text key={change.path} style={styles.diff}>{described.label}: {described.before} → {described.after}</Text>;
              })}
              <Field label="최종 조건" value={ruleConditionText(edited)} />
            </>
          ) : editing ? null : (
            <>
              <Text style={styles.noEdit}>아직 수정본이 없어요. 원본 그대로 승인하거나, 고쳐서 승인할 수 있어요.</Text>
              {restoredDraft ? (
                <Text style={styles.draftNote}>이전에 작성하던 수정 내용이 남아 있어요. 편집을 열면 이어서 쓸 수 있어요.</Text>
              ) : null}
              <Action label={restoredDraft ? '작성하던 수정 이어서 하기' : '값 고치기'} disabled={inert} onPress={() => setEditing(true)} />
            </>
          )}
        </View>
      </View>

      {editing ? (
        <RuleEditForm
          original={record.originalCandidate}
          restored={restoredDraft?.edited ?? null}
          saving={saving}
          draftScope={draftScope}
          onDirtyChange={onDirtyChange}
          onCancel={() => { clearReviewDraft(draftScope); setEditing(false); }}
          onSave={async next => {
            // The form stays open and the draft stays on disk until the server accepts.
            const result = await actions.approveWithEdit(detail.ruleId, next, record.safetyBlockers, REASON);
            if (result.ok) { clearReviewDraft(draftScope); setEditing(false); onDirtyChange(false); }
          }}
        />
      ) : null}

      {detail.warnings.length ? (
        <View style={styles.warnings}>
          <Text accessibilityRole="header" style={styles.warnTitle}>검증 경고 {detail.warnings.length}건</Text>
          {detail.warnings.map(warning => <Text key={warning} style={styles.warnItem}>• {warning}</Text>)}
        </View>
      ) : null}

      {detail.exceptionRelations.length ? (
        <View style={styles.section}>
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
          {orphan ? (
            <View style={styles.subsection}>
              {/* ID를 직접 입력하게 두지 않는다. 이름·조건·대상·단계를 보고 고른다. */}
              <Text style={styles.fieldLabel}>어떤 기본 규칙을 한정하나요?</Text>
              {baseOptions.map(option => (
                <ReviewRadioChoice
                  key={option.id} selected={linkingBase === option.id}
                  disabled={inert} onPress={() => setLinkingBase(option.id)}
                  style={[styles.baseOption, linkingBase === option.id && styles.baseOptionOn]}
                >
                  <Text style={styles.baseLabel}>{option.snapshot.label}</Text>
                  <Text style={styles.baseMeta}>
                    {ruleConditionText(option.snapshot)} · {SCOPE_TEXT[option.snapshot.scope ?? ''] ?? '—'} · {option.snapshot.stage ? STAGE_TEXT[option.snapshot.stage] : '단계 없음'}
                  </Text>
                </ReviewRadioChoice>
              ))}
              <Text style={styles.fieldLabel}>관계 유형</Text>
              <View style={styles.actionRow}>
                {RELATION_CHOICES.map(relationType => (
                  <Action key={relationType} label={RELATION_LABEL[relationType]} disabled={inert || !linkingBase}
                    onPress={() => actions.linkException(detail.ruleId, { status: 'LINKED', baseRuleId: linkingBase!, relationType }, REASON)} />
                ))}
              </View>
              <Action label="독립 예외로 둠" disabled={inert} onPress={() => actions.linkException(detail.ruleId, { status: 'INDEPENDENT' }, REASON)} />
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
              <Text style={styles.conflictValue}>{index === 0 ? '①' : '②'} {String(candidate.value)}</Text>
              <Action label="이 근거 채택" disabled={inert}
                onPress={() => actions.resolveConflict(conflict.conflictId, { type: 'CANDIDATE', candidateId: candidate.candidateId, reason: REASON }, REASON)} />
            </View>
          ))}

          {/* 둘 다 아닐 때. 근거 없이는 저장하지 못하게 막는다. */}
          <View style={styles.subsection}>
            <Text style={styles.fieldLabel}>둘 다 아니면 직접 입력</Text>
            <TextInput accessibilityLabel="직접 입력할 기준" style={styles.input} value={customValue} onChangeText={setCustomValue}
              placeholder="예: 공고일 기준 1년 이상 계속 거주" placeholderTextColor={colors.textSubtle} editable={!inert} />
            <Text style={styles.fieldLabel}>이 판단의 근거</Text>
            {conflictEvidenceIds.map(id => {
              const source = workspace.rules.flatMap(rule => rule.originalCandidate.evidence).find(item => item.id === id);
              return (
                <ReviewRadioChoice key={id} selected={customEvidence === id}
                  disabled={inert} onPress={() => setCustomEvidence(id)} style={[styles.baseOption, customEvidence === id && styles.baseOptionOn]}>
                  <Text style={styles.baseLabel}>{source?.label ?? id}</Text>
                  <Text style={styles.baseMeta}>{[source?.section, source?.tableLabel].filter(Boolean).join(' · ')}</Text>
                </ReviewRadioChoice>
              );
            })}
            {!customValue.trim() || !customEvidence ? (
              <Text style={styles.hintWarn}>직접 입력한 기준은 값과 근거를 모두 지정해야 저장할 수 있어요.</Text>
            ) : null}
            <Action label="직접 입력한 기준으로 확정" disabled={inert || !customValue.trim() || !customEvidence}
              onPress={() => actions.resolveConflict(conflict.conflictId,
                { type: 'CUSTOM', value: customValue.trim(), evidenceIds: [customEvidence!], reason: REASON }, REASON)} />
          </View>

          <Text style={styles.conflictState}>
            {conflict.resolution
              ? `현재: ${conflict.resolution.type === 'CANDIDATE' ? `${conflict.resolution.candidateId} 채택`
                : conflict.resolution.type === 'HELD' ? '보류' : `직접 입력 · ${String(conflict.resolution.value)}`}`
              : '현재: 선택 없음'}
          </Text>
          <Action label="둘 다 보류하고 원문 재확인" disabled={inert}
            onPress={() => actions.resolveConflict(conflict.conflictId, { type: 'HELD', reason: REASON }, REASON)} />
        </View>
      ) : null}

      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>근거 검토</Text>
        {record.evidenceReviews.map(review => {
          const source = record.originalCandidate.evidence.find(item => item.id === review.evidenceId);
          return (
            <View key={review.evidenceId} style={styles.evidenceBlock}>
              <View style={styles.actionRow}>
                <Badge tone={review.status === 'VALID' || review.status === 'REPLACED' ? 'NORMAL' : review.status === 'INVALID' ? 'CRITICAL_BLOCKER' : 'REVIEW_REQUIRED'}
                  text={EVIDENCE_STATUS_LABEL[review.status]} />
                <Action label="유효" disabled={inert} onPress={() => actions.reviewEvidence(detail.ruleId, review.evidenceId, 'VALID', REASON)} />
                <Action label="무효" disabled={inert} onPress={() => actions.reviewEvidence(detail.ruleId, review.evidenceId, 'INVALID', REASON)} />
                <Action label={replacingEvidence === review.evidenceId ? '교체 취소' : '다른 근거로 교체'} disabled={inert}
                  onPress={() => setReplacingEvidence(current => current === review.evidenceId ? null : review.evidenceId)} />
              </View>
              {review.replacement ? (
                <Text style={styles.replacedNote}>교체됨 → {review.replacement.label} · {[review.replacement.section, review.replacement.tableLabel].filter(Boolean).join(' · ')}</Text>
              ) : null}
              {replacingEvidence === review.evidenceId ? (
                <View style={styles.subsection}>
                  <Text style={styles.fieldLabel}>지금 근거</Text>
                  <Text style={styles.excerpt}>{source?.textExcerpt ?? '원문 발췌 없음'}</Text>
                  <Text style={styles.fieldLabel}>바꿀 근거 고르기</Text>
                  {replacementOptions.length ? replacementOptions.map(option => (
                    <View key={option.id} style={styles.baseOption}>
                      <Text style={styles.baseLabel}>{option.label}</Text>
                      <Text style={styles.baseMeta}>{[option.section, option.tableLabel].filter(Boolean).join(' · ')}</Text>
                      <Text style={styles.excerpt}>{option.textExcerpt ?? '원문 발췌 없음'}</Text>
                      <Action label="이 근거로 교체" disabled={inert}
                        onPress={() => { actions.reviewEvidence(detail.ruleId, review.evidenceId, 'REPLACED', REASON, option); setReplacingEvidence(null); }} />
                    </View>
                  )) : <Text style={styles.hintWarn}>같은 문서에서 바꿀 수 있는 다른 근거가 없어요.</Text>}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={styles.actionRow}>
        <Action label="승인" tone="primary" disabled={!canApprove} onPress={() => actions.approve(detail.ruleId, REASON)} />
        <Action label="보류" disabled={inert} onPress={() => actions.hold(detail.ruleId, REASON)} />
        <Action label="제외" tone="danger" disabled={inert} onPress={() => actions.reject(detail.ruleId, REASON)} />
      </View>

      <MotionPressable accessibilityRole="button" accessibilityState={{ expanded: showHistory }} aria-expanded={showHistory}
        onPress={() => setShowHistory(value => !value)} style={styles.historyToggle}>
        <Text style={styles.historyToggleText}>검수 이력 {detail.history.length}건 {showHistory ? '접기' : '보기'}</Text>
      </MotionPressable>
      {showHistory ? (
        detail.history.length
          ? detail.history.map(entry => (
            <Text key={entry.sequence} style={styles.historyItem}>
              {entry.at.slice(0, 16).replace('T', ' ')} · {entry.actor} · {revalidation ? '이전 문서 기준 · ' : ''}{historyLine(entry.action)} · {entry.reason}
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
      <Text style={styles.fieldLabelInline}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceHigh, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm, minWidth: 0 },
  head: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center', justifyContent: 'space-between' },
  title: { ...type.section, color: colors.text, flexShrink: 1 },
  role: { ...type.caption, color: colors.textSubtle },
  revalidationNotice: { borderRadius: radius.cardSm, borderWidth: 1, borderColor: colors.warning, backgroundColor: '#FFDCC3', padding: spacing.sm, gap: 2 },
  revalidationNoticeText: { ...type.bodySmStrong, color: '#8A4900' },
  previousDecision: { ...type.caption, color: colors.textMuted },
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
  readonlyNote: { alignSelf: 'flex-start', borderRadius: radius.pill, backgroundColor: colors.surfaceHigh, paddingHorizontal: spacing.sm, paddingVertical: 1 },
  readonlyNoteText: { ...type.caption, color: colors.textMuted },
  editedNote: { alignSelf: 'flex-start', borderRadius: radius.pill, backgroundColor: colors.lavender, paddingHorizontal: spacing.sm, paddingVertical: 1 },
  editedNoteText: { ...type.caption, color: colors.primary },
  diff: { ...type.bodySm, color: colors.text },
  noEdit: { ...type.bodySm, color: colors.textMuted },
  draftNote: { ...type.bodySm, color: colors.primary },
  field: { flexDirection: 'row', gap: spacing.sm },
  fieldLabelInline: { ...type.bodySm, color: colors.textSubtle, width: 76 },
  fieldLabel: { ...type.caption, color: colors.textSubtle },
  fieldValue: { ...type.bodySmStrong, color: colors.text, flex: 1 },
  warnings: { borderRadius: radius.cardSm, backgroundColor: '#FFDCC3', padding: spacing.sm, gap: 2 },
  warnTitle: { ...type.bodySmStrong, color: '#8A4900' },
  warnItem: { ...type.bodySm, color: colors.textMuted },
  section: { gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: spacing.sm },
  subsection: { gap: spacing.xs, paddingLeft: spacing.sm, borderLeftWidth: 2, borderLeftColor: colors.surfaceHigh },
  sectionTitle: { ...type.bodySmStrong, color: colors.text },
  relationRow: { flexDirection: 'row', gap: spacing.xs, alignItems: 'center', flexWrap: 'wrap' },
  relationText: { ...type.bodySm, color: colors.textMuted, flexShrink: 1 },
  baseOption: { borderRadius: radius.cardSm, borderWidth: 1, borderColor: colors.surfaceHigh, padding: spacing.sm, gap: 2 },
  baseOptionOn: { borderColor: colors.primary, backgroundColor: colors.lavender },
  baseLabel: { ...type.bodySmStrong, color: colors.text },
  baseMeta: { ...type.caption, color: colors.textMuted },
  conflict: { borderRadius: radius.cardSm, borderWidth: 1, borderColor: colors.error, padding: spacing.sm, gap: spacing.xs },
  conflictTitle: { ...type.bodySmStrong, color: '#93000A' },
  conflictOption: { borderRadius: radius.cardSm, borderWidth: 1, borderColor: colors.surfaceHigh, padding: spacing.sm, gap: spacing.xs },
  conflictValue: { ...type.bodySmStrong, color: colors.text },
  conflictState: { ...type.bodySm, color: colors.textMuted },
  evidenceBlock: { gap: spacing.xs, paddingBottom: spacing.xs },
  replacedNote: { ...type.bodySm, color: colors.primary },
  input: { ...type.bodySm, color: colors.text, borderWidth: 1, borderColor: colors.outline, borderRadius: radius.button, minHeight: size.control, paddingHorizontal: spacing.sm },
  hintWarn: { ...type.caption, color: colors.error },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center' },
  historyToggle: { minHeight: size.touch, justifyContent: 'center' },
  historyToggleText: { ...type.bodySmStrong, color: colors.primary },
  historyItem: { ...type.bodySm, color: colors.textMuted },
});
