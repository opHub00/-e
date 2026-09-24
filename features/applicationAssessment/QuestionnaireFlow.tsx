import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { PrimaryButton } from '../../components/PrimaryButton';
import { WanpanCard } from '../../components/WanpanCard';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { Appear } from '../../components/motion/Appear';
import { AnimatedBar } from '../../components/motion/AnimatedBar';
import { colors, radius, size, spacing, type } from '../../design/tokens';
import type { ApplicantProfileV2 } from '../profile/domain';
import type { AnnouncementRules, AssessmentInput, SupplyType } from './types';
import { koreanMoneyHint } from './form';
import { assessmentDetails, profileUpdatesFromAnswers } from './questionnaire/adapter';
import { clearDraft, readDraft, writeDraft } from './questionnaire/draft';
import { displayDate, formatDateInput, formatDateListInput, normalizeDateInput } from './questionnaire/dateInput';
import { applyPrefill, buildQuestionnaire, questionnaireProgress, type Answers, type Question } from './questionnaire/questions';
import { buildSteps, firstIncompleteStep } from './questionnaire/categories';

type Props = {
  rules: AnnouncementRules | undefined;
  supply: SupplyType;
  profile: ApplicantProfileV2;
  listingId: string;
  residenceRegion?: { short: string; profile: string } | null;
  onProfileChange: (profile: ApplicantProfileV2) => void;
  onComplete: (details: AssessmentInput['details'], profile: ApplicantProfileV2) => void;
  onBack: () => void;
  /** 단계가 바뀌면 부모 화면을 맨 위로 올린다. 스크롤 영역은 부모 하나만 둔다. */
  onStepChange?: () => void;
};

type Bounds = { notAfter?: string; notAfterLabel?: string } | undefined;

/** 날짜 칸은 치는 동안 연-월-일로 끊어 준다. 다른 칸은 사용자가 친 그대로 둔다. */
const formatAnswer = (kind: Question['kind'], value: string) =>
  kind === 'date' ? formatDateInput(value) : kind === 'dateList' ? formatDateListInput(value) : value;

/** 요약 화면에 되읽어 주는 표기. 답이 없으면 null. */
function answerLabel(question: Question, answers: Answers, bounds: Bounds): string | null {
  const raw = (answers[question.id] ?? '').trim();
  if (!raw) return null;
  if (question.options) return question.options.find(option => option.value === raw)?.label ?? raw;
  if (question.kind === 'date') {
    const parsed = normalizeDateInput(raw, bounds);
    return parsed.status === 'OK' ? displayDate(parsed.value) : raw;
  }
  if (question.kind === 'dateList') {
    if (['없음', '없어요', '0'].includes(raw)) return '없음';
    const parts = raw.split(',').map(part => normalizeDateInput(part.trim(), bounds)).map(p => (p.status === 'OK' ? displayDate(p.value) : null));
    return parts.every(Boolean) ? parts.join(', ') : raw;
  }
  if (question.kind === 'money') return koreanMoneyHint(raw) ?? raw;
  return raw;
}

type BlockProps = {
  question: Question;
  answers: Answers;
  error?: string;
  bounds: Bounds;
  onChange: (id: string, value: string) => void;
  onTouch: (id: string) => void;
};

/** 질문 한 개. 한 단계 안에 이런 블록이 1~5개 쌓인다. */
function QuestionBlock({ question, answers, error, bounds, onChange, onTouch }: BlockProps) {
  const value = answers[question.id] ?? '';
  const choice = question.kind === 'boolean' || question.kind === 'choice';
  const parsedDate = question.kind === 'date' ? normalizeDateInput(value, bounds) : undefined;
  return <View style={styles.block}>
    <Text accessibilityRole="header" style={styles.question}>{question.title}</Text>
    {question.why ? <Text style={styles.why}>{question.why}</Text> : null}
    {question.help ? <Text style={styles.body}>{question.help}</Text> : null}
    {question.prefill && value === question.prefill.value
      ? <Text style={styles.prefill}>{question.prefill.source}에서 가져왔어요. 다르면 고쳐 주세요.</Text> : null}

    {choice ? (
      <View style={styles.options}>
        {(question.options ?? []).map(option => (
          <MotionPressable key={option.value || 'unknown'} accessibilityRole="radio" accessibilityState={{ checked: value === option.value }}
            onPress={() => { onChange(question.id, option.value); onTouch(question.id); }}
            style={[styles.option, value === option.value && styles.optionSelected]}>
            <Text style={[styles.optionText, value === option.value && styles.optionTextSelected]}>{option.label}</Text>
          </MotionPressable>
        ))}
      </View>
    ) : (
      <>
        <TextInput
          accessibilityLabel={question.title}
          value={value}
          onChangeText={next => onChange(question.id, formatAnswer(question.kind, next))}
          onBlur={() => onTouch(question.id)}
          placeholder={question.kind === 'date' ? '예: 19940705' : question.kind === 'dateList' ? '예: 20220510, 20240103 (없으면 없음)' : question.kind === 'money' ? '원 단위 · 예: 7000000' : '숫자만 입력'}
          placeholderTextColor={colors.textSubtle}
          keyboardType={question.kind === 'money' || question.kind === 'number' || question.kind === 'date' ? 'number-pad' : 'default'}
          inputMode={question.kind === 'dateList' ? 'text' : 'numeric'}
          style={[styles.input, error ? styles.inputError : null]}
        />
        {question.kind === 'money' && koreanMoneyHint(value) ? <Text style={styles.hint}>입력한 금액: {koreanMoneyHint(value)}</Text> : null}
        {parsedDate?.status === 'OK' && !error ? <Text style={styles.hint}>{displayDate(parsedDate.value)}로 확인했어요</Text> : null}
      </>
    )}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}

/**
 * 카테고리별로 묻는 판정 질문지.
 *
 * 무엇을 물을지는 questionnaire/questions 가, 어떻게 묶을지는 questionnaire/categories 가 정한다.
 * 이 화면은 한 번에 한 카테고리만 보여주고, 답을 로컬에 저장하고, 마지막에 기존 판정 입력(details)으로
 * 바꿔 넘길 뿐이다. 규칙 엔진에는 아무 조건도 넣지 않는다.
 */
export function QuestionnaireFlow({ rules, supply, profile, listingId, residenceRegion, onProfileChange, onComplete, onBack, onStepChange }: Props) {
  const announcementDate = rules?.announcementDate ?? null;
  const restored = useRef(false);
  const [answers, setAnswers] = useState<Answers>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const questions = useMemo(
    () => buildQuestionnaire({ rules, supply, profile, answers, announcementDate, residenceRegion }),
    [rules, supply, profile, answers, announcementDate, residenceRegion],
  );
  const bounds = announcementDate ? { notAfter: announcementDate, notAfterLabel: `공고일(${displayDate(announcementDate)})` } : undefined;
  const { details, errors } = useMemo(() => assessmentDetails(questions, answers, supply, bounds), [questions, answers, supply, announcementDate]);
  const progress = questionnaireProgress(questions, answers);
  const steps = useMemo(() => buildSteps(questions, answers), [questions, answers]);

  // 이어서 하기: 저장된 답을 먼저 넣고, 비어 있는 칸만 프로필 값으로 채운다.
  // 저장된 index(옛 질문 번호)는 쓰지 않는다. 답변을 보고 첫 미완료 카테고리로 들어간다.
  useEffect(() => {
    if (restored.current || !listingId) return;
    restored.current = true;
    const draft = readDraft(listingId, supply);
    const base = draft?.answers ?? {};
    const seeded = buildQuestionnaire({ rules, supply, profile, answers: base, announcementDate, residenceRegion });
    const filled = applyPrefill(seeded, base);
    setAnswers(filled);
    setStepIndex(firstIncompleteStep(buildSteps(seeded, filled)));
  }, [listingId, supply, rules, profile, announcementDate, residenceRegion]);

  useEffect(() => {
    if (restored.current && listingId) writeDraft(listingId, supply, { answers, index: stepIndex });
  }, [answers, stepIndex, listingId, supply]);

  const index = Math.min(stepIndex, Math.max(steps.length - 1, 0));
  const step = steps[index];
  const isLast = index >= steps.length - 1;

  const move = useCallback((next: number) => {
    setStepIndex(Math.max(0, Math.min(next, steps.length - 1)));
    onStepChange?.();
  }, [steps.length, onStepChange]);
  const set = (id: string, value: string) => setAnswers(previous => ({ ...previous, [id]: value }));
  const touch = (id: string) => setTouched(t => ({ ...t, [id]: true }));

  const goNext = () => {
    // 이 단계에 형식 오류가 있으면 넘어가지 않는다. 비워 둔 칸은 그대로 통과시킨다.
    const broken = (step?.questions ?? []).filter(question => errors[question.id]);
    if (broken.length) { setTouched(t => ({ ...t, ...Object.fromEntries(broken.map(q => [q.id, true])) })); return; }
    move(index + 1);
  };
  const finish = () => {
    const update = profileUpdatesFromAnswers(profile, answers, announcementDate ?? new Date().toISOString().slice(0, 10));
    if (update.changed.length) onProfileChange(update.profile);
    clearDraft(listingId, supply);
    onComplete(details, update.profile);
  };

  if (!questions.length) {
    return <View style={styles.wrap}>
      <Text accessibilityRole="header" style={styles.title}>추가로 여쭤볼 내용이 없어요</Text>
      <Text style={styles.body}>저장된 프로필만으로 이 공고의 판정을 계산할 수 있어요.</Text>
      <PrimaryButton label="내 조건으로 판정하기" onPress={finish} />
      <PrimaryButton label="이전으로" variant="soft" onPress={onBack} />
    </View>;
  }

  const unanswered = questions.filter(question => (answers[question.id] ?? '').trim() === '');
  return <View style={styles.wrap}>
    <View style={styles.progressRow}>
      <Text style={styles.step}>{index + 1} / {steps.length} {step.category}</Text>
      <Text style={styles.step}>{progress.answered}개 확인</Text>
    </View>
    <View style={styles.track}><AnimatedBar ratio={progress.ratio} style={styles.fill} /></View>
    <Text style={styles.body}>
      {step.total ? `필요 정보 ${step.total}개 중 ${step.answered}개 입력됨` : `필요 정보 ${progress.total}개 중 ${progress.answered}개 입력됨`}
    </Text>

    <Appear replayKey={step.category} distance={8} style={styles.stack}>
      {step.questions.map(question => (
        <QuestionBlock key={question.id} question={question} answers={answers} bounds={bounds}
          error={touched[question.id] ? errors[question.id] : undefined} onChange={set} onTouch={touch} />
      ))}

      {isLast ? <>
        <Text accessibilityRole="header" style={styles.title}>입력을 마쳤어요</Text>
        <Text style={styles.body}>필요한 정보 {progress.total}개 중 {progress.answered}개를 확인했어요.</Text>
        {steps.filter(other => other.total > 0).map(other => (
          <WanpanCard key={other.category} style={styles.stack}>
            <View style={styles.progressRow}>
              <Text style={styles.strong}>{other.category}</Text>
              <MotionPressable accessibilityRole="button" onPress={() => move(steps.indexOf(other))} style={styles.link}>
                <Text style={styles.linkText}>수정</Text>
              </MotionPressable>
            </View>
            {other.questions.map(question => {
              const label = answerLabel(question, answers, bounds);
              return <View key={question.id} style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{question.title}</Text>
                <Text style={label ? styles.summaryValue : styles.summaryMissing}>{label ?? '미입력 · 결과에서 "확인 필요"로 표시돼요'}</Text>
              </View>;
            })}
          </WanpanCard>
        ))}
        {unanswered.length
          ? <Text style={styles.body}>아직 답하지 않은 질문 {unanswered.length}개가 있어요. 지금도 판정할 수 있고, 답하지 않은 항목은 결과에서 "확인 필요"로 표시돼요.</Text>
          : <Text style={styles.strong}>필요한 정보를 모두 확인했어요</Text>}
      </> : null}
    </Appear>

    {isLast
      ? <PrimaryButton label="내 조건으로 판정하기" onPress={finish} />
      : <PrimaryButton label="다음" onPress={goNext} />}
    <PrimaryButton label="이전" variant="soft" onPress={() => (index === 0 ? onBack() : move(index - 1))} />
    <Text style={styles.saved}>모르는 항목은 비워 두고 넘어가도 돼요. 입력한 내용은 이 기기에 저장돼요.</Text>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md, paddingBottom: spacing.xl },
  stack: { gap: spacing.sm },
  block: { gap: spacing.sm, paddingBottom: spacing.md },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  step: { ...type.bodySm, color: colors.textMuted },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceHigh, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, backgroundColor: colors.primary },
  question: { ...type.page, color: colors.text },
  why: { ...type.bodySm, color: colors.primary },
  body: { ...type.body, color: colors.textMuted },
  strong: { ...type.bodyStrong, color: colors.text },
  title: { ...type.section, color: colors.text },
  prefill: { ...type.bodySm, color: colors.textMuted },
  options: { gap: spacing.sm },
  option: { minHeight: size.touch, borderRadius: radius.button, borderWidth: 1, borderColor: colors.outline, padding: spacing.md, justifyContent: 'center' },
  optionSelected: { backgroundColor: colors.lavender, borderColor: colors.primary },
  optionText: { ...type.body, color: colors.text },
  optionTextSelected: { color: colors.primary },
  input: { ...type.body, color: colors.text, borderWidth: 1, borderColor: colors.outline, borderRadius: radius.button, minHeight: size.control, padding: spacing.md },
  inputError: { borderColor: colors.error },
  hint: { ...type.bodySm, color: colors.textMuted },
  error: { ...type.bodySm, color: colors.error },
  link: { minHeight: size.touch, justifyContent: 'center' },
  linkText: { ...type.bodySmStrong, color: colors.primary },
  summaryRow: { gap: 2 },
  summaryLabel: { ...type.bodySm, color: colors.textMuted },
  summaryValue: { ...type.bodyStrong, color: colors.text },
  summaryMissing: { ...type.bodySm, color: colors.textSubtle },
  saved: { ...type.bodySm, color: colors.textSubtle },
});
