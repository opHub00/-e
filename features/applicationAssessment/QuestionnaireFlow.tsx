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
import { displayDate, formatDateInput, normalizeDateInput } from './questionnaire/dateInput';
import { applyPrefill, buildQuestionnaire, questionnaireProgress, type Answers, type Question } from './questionnaire/questions';

type Props = {
  rules: AnnouncementRules | undefined;
  supply: SupplyType;
  profile: ApplicantProfileV2;
  listingId: string;
  residenceRegion?: { short: string; profile: string } | null;
  onProfileChange: (profile: ApplicantProfileV2) => void;
  onComplete: (details: AssessmentInput['details'], profile: ApplicantProfileV2) => void;
  onBack: () => void;
  /** 질문이 바뀌면 부모 화면을 맨 위로 올린다. 스크롤 영역은 부모 하나만 둔다. */
  onStepChange?: () => void;
};

/**
 * 한 번에 하나씩 묻는 판정 질문지.
 *
 * 질문 목록과 순서는 questionnaire/questions 가 정한다. 이 화면은 답을 받고, 로컬에 저장하고,
 * 마지막에 기존 판정 입력(details)으로 바꿔 넘길 뿐이다. 규칙 엔진에는 아무 조건도 넣지 않는다.
 */
export function QuestionnaireFlow({ rules, supply, profile, listingId, residenceRegion, onProfileChange, onComplete, onBack, onStepChange }: Props) {
  const announcementDate = rules?.announcementDate ?? null;
  const restored = useRef(false);
  const [answers, setAnswers] = useState<Answers>({});
  const [index, setIndex] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const questions = useMemo(
    () => buildQuestionnaire({ rules, supply, profile, answers, announcementDate, residenceRegion }),
    [rules, supply, profile, answers, announcementDate, residenceRegion],
  );
  const bounds = announcementDate ? { notAfter: announcementDate, notAfterLabel: `공고일(${displayDate(announcementDate)})` } : undefined;
  const { details, errors } = useMemo(() => assessmentDetails(questions, answers, supply, bounds), [questions, answers, supply, announcementDate]);
  const progress = questionnaireProgress(questions, answers);

  // 이어서 하기: 저장된 답을 먼저 넣고, 비어 있는 칸만 프로필 값으로 채운다.
  useEffect(() => {
    if (restored.current || !listingId) return;
    restored.current = true;
    const draft = readDraft(listingId, supply);
    const base = draft?.answers ?? {};
    const seeded = buildQuestionnaire({ rules, supply, profile, answers: base, announcementDate, residenceRegion });
    setAnswers(applyPrefill(seeded, base));
    setIndex(Math.min(draft?.index ?? 0, Math.max(seeded.length - 1, 0)));
  }, [listingId, supply, rules, profile, announcementDate, residenceRegion]);

  useEffect(() => {
    if (restored.current && listingId) writeDraft(listingId, supply, { answers, index });
  }, [answers, index, listingId, supply]);

  const current = questions[Math.min(index, questions.length - 1)];
  const answeredCurrent = (answers[current?.id ?? ''] ?? '').trim() !== '';
  const currentError = current && touched[current.id] ? errors[current.id] : undefined;

  const move = useCallback((next: number) => {
    setIndex(Math.max(0, Math.min(next, questions.length - 1)));
    onStepChange?.();
  }, [questions.length, onStepChange]);
  const set = (id: string, value: string) => setAnswers(previous => ({ ...previous, [id]: value }));
  const goNext = () => {
    if (current && errors[current.id]) { setTouched(t => ({ ...t, [current.id]: true })); return; }
    if (index >= questions.length - 1) { setShowSummary(true); onStepChange?.(); return; }
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

  if (showSummary) {
    const unanswered = questions.filter(question => (answers[question.id] ?? '').trim() === '');
    return <View style={styles.wrap}>
      <Text accessibilityRole="header" style={styles.title}>입력을 마쳤어요</Text>
      <Text style={styles.body}>필요한 정보 {progress.total}개 중 {progress.answered}개를 확인했어요.</Text>
      <View style={styles.track}><AnimatedBar ratio={progress.ratio} style={styles.fill} /></View>
      {unanswered.length ? <WanpanCard style={styles.stack}>
        <Text style={styles.strong}>아직 답하지 않은 질문 {unanswered.length}개</Text>
        <Text style={styles.body}>지금도 판정할 수 있어요. 답하지 않은 항목은 결과에서 "확인 필요"로 표시돼요.</Text>
        {unanswered.slice(0, 5).map(question => (
          <MotionPressable key={question.id} accessibilityRole="button" onPress={() => { setShowSummary(false); move(questions.indexOf(question)); }} style={styles.link}>
            <Text style={styles.linkText}>{question.title}</Text>
          </MotionPressable>
        ))}
      </WanpanCard> : <WanpanCard style={styles.stack}><Text style={styles.strong}>필요한 정보를 모두 확인했어요</Text></WanpanCard>}
      <PrimaryButton label="내 조건으로 판정하기" onPress={finish} />
      <PrimaryButton label="답변 다시 보기" variant="soft" onPress={() => { setShowSummary(false); move(questions.length - 1); }} />
    </View>;
  }

  return <View style={styles.wrap}>
    <View style={styles.progressRow}>
      <Text style={styles.step}>{current.section} · {index + 1} / {questions.length}</Text>
      <Text style={styles.step}>{progress.answered}개 확인</Text>
    </View>
    <View style={styles.track}><AnimatedBar ratio={progress.ratio} style={styles.fill} /></View>
    <Appear replayKey={current.id} distance={8} style={styles.stack}>
      <Text accessibilityRole="header" style={styles.question}>{current.title}</Text>
      {current.why ? <Text style={styles.why}>{current.why}</Text> : null}
      {current.help ? <Text style={styles.body}>{current.help}</Text> : null}
      {current.prefill && answers[current.id] === current.prefill.value
        ? <Text style={styles.prefill}>{current.prefill.source}에서 가져왔어요. 다르면 고쳐 주세요.</Text> : null}

      {current.kind === 'boolean' || current.kind === 'choice' ? (
        <View style={styles.options}>
          {(current.options ?? []).map(option => (
            <MotionPressable key={option.value || 'unknown'} accessibilityRole="radio" accessibilityState={{ checked: (answers[current.id] ?? '') === option.value }}
              onPress={() => { set(current.id, option.value); setTouched(t => ({ ...t, [current.id]: true })); }}
              style={[styles.option, (answers[current.id] ?? '') === option.value && styles.optionSelected]}>
              <Text style={[styles.optionText, (answers[current.id] ?? '') === option.value && styles.optionTextSelected]}>{option.label}</Text>
            </MotionPressable>
          ))}
        </View>
      ) : (
        <>
          <TextInput
            accessibilityLabel={current.title}
            value={answers[current.id] ?? ''}
            onChangeText={value => set(current.id, current.kind === 'date' ? formatDateInput(value) : value)}
            onBlur={() => setTouched(t => ({ ...t, [current.id]: true }))}
            placeholder={current.kind === 'date' ? '예: 19940705' : current.kind === 'dateList' ? '예: 20220510, 20240103 (없으면 없음)' : current.kind === 'money' ? '원 단위 · 예: 7000000' : '숫자만 입력'}
            placeholderTextColor={colors.textSubtle}
            keyboardType={current.kind === 'money' || current.kind === 'number' || current.kind === 'date' ? 'number-pad' : 'default'}
            inputMode={current.kind === 'dateList' ? 'text' : 'numeric'}
            style={[styles.input, currentError ? styles.inputError : null]}
          />
          {current.kind === 'money' && koreanMoneyHint(answers[current.id]) ? <Text style={styles.hint}>입력한 금액: {koreanMoneyHint(answers[current.id])}</Text> : null}
          {current.kind === 'date' && !currentError && normalizeDateInput(answers[current.id], bounds).status === 'OK'
            ? <Text style={styles.hint}>{displayDate(normalizeDateInput(answers[current.id], bounds).status === 'OK' ? (normalizeDateInput(answers[current.id], bounds) as { value: string }).value : '')}로 확인했어요</Text> : null}
        </>
      )}
      {currentError ? <Text accessibilityRole="alert" style={styles.error}>{currentError}</Text> : null}
    </Appear>

    <PrimaryButton label={index >= questions.length - 1 ? '입력 마치기' : '다음'} onPress={goNext} />
    {!answeredCurrent ? <PrimaryButton label="지금은 모르겠어요 · 건너뛰기" variant="soft" onPress={() => (index >= questions.length - 1 ? setShowSummary(true) : move(index + 1))} /> : null}
    <PrimaryButton label="이전" variant="soft" onPress={() => (index === 0 ? onBack() : move(index - 1))} />
    <Text style={styles.saved}>입력한 내용은 이 기기에 저장돼요. 나갔다가 돌아와도 이어서 답할 수 있어요.</Text>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md, paddingBottom: spacing.xl },
  stack: { gap: spacing.sm },
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
  saved: { ...type.bodySm, color: colors.textSubtle },
});
