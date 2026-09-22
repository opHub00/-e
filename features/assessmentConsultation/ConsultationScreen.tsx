import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenHeader } from '../../components/ScreenHeader';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { colors, radius, size, spacing, type } from '../../design/tokens';
import { ConsultationResultCard } from './ConsultationResultCard';
import {
  SOURCE_BADGE, SOURCE_FIRST_TURN_NOTE,
  type ConsultationAction, type ConsultationEngine, type ConsultationQuestion, type ConsultationSession, type ConsultationTurn,
} from './contract';
import type { Evidence } from '../applicationAssessment/types';
import { SUPPLY_LABELS } from '../applicationAssessment/labels';

type Props = {
  engine: ConsultationEngine;
  listingId: string;
  seededFrom?: 'ASSESSMENT_RESULT';
  onOpenAssessment: () => void;
  onOpenProfile: () => void;
  onOpenPreparation: () => void;
  onBack: () => void;
};

export function ConsultationScreen({ engine, listingId, seededFrom, onOpenAssessment, onOpenProfile, onOpenPreparation, onBack }: Props) {
  const [session, setSession] = useState<ConsultationSession | null>(null);
  const [pending, setPending] = useState<ConsultationTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    let live = true;
    void engine.start({ listingId, seededFrom }).then(value => { if (live) setSession(value); });
    return () => { live = false; };
  }, [engine, listingId, seededFrom]);

  const turns = session ? [...session.turns, ...pending] : [];
  const last = [...turns].reverse().find(t => t.role === 'assistant');
  const activeSupplyType = last?.activeSupplyType ?? session?.activeSupplyType;
  const answerQuestion = last?.suggestedQuestions?.find(question => question.interaction === 'ANSWER' && !question.options?.length);

  const send = useCallback(async (text: string, answering?: { questionKey: string; value: string }) => {
    const trimmed = text.trim();
    if (!trimmed || !session || busy) return;
    setBusy(true); setInput('');
    const asked: ConsultationTurn = { id: `user-${Date.now()}`, role: 'user', message: trimmed };
    setPending(current => [...current, asked]);
    const answer = await engine.ask({ session, message: trimmed, answering });
    setPending(current => [...current, answer]);
    setBusy(false);
  }, [busy, engine, session]);

  const act = (action: ConsultationAction) => {
    if (action.kind === 'OPEN_ASSESSMENT') return onOpenAssessment();
    if (action.kind === 'OPEN_PROFILE') return onOpenProfile();
    if (action.kind === 'OPEN_PREPARATION') return onOpenPreparation();
    void send(action.label, { questionKey: action.questionKey, value: action.value });
  };

  const sourceStatus = session?.sourceStatus ?? 'REFERENCE';
  const note = SOURCE_FIRST_TURN_NOTE[sourceStatus];

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="AI 청약 상담" onBack={onBack} />
      {/* 어떤 공고를 근거로 답하는지와 그 문서의 상태를 대화 내내 고정해 둔다. */}
      <View style={styles.contextBar}>
        <View style={styles.contextCopy}>
          <Text style={styles.contextTitle} numberOfLines={1}>{session?.announcementTitle ?? '공고를 불러오는 중이에요'}</Text>
          {activeSupplyType ? <Text style={styles.contextSupply}>{SUPPLY_LABELS[activeSupplyType]} 상담</Text> : null}
        </View>
        <View style={styles.badge}><Text style={styles.badgeText}>{SOURCE_BADGE[sourceStatus]}</Text></View>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
        <ScrollView
          ref={scroll} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        >
          {/* 검토본 안내는 대화마다 반복하지 않고 시작할 때 한 번만 말한다. */}
          {note ? <Text style={styles.sourceNote}>{note}</Text> : null}
          {turns.map(t => t.role === 'user'
            ? <View key={t.id} style={styles.userRow}><Text style={styles.userBubble}>{t.message}</Text></View>
            : <AssistantTurn key={t.id} turn={t} onAct={act} />)}
          {busy ? <Text style={styles.thinking}>답변을 준비하고 있어요…</Text> : null}
        </ScrollView>

        <View style={styles.composerShell}>
          {/* 추천 질문은 입력창 바로 위에 둔다. 키보드가 올라와도 같이 따라 올라온다. */}
          {last?.suggestedQuestions?.length ? (
            <View style={styles.chips}>
              {last.suggestedQuestions.slice(0, 3).map(q => <QuestionChips key={q.key} question={q} disabled={busy} onSend={send} onFocus={() => inputRef.current?.focus()} />)}
            </View>
          ) : null}
          <View style={styles.composer}>
            <TextInput
              ref={inputRef}
              accessibilityLabel="상담 질문 입력"
              style={styles.input} value={input} onChangeText={setInput} multiline maxLength={500}
              placeholder={answerQuestion?.prompt ?? '이 공고에 대해 물어보세요'} placeholderTextColor={colors.outline}
              editable={!busy} onSubmitEditing={() => void send(input)}
            />
            <MotionPressable
              accessibilityRole="button" accessibilityLabel="질문 보내기"
              accessibilityState={{ disabled: busy || !input.trim() }} disabled={busy || !input.trim()}
              onPress={() => void send(input)} style={[styles.send, (busy || !input.trim()) && styles.sendOff]}
            >
              <MaterialIcons name="arrow-upward" size={22} color={colors.onPrimary} />
            </MotionPressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** A question becomes taps when the engine supplies options, and a prompt chip otherwise. */
function QuestionChips({ question, disabled, onSend, onFocus }: { question: ConsultationQuestion; disabled: boolean; onSend: (text: string, answering?: { questionKey: string; value: string }) => void; onFocus: () => void }) {
  if (question.interaction === 'ASK') {
    return <Chip label={question.prompt} disabled={disabled} onPress={() => onSend(question.prompt)} />;
  }
  if (!question.options?.length) {
    return (
      <View style={styles.questionBlock}>
        <Text style={styles.questionPrompt}>{question.prompt}</Text>
        <MotionPressable accessibilityRole="button" disabled={disabled} onPress={onFocus} style={styles.answerFocus}>
          <Text style={styles.answerFocusText}>답변 입력</Text>
        </MotionPressable>
      </View>
    );
  }
  return (
    <View style={styles.questionBlock}>
      <Text style={styles.questionPrompt}>{question.prompt}</Text>
      <View style={styles.chipRow}>
        {question.options.map(o => (
          <Chip key={o.value} label={o.label} disabled={disabled} onPress={() => onSend(o.label, { questionKey: question.key, value: o.value })} />
        ))}
      </View>
    </View>
  );
}

function Chip({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return (
    <MotionPressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </MotionPressable>
  );
}

function AssistantTurn({ turn, onAct }: { turn: ConsultationTurn; onAct: (action: ConsultationAction) => void }) {
  return (
    <View style={styles.turn}>
      {/* 결론 카드를 문장보다 먼저 둔다. 상담사가 고객과 볼 때 답이 맨 위에 있어야 한다. */}
      {turn.assessment ? <ConsultationResultCard assessment={turn.assessment} /> : null}
      <Text style={styles.message}>{turn.message}</Text>
      {turn.reusedProfileFacts?.length ? <ProfileFactsDisclosure facts={turn.reusedProfileFacts} /> : null}
      {/* 모른다는 답을 오류처럼 보이지 않게 한다. 확인이 필요한 항목으로 말한다. */}
      {turn.unresolved?.length ? (
        <View style={styles.unresolved}>
          <Text style={styles.unresolvedTitle}>공고 기준을 추가로 확인해야 하는 항목</Text>
          {turn.unresolved.map(item => <Text key={item} style={styles.unresolvedItem}>• {item}</Text>)}
        </View>
      ) : null}
      {turn.evidenceRefs?.length ? <EvidenceDisclosure evidence={turn.evidenceRefs} /> : null}
      {turn.actions?.length ? (
        <View style={styles.actions}>
          {turn.actions.map(a => (
            <MotionPressable key={a.label} accessibilityRole="button" onPress={() => onAct(a)} style={styles.action}>
              <Text style={styles.actionText}>{a.label}</Text>
            </MotionPressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ProfileFactsDisclosure({ facts }: { facts: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.reused}>
      <MotionPressable accessibilityRole="button" accessibilityState={{ expanded: open }} aria-expanded={open} onPress={() => setOpen(value => !value)} style={styles.profileToggle}>
        <MaterialIcons name="person-outline" size={15} color={colors.textMuted} />
        <Text style={styles.reusedText}>사용 중인 내 정보 {open ? '접기' : '보기'}</Text>
      </MotionPressable>
      {open ? facts.map(fact => <Text key={fact} style={styles.profileFact}>• {fact}</Text>) : null}
    </View>
  );
}

/** 근거는 대화에 길게 쏟지 않는다. 열어야 원문이 나오고, 내부 ID는 그 안에서만 보인다. */
function EvidenceDisclosure({ evidence }: { evidence: Evidence[] }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.evidence}>
      <MotionPressable
        accessibilityRole="button" accessibilityState={{ expanded: open }} aria-expanded={open}
        onPress={() => setOpen(v => !v)} style={styles.toggle}
      >
        <Text style={styles.toggleText}>공고 근거 {evidence.length}건 {open ? '접기' : '보기'}</Text>
      </MotionPressable>
      {open ? evidence.map(e => (
        <View key={e.id} style={styles.evidenceItem}>
          <Text style={styles.evidenceLabel}>{e.label}</Text>
          <Text style={styles.evidenceWhere}>{[e.source, e.section, e.tableLabel].filter(Boolean).join(' · ')}</Text>
          {e.textExcerpt ? <Text selectable style={styles.excerpt}>{e.textExcerpt}</Text> : null}
        </View>
      )) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 },
  contextBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.screen, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.surfaceHigh },
  contextCopy: { flex: 1, gap: 2 },
  contextTitle: { ...type.bodyStrong, color: colors.text },
  contextSupply: { ...type.caption, color: colors.textMuted },
  badge: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { ...type.caption, color: colors.primary },
  scroll: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: spacing.screen, paddingBottom: spacing.lg, gap: spacing.md },
  sourceNote: { ...type.bodySm, color: colors.textMuted },
  userRow: { alignItems: 'flex-end' },
  userBubble: { ...type.body, color: colors.onPrimary, backgroundColor: colors.primary, borderRadius: radius.card, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, maxWidth: '88%', overflow: 'hidden' },
  turn: { gap: spacing.sm },
  message: { ...type.body, color: colors.text },
  reused: { gap: spacing.xs, alignItems: 'flex-start' },
  profileToggle: { minHeight: size.touch, flexDirection: 'row', gap: spacing.xs, alignItems: 'center' },
  reusedText: { ...type.bodySm, color: colors.textMuted, flex: 1 },
  profileFact: { ...type.bodySm, color: colors.textMuted, paddingLeft: spacing.sm },
  unresolved: { backgroundColor: colors.surfaceLow, borderRadius: radius.cardSm, padding: spacing.sm, gap: spacing.xs },
  unresolvedTitle: { ...type.bodySmStrong, color: colors.text },
  unresolvedItem: { ...type.bodySm, color: colors.textMuted },
  evidence: { gap: spacing.xs },
  toggle: { minHeight: size.touch, justifyContent: 'center' },
  toggleText: { ...type.bodyStrong, color: colors.primary },
  evidenceItem: { gap: 2, paddingBottom: spacing.sm },
  evidenceLabel: { ...type.bodyStrong, color: colors.text },
  evidenceWhere: { ...type.bodySm, color: colors.textMuted },
  excerpt: { ...type.bodySm, color: colors.textMuted, borderLeftWidth: 2, borderLeftColor: colors.outline, paddingLeft: spacing.sm, marginTop: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: { minHeight: size.touch, justifyContent: 'center', borderRadius: radius.button, borderWidth: 1, borderColor: colors.primary, paddingHorizontal: spacing.md },
  actionText: { ...type.bodyStrong, color: colors.primary },
  thinking: { ...type.bodySm, color: colors.textMuted },
  composerShell: { borderTopWidth: 1, borderTopColor: colors.surfaceHigh, backgroundColor: colors.surface, padding: spacing.sm, gap: spacing.sm },
  chips: { gap: spacing.sm, width: '100%', maxWidth: 720, alignSelf: 'center' },
  questionBlock: { gap: spacing.xs },
  questionPrompt: { ...type.bodySm, color: colors.textMuted },
  answerFocus: { alignSelf: 'flex-start', minHeight: size.touch, justifyContent: 'center' },
  answerFocusText: { ...type.bodySmStrong, color: colors.primary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: size.touch, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface, paddingHorizontal: spacing.md },
  chipText: { ...type.bodySm, color: colors.text },
  composer: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end', width: '100%', maxWidth: 720, alignSelf: 'center' },
  input: { ...type.body, color: colors.text, flex: 1, borderWidth: 1, borderColor: colors.surfaceHigh, borderRadius: radius.card, minHeight: size.control, maxHeight: 120, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  send: { width: size.touch, height: size.touch, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.4 },
});
