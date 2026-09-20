import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import { ReviewRadioChoice } from './ReviewRadioChoice';
import { colors, radius, size, spacing, type } from '../../../design/tokens';
import {
  OPERATOR_CHOICES, OPERATOR_TEXT, SCOPE_CHOICES, SCOPE_TEXT, STAGE_CHOICES, STAGE_TEXT, UNIT_SUFFIX,
  canEditOperator, canEditScore, describeChange, numberHint, parseNumber, ruleConditionText, valueKindOf, type RangeClause,
} from './ruleFields';
import type { ReviewableRuleSnapshot } from '../server/types';

type Props = {
  original: ReviewableRuleSnapshot;
  onCancel: () => void;
  onSave: (edited: ReviewableRuleSnapshot) => void;
  onDirtyChange: (dirty: boolean) => void;
};

const rangeOf = (value: unknown) => Array.isArray(value) ? (value as RangeClause[]) : [];

/**
 * Typed editor for the fields a reviewer actually corrects.
 *
 * `semanticRole` and `ruleKey` stay out of the form: the service rejects an edit that
 * changes a rule's identity, and letting someone retype a role here would only produce
 * a refusal. Everything else is edited through a control that matches the value's kind,
 * and the change is previewed as a sentence before it is saved.
 */
export function RuleEditForm({ original, onCancel, onSave, onDirtyChange }: Props) {
  const kind = valueKindOf(original);
  const showOperator = canEditOperator(original);
  const showScore = canEditScore(original);
  const range = rangeOf(original.value);
  const [scalar, setScalar] = useState(() => kind === 'BOOLEAN' || kind === 'AGE_RANGE' ? '' : String(original.value ?? ''));
  const [bounds, setBounds] = useState(() => range.map(item => String(item.value)));
  const [boolean_, setBoolean] = useState(() => original.value === true);
  const [operator, setOperator] = useState(original.operator);
  const [scope, setScope] = useState(original.scope);
  const [stage, setStage] = useState(original.stage);
  const [score, setScore] = useState(original.score === null ? '' : String(original.score));
  const [maxScore, setMaxScore] = useState(original.maxScore === null ? '' : String(original.maxScore));

  const next = useMemo<ReviewableRuleSnapshot | null>(() => {
    const draft = structuredClone(original);
    if (kind === 'AGE_RANGE') {
      if (bounds.some(value => parseNumber(value) === null)) return null;
      draft.value = range.map((item, index) => ({ ...item, value: parseNumber(bounds[index])! }));
    } else if (kind === 'BOOLEAN') {
      draft.value = boolean_;
    } else if (kind === 'TEXT') {
      if (!scalar.trim()) return null;
      draft.value = scalar.trim();
    } else if (kind === 'UNSUPPORTED') {
      draft.value = original.value;
    } else {
      const parsed = parseNumber(scalar);
      if (parsed === null) return null;
      draft.value = parsed;
    }
    if (showOperator) draft.operator = operator;
    draft.scope = scope;
    draft.stage = stage;
    if (showScore) {
      draft.score = score.trim() ? parseNumber(score) : null;
      draft.maxScore = maxScore.trim() ? parseNumber(maxScore) : null;
      if (score.trim() && draft.score === null) return null;
      if (maxScore.trim() && draft.maxScore === null) return null;
    }
    return draft;
  }, [bounds, boolean_, kind, maxScore, operator, original, range, scalar, scope, score, showOperator, showScore, stage]);

  const changes = useMemo(() => {
    if (!next) return [];
    const paths: (keyof ReviewableRuleSnapshot)[] = ['value', 'operator', 'scope', 'stage', 'score', 'maxScore'];
    return paths
      .filter(path => JSON.stringify(next[path]) !== JSON.stringify(original[path]))
      .map(path => describeChange(path, original[path], next[path]));
  }, [next, original]);

  const dirty = changes.length > 0;
  // Reported through an effect so the parent's dirty guard never updates during render.
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  return (
    <View style={styles.form}>
      <Text accessibilityRole="header" style={styles.title}>관리자 수정</Text>

      {kind === 'UNSUPPORTED' ? (
        <Text style={styles.unsupported}>
          이 규칙의 값은 콘솔에서 편집할 수 있는 형태가 아니에요. 적용 대상과 공급단계만 고칠 수 있어요.
        </Text>
      ) : kind === 'AGE_RANGE' ? (
        <View style={styles.rangeRow}>
          {range.map((item, index) => (
            <View key={`${item.fact}:${item.op}`} style={styles.rangeField}>
              <Text style={styles.fieldLabel}>{OPERATOR_TEXT[item.op] ?? item.op} 기준</Text>
              <TextInput
                accessibilityLabel={`${OPERATOR_TEXT[item.op] ?? item.op} 기준 값`} style={styles.input} inputMode="numeric"
                value={bounds[index]} onChangeText={value => setBounds(current => current.map((old, i) => i === index ? value : old))}
              />
              <Text style={styles.hint}>{numberHint('AGE_RANGE', bounds[index]) ?? '숫자를 입력해 주세요'}</Text>
            </View>
          ))}
        </View>
      ) : kind === 'BOOLEAN' ? (
        <View style={styles.choices}>
          {[['예', true], ['아니요', false]].map(([label, value]) => (
            <Choice key={String(value)} label={label as string} selected={boolean_ === value} onPress={() => setBoolean(value as boolean)} />
          ))}
        </View>
      ) : (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>조건 값{UNIT_SUFFIX[kind] ? ` (${UNIT_SUFFIX[kind]})` : ''}</Text>
          <TextInput
            accessibilityLabel="조건 값" style={styles.input} value={scalar} onChangeText={setScalar}
            inputMode={kind === 'TEXT' ? 'text' : 'numeric'}
          />
          {/* 원 단위 숫자는 0의 개수를 세지 않도록 사람이 읽는 단위로 되읽어 준다. */}
          {kind === 'TEXT' ? null : <Text style={styles.hint}>{numberHint(kind, scalar) ?? '숫자를 입력해 주세요'}</Text>}
        </View>
      )}

      {showOperator ? (
        <>
          <Text style={styles.fieldLabel}>비교 방식</Text>
          <View style={styles.choices}>
            {OPERATOR_CHOICES.map(value => (
              <Choice key={value} label={OPERATOR_TEXT[value]} selected={operator === value} onPress={() => setOperator(value)} />
            ))}
          </View>
        </>
      ) : null}

      <Text style={styles.fieldLabel}>적용 대상</Text>
      <View style={styles.choices}>
        {SCOPE_CHOICES.map(value => (
          <Choice key={value} label={SCOPE_TEXT[value]} selected={scope === value} onPress={() => setScope(value)} />
        ))}
      </View>

      <Text style={styles.fieldLabel}>공급단계</Text>
      <View style={styles.choices}>
        {STAGE_CHOICES.map(value => (
          <Choice key={String(value)} label={value ? STAGE_TEXT[value] : '단계 없음'} selected={stage === value} onPress={() => setStage(value)} />
        ))}
      </View>

      {showScore ? (
        <View style={styles.scoreRow}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>배점</Text>
            <TextInput accessibilityLabel="배점" style={styles.input} inputMode="numeric" value={score} onChangeText={setScore} placeholder="배점 없음" placeholderTextColor={colors.textSubtle} />
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>배점 만점</Text>
            <TextInput accessibilityLabel="배점 만점" style={styles.input} inputMode="numeric" value={maxScore} onChangeText={setMaxScore} placeholder="만점 없음" placeholderTextColor={colors.textSubtle} />
          </View>
        </View>
      ) : null}

      {/* 저장 전에 무엇이 어떻게 바뀌는지 문장으로 먼저 보여준다. */}
      <View style={styles.preview}>
        <Text accessibilityRole="header" style={styles.previewTitle}>저장하면 이렇게 바뀌어요</Text>
        {!next ? (
          <Text style={styles.invalid}>입력값을 확인해 주세요. 숫자 칸에 올바른 값이 필요해요.</Text>
        ) : changes.length === 0 ? (
          <Text style={styles.noChange}>아직 바뀐 항목이 없어요. 원본과 같으면 수정 후 승인을 할 수 없어요.</Text>
        ) : (
          changes.map(change => (
            <View key={change.label} style={styles.changeRow}>
              <Text style={styles.changeLabel}>{change.label}</Text>
              <Text style={styles.changeBefore}>{change.before}</Text>
              <Text style={styles.changeArrow}>→</Text>
              <Text style={styles.changeAfter}>{change.after}</Text>
            </View>
          ))
        )}
        <Text style={styles.currentCondition}>
          최종 조건: {next ? ruleConditionText(next) : '—'}
        </Text>
      </View>

      <View style={styles.actions}>
        <MotionPressable
          accessibilityRole="button" accessibilityState={{ disabled: !next || !changes.length }} disabled={!next || !changes.length}
          onPress={() => next && onSave(next)} style={[styles.save, (!next || !changes.length) && styles.off]}
        >
          <Text style={styles.saveText}>이 수정으로 승인</Text>
        </MotionPressable>
        <MotionPressable accessibilityRole="button" onPress={() => { onDirtyChange(false); onCancel(); }} style={styles.cancel}>
          <Text style={styles.cancelText}>편집 취소</Text>
        </MotionPressable>
      </View>
    </View>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <ReviewRadioChoice selected={selected} onPress={onPress} style={[styles.choice, selected && styles.choiceOn]}>
      <Text style={[styles.choiceText, selected && styles.choiceTextOn]}>{label}</Text>
    </ReviewRadioChoice>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: spacing.sm },
  title: { ...type.bodySmStrong, color: colors.text },
  unsupported: { ...type.bodySm, color: colors.textMuted },
  field: { gap: 2, flex: 1, minWidth: 0 },
  fieldLabel: { ...type.caption, color: colors.textSubtle },
  input: { ...type.bodySm, color: colors.text, borderWidth: 1, borderColor: colors.outline, borderRadius: radius.button, minHeight: size.control, paddingHorizontal: spacing.sm },
  hint: { ...type.caption, color: colors.textMuted },
  rangeRow: { flexDirection: 'row', gap: spacing.sm },
  rangeField: { flex: 1, gap: 2, minWidth: 0 },
  scoreRow: { flexDirection: 'row', gap: spacing.sm },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  choice: { minHeight: size.touch, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.outline, paddingHorizontal: spacing.sm },
  choiceOn: { backgroundColor: colors.lavender, borderColor: colors.primary },
  choiceText: { ...type.bodySm, color: colors.text }, choiceTextOn: { color: colors.primary },
  preview: { borderRadius: radius.cardSm, backgroundColor: colors.surfaceLow, padding: spacing.sm, gap: 2, marginTop: spacing.xs },
  previewTitle: { ...type.bodySmStrong, color: colors.text },
  invalid: { ...type.bodySm, color: colors.error },
  noChange: { ...type.bodySm, color: colors.textMuted },
  changeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'baseline' },
  changeLabel: { ...type.bodySm, color: colors.textSubtle, minWidth: 72 },
  changeBefore: { ...type.bodySm, color: colors.textMuted, textDecorationLine: 'line-through' },
  changeArrow: { ...type.bodySm, color: colors.textSubtle },
  changeAfter: { ...type.bodySmStrong, color: colors.primary },
  currentCondition: { ...type.bodySm, color: colors.text, marginTop: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  save: { minHeight: size.touch, justifyContent: 'center', borderRadius: radius.button, backgroundColor: colors.primary, paddingHorizontal: spacing.md },
  saveText: { ...type.bodySmStrong, color: colors.onPrimary },
  off: { opacity: 0.4 },
  cancel: { minHeight: size.touch, justifyContent: 'center', borderRadius: radius.button, borderWidth: 1, borderColor: colors.outline, paddingHorizontal: spacing.md },
  cancelText: { ...type.bodySmStrong, color: colors.text },
});
