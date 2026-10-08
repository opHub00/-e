import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import { tracking } from '../../../design/tokens';
import { k } from './theme';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

/** 행사 화면의 큰 버튼. */
export function KioskButton({
  label, onPress, variant = 'primary', icon, disabled, large, grow, testID, accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'soft' | 'ghost';
  icon?: IconName;
  disabled?: boolean;
  large?: boolean;
  grow?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const fg = variant === 'primary' ? k.colors.onPrimary : k.colors.primary;
  const trailingIcon = icon === 'arrow-forward' || icon === 'chevron-right';
  const iconNode = icon ? <MaterialIcons name={icon} size={large ? 28 : 24} color={fg} /> : null;
  return (
    <MotionPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        large && styles.buttonLarge,
        grow && styles.buttonGrow,
        variant === 'soft' && styles.buttonSoft,
        variant === 'ghost' && styles.buttonGhost,
        disabled && styles.buttonDisabled,
      ]}
    >
      {!trailingIcon ? iconNode : null}
      <Text style={[large ? k.type.section : k.type.bodyLgStrong, { color: fg }]}>{label}</Text>
      {trailingIcon ? iconNode : null}
    </MotionPressable>
  );
}

/** 질문 하나. 제목, 도움말, 답 칸. */
export function Question({ title, hint, children, testID }: { title: string; hint?: string; children: ReactNode; testID?: string }) {
  return (
    <View style={styles.question} testID={testID}>
      <Text style={styles.questionTitle} accessibilityRole="header">{title}</Text>
      {hint ? <Text style={styles.questionHint}>{hint}</Text> : null}
      <View style={styles.questionBody}>{children}</View>
    </View>
  );
}

/** 질문 묶음. 화면 하나에 섹션 두세 개를 넘기지 않는다. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export type Choice<T> = { value: T; label: string; hint?: string };

/** 큰 선택 버튼 묶음. 하나만 고른다. 고른 것을 다시 누르면 그대로 둔다(실수로 지워지지 않게). */
export function ChoiceGroup<T extends string | number | boolean | null>({
  choices, value, onChange, columns = 3, testID,
}: {
  choices: Choice<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  columns?: number;
  testID?: string;
}) {
  return (
    <View style={styles.choiceGrid} testID={testID} accessibilityRole="radiogroup">
      {choices.map(choice => {
        const selected = value === choice.value;
        return (
          <MotionPressable
            key={String(choice.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            aria-checked={selected}
            accessibilityLabel={choice.label}
            onPress={() => onChange(choice.value)}
            style={[styles.choice, { flexBasis: `${Math.floor(100 / columns) - 2}%` }, selected && styles.choiceSelected]}
          >
            <View style={styles.choiceRow}>
              <MaterialIcons
                name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
                size={24}
                color={selected ? k.colors.primary : k.colors.outline}
              />
              <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{choice.label}</Text>
            </View>
            {choice.hint ? <Text style={styles.choiceHint}>{choice.hint}</Text> : null}
          </MotionPressable>
        );
      })}
    </View>
  );
}

/**
 * 예 / 아니요 / 잘 모르겠어요. 모름은 null 로 남는다.
 * 아직 고르지 않은 것과 '모름'을 구별하려고 answered 를 따로 받는다(저장소가 기억한다).
 */
export function YesNoUnknown({
  value, answered, onChange, yes = '예', no = '아니요', testID,
}: {
  value: boolean | null;
  answered: boolean;
  onChange: (value: boolean | null) => void;
  yes?: string;
  no?: string;
  testID?: string;
}) {
  return (
    <ChoiceGroup<boolean | null>
      testID={testID}
      choices={[{ value: true, label: yes }, { value: false, label: no }, { value: null, label: '잘 모르겠어요' }]}
      value={answered || value !== null ? value : undefined}
      onChange={onChange}
    />
  );
}

const digits = (text: string) => text.replace(/[^0-9]/g, '');

/** 숫자를 입력하면 YYYY-MM-DD 로 맞춰 준다. 화면 키보드에서 하이픈을 찾지 않아도 된다. */
export function formatDateDigits(text: string): string {
  const d = digits(text).slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
}

export function DateInput({
  value, onChange, placeholder = '예) 19950914', testID, accessibilityLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  testID?: string;
  accessibilityLabel: string;
}) {
  return (
    <View style={styles.inputRow}>
      <TextInput
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        value={value}
        onChangeText={text => onChange(formatDateDigits(text))}
        placeholder={placeholder}
        placeholderTextColor={k.colors.textSubtle}
        inputMode="numeric"
        keyboardType="number-pad"
        maxLength={10}
        style={[styles.input, styles.inputDate]}
      />
      {value ? (
        <MotionPressable accessibilityRole="button" accessibilityLabel="지우기" onPress={() => onChange('')} style={styles.clear}>
          <MaterialIcons name="close" size={24} color={k.colors.textMuted} />
        </MotionPressable>
      ) : null}
    </View>
  );
}

/**
 * 숫자 입력. 저장소 값은 원 단위 숫자이고, 화면에서는 unitScale 로 나눠 보여 준다(예: 만원).
 * 입력 중인 글자는 화면이 따로 들고 있다가 숫자로 읽히는 순간 저장한다.
 * 뒤로 갔다 돌아오면 저장된 숫자로 다시 채운다.
 */
export function NumberInput({
  value, onChange, unit, unitScale = 1, placeholder, testID, accessibilityLabel, max, grouping = true,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  unit: string;
  unitScale?: number;
  placeholder?: string;
  testID?: string;
  accessibilityLabel: string;
  max?: number;
  /** 세 자리마다 쉼표. 연도처럼 쉼표가 어색한 숫자는 끈다. */
  grouping?: boolean;
}) {
  const shown = value === null ? '' : String(Math.round(value / unitScale));
  const [text, setText] = useState(shown);
  useEffect(() => { setText(current => (digits(current) === shown ? current : shown)); }, [shown]);
  return (
    <View style={styles.inputRow}>
      <TextInput
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        value={text ? (grouping ? Number(digits(text)).toLocaleString('ko-KR') : digits(text)) : ''}
        onChangeText={raw => {
          const d = digits(raw).slice(0, 12);
          setText(d);
          if (!d) { onChange(null); return; }
          const n = Number(d);
          onChange(max !== undefined ? Math.min(n, max) * unitScale : n * unitScale);
        }}
        placeholder={placeholder}
        placeholderTextColor={k.colors.textSubtle}
        inputMode="numeric"
        keyboardType="number-pad"
        style={[styles.input, styles.inputNumber]}
      />
      <Text style={styles.unit}>{unit}</Text>
    </View>
  );
}

/** 0~max 사이 정수. 세대원 수, 자녀 수처럼 작은 수. */
export function Stepper({
  value, onChange, min = 0, max = 10, unit, testID, accessibilityLabel,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  unit: string;
  testID?: string;
  accessibilityLabel: string;
}) {
  const current = value ?? min;
  return (
    <View style={styles.stepper} testID={testID}>
      <MotionPressable
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityLabel} 줄이기`}
        disabled={value === null || current <= min}
        onPress={() => onChange(Math.max(min, current - 1))}
        style={[styles.stepButton, (value === null || current <= min) && styles.buttonDisabled]}
      >
        <MaterialIcons name="remove" size={32} color={k.colors.primary} />
      </MotionPressable>
      <Text style={styles.stepValue} accessibilityLabel={`${accessibilityLabel} ${value ?? '미입력'}`}>
        {value === null ? '–' : `${value}${unit}`}
      </Text>
      <MotionPressable
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityLabel} 늘리기`}
        disabled={value !== null && current >= max}
        onPress={() => onChange(value === null ? Math.max(min, 1) : Math.min(max, current + 1))}
        style={[styles.stepButton, value !== null && current >= max && styles.buttonDisabled]}
      >
        <MaterialIcons name="add" size={32} color={k.colors.primary} />
      </MotionPressable>
    </View>
  );
}

/** '잘 모르겠어요' 하나짜리 버튼. 숫자 칸 옆에 붙여 값을 비운다. */
export function UnknownToggle({ active, onPress }: { active: boolean; onPress: () => void }) {
  return (
    <MotionPressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: active }}
      aria-checked={active}
      accessibilityLabel="잘 모르겠어요"
      onPress={onPress}
      style={[styles.unknown, active && styles.choiceSelected]}
    >
      <MaterialIcons name={active ? 'check-box' : 'check-box-outline-blank'} size={24} color={active ? k.colors.primary : k.colors.outline} />
      <Text style={styles.choiceLabel}>잘 모르겠어요</Text>
    </MotionPressable>
  );
}

export function Notice({ tone = 'info', children, icon }: { tone?: 'info' | 'warn' | 'error'; children: ReactNode; icon?: IconName }) {
  const palette = tone === 'error' ? k.tint.pink : tone === 'warn' ? k.tint.amber : k.tint.purple;
  return (
    <View style={[styles.notice, { backgroundColor: palette.bg }]} accessibilityRole={tone === 'error' ? 'alert' : undefined}>
      <MaterialIcons name={icon ?? (tone === 'info' ? 'info-outline' : 'error-outline')} size={24} color={palette.fg} />
      <Text style={[k.type.body, { color: palette.fg, flex: 1 }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: k.touch,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: k.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buttonLarge: { minHeight: k.touchLarge, paddingHorizontal: 32 },
  buttonGrow: { flex: 1 },
  buttonSoft: { backgroundColor: k.colors.primaryFixed },
  buttonGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: k.colors.outline },
  buttonDisabled: { opacity: 0.4 },
  section: {
    gap: 20,
    padding: 28,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: k.colors.outline,
    backgroundColor: k.colors.surface,
  },
  sectionTitle: { ...k.type.section, color: k.colors.text },
  sectionBody: { gap: 24 },
  question: { gap: 10 },
  questionTitle: { ...k.type.question, color: k.colors.text },
  questionHint: { ...k.type.caption, color: k.colors.textMuted },
  questionBody: { marginTop: 6 },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  choice: {
    flexGrow: 1,
    minHeight: 68,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: k.colors.surfaceHighest,
    backgroundColor: k.colors.surface,
    justifyContent: 'center',
    gap: 4,
  },
  choiceSelected: { borderColor: k.colors.primary, borderWidth: 2, backgroundColor: k.colors.lavender },
  choiceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  choiceLabel: { ...k.type.bodyLgStrong, color: k.colors.text, flexShrink: 1 },
  choiceLabelSelected: { color: k.colors.primary },
  choiceHint: { ...k.type.caption, color: k.colors.textMuted, marginLeft: 34 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  input: {
    minHeight: k.touch,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: k.colors.surfaceHighest,
    backgroundColor: k.colors.surface,
    paddingHorizontal: 20,
    ...k.type.section,
    color: k.colors.text,
  },
  inputDate: { flex: 1, minWidth: 220, letterSpacing: tracking.wide },
  inputNumber: { flex: 1, minWidth: 180, textAlign: 'right' },
  unit: { ...k.type.bodyLgStrong, color: k.colors.textMuted },
  clear: { width: k.touch, height: k.touch, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepButton: {
    width: k.touch,
    height: k.touch,
    borderRadius: 12,
    backgroundColor: k.colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: { ...k.type.title, color: k.colors.text, minWidth: 96, textAlign: 'center' },
  unknown: {
    minHeight: k.touch,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: k.colors.surfaceHighest,
    backgroundColor: k.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  notice: { flexDirection: 'row', gap: 12, padding: 20, borderRadius: 12, alignItems: 'flex-start' },
});
