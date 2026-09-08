import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { BrandMark } from '../../components/BrandMark';
import { IconChip } from '../../components/IconChip';
import { quizzes } from '../../data/quizzes';
import { colors, radius, shadow, size, spacing, tracking, type } from '../../design/tokens';
import { duration, easing, useNative } from '../../design/motion';
import {
  buildAiContext,
  formatContextForPrompt,
  getSuggestedQuestions,
} from '../../domain/aiContext';
import {
  buildFutureAiContext,
  formatFutureAiContextForPrompt,
} from '../../domain/futureAiContext';
import { parseFutureScenario } from '../../domain/futureSimulation';
import { hasCoreProfileForCalculations } from '../../features/profile/domain';
import { getPersonalMessage } from '../../domain/quiz';
import { Appear } from '../../components/motion/Appear';
import { useUserStore } from '../../store/useUserStore';
import {
  parseListingFitExplanationContext,
  type ListingFitExplanationContext,
} from '../../features/listingFit/ai';
import {
  AI_REQUEST_TIMEOUT_MS,
  buildAiRequestPayload,
  buildAiRequestHistory,
  canStartAiRequest,
  getAiErrorMessage,
  getAiLoadingMode,
  type AiTurn,
} from '../../features/ai/requestUx';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

type Turn = AiTurn;

/** 앱이 만들어 보내는 학습 콘텐츠. 사용자 자유 입력이 아니라 자격 필터를 거치지 않는다. */
type Lesson = { question: string; answer: boolean; explanation: string; personal: string };

async function askAi(
  question: string,
  context: string,
  history: Turn[],
  lesson: Lesson | null,
  listingFit: ListingFitExplanationContext | null,
): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'AI 연결이 아직 설정되지 않았어요. .env 에 EXPO_PUBLIC_SUPABASE_URL 과 EXPO_PUBLIC_SUPABASE_ANON_KEY 를 넣어주세요.',
    );
  }

  // AbortSignal.timeout 은 Hermes 에 없을 수 있어 controller 로 직접 건다.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/ai`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(buildAiRequestPayload(question, context, history, lesson, listingFit)),
      signal: controller.signal,
    });
  } catch (e) {
    throw new Error(getAiErrorMessage(null, controller.signal.aborted));
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => ({}) as { answer?: string; error?: string });
  if (!res.ok || !data.answer) {
    throw new Error(getAiErrorMessage(res.status));
  }
  return data.answer;
}

export default function AiRoute() {
  const { q, auto, quizId, futureScenario, listingFit: listingFitParam } = useLocalSearchParams<{
    q?: string;
    auto?: string;
    quizId?: string;
    futureScenario?: string;
    listingFit?: string;
  }>();
  const profile = useUserStore((s) => s.profile);
  const applicantProfile = useUserStore((s) => s.applicantProfile);

  const ctx = buildAiContext(profile, applicantProfile);
  const suggestions = getSuggestedQuestions(ctx);
  const selectedFutureScenario = parseFutureScenario(profile, futureScenario);
  const listingFit = useMemo(
    () => parseListingFitExplanationContext(listingFitParam),
    [listingFitParam],
  );
  const promptContext = listingFit
    ? '공고별 개인 적합도 설명 요청이에요. 아래 structured result에 없는 사용자 정보를 추측하지 마세요.'
    : selectedFutureScenario && hasCoreProfileForCalculations(applicantProfile)
      ? `${formatContextForPrompt(ctx)}\n\n${formatFutureAiContextForPrompt(
          buildFutureAiContext(profile, selectedFutureScenario),
        )}`
      : formatContextForPrompt(ctx);

  // Quiz 결과에서 넘어온 경우에만 학습 콘텐츠를 함께 보낸다.
  const quiz = quizId ? quizzes.find((item) => item.id === quizId) : undefined;
  const lesson: Lesson | null = quiz
    ? {
        question: quiz.question,
        answer: quiz.answer,
        explanation: quiz.explanation,
        personal: getPersonalMessage(quiz, profile),
      }
    : null;

  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState(q ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const inFlightRef = useRef(false);

  const send = useCallback(
    /** baseTurns 를 주면 그 시점의 대화로 되감아 보낸다 (재시도용). */
    async (question: string, baseTurns?: Turn[]) => {
      const trimmed = question.trim();
      if (!canStartAiRequest(trimmed, inFlightRef.current)) return;
      inFlightRef.current = true;

      setInput('');
      setError(null);
      setLoading(true);
      // history 는 이번 질문을 뺀 지난 대화만 넘긴다.
      const visibleTurns = baseTurns ?? turns;
      const history = buildAiRequestHistory(visibleTurns);
      setTurns([...visibleTurns, { role: 'user', text: trimmed }]);

      try {
        const answer = await askAi(trimmed, promptContext, history, lesson, listingFit);
        setTurns([...visibleTurns, { role: 'user', text: trimmed }, { role: 'model', text: answer }]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'AI 연결에 실패했어요.');
      } finally {
        inFlightRef.current = false;
        setLoading(false);
      }
    },
    [lesson, listingFit, promptContext, turns],
  );

  // 각 화면의 contextual CTA 는 질문을 들고 들어와 바로 전송한다.
  const autoSent = useRef(false);
  useEffect(() => {
    if (auto === '1' && q && !autoSent.current) {
      autoSent.current = true;
      void send(q);
    }
  }, [auto, q, send]);

  const retry = () => {
    const lastIndex = turns.map((t) => t.role).lastIndexOf('user');
    if (lastIndex < 0) return;
    // 실패한 질문을 대화에서 빼고 그 이전 대화만 history 로 다시 보낸다.
    void send(turns[lastIndex].text, turns.slice(0, lastIndex));
  };

  return (
    <View style={styles.safe}>
      <View style={[styles.coachBar, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
        <BrandMark size={24} />
        <View style={styles.coachCopy}>
          <Text style={styles.coachName}>완판e 코치</Text>
          <Text style={styles.coachCtx} numberOfLines={1}>
            {profile.name}님 · 준비도 {ctx.score} · {ctx.stage.label}
          </Text>
        </View>
        {turns.length > 0 ? (
          <MotionPressable
            accessibilityRole="button"
            accessibilityLabel="대화 지우기"
            accessibilityState={{ disabled: loading }}
            disabled={loading}
            onPress={() => setTurns([])}
            style={styles.coachAction}
          >
            <MaterialIcons name="refresh" size={17} color={colors.textMuted} />
          </MotionPressable>
        ) : (
          <View style={styles.coachBadge}>
            <MaterialIcons name="verified-user" size={13} color={colors.primary} />
            <Text style={styles.coachBadgeText}>내 상태 기반</Text>
          </View>
        )}
      </View>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {turns.length === 0 && !loading ? (
            <Appear replayKey="ai-empty" style={styles.suggestBlock}>
              <View style={styles.sectionHeading}>
                <Text style={styles.suggestLabel}>지금 이런 설명이 도움 돼요</Text>
              </View>
              {suggestions.map((s, index) => (
                <MotionPressable
                  key={s}
                  accessibilityRole="button"
                  onPress={() => void send(s)}
                  style={[
                    styles.suggestChip,
                    index === 0 && styles.suggestChipPrimary,
                  ]}
                >
                  <View style={[styles.suggestNumber, index === 0 && styles.suggestNumberPrimary]}>
                    <Text style={[styles.suggestNumberText, index === 0 && styles.suggestNumberTextPrimary]}>
                      {String(index + 1).padStart(2, '0')}
                    </Text>
                  </View>
                  <Text style={styles.suggestText}>{s}</Text>
                  <MaterialIcons name="arrow-forward" size={19} color={colors.primary} />
                </MotionPressable>
              ))}
            </Appear>
          ) : null}

          {turns.map((t, i) =>
            t.role === 'user' ? (
              <View key={`${i}-q`} style={styles.questionWrap}>
                <Text style={styles.turnEyebrow}>내 질문</Text>
                <View style={styles.question}>
                  <Text style={styles.questionText}>{t.text}</Text>
                </View>
              </View>
            ) : (
              <Appear key={`${i}-a`} style={styles.answer}>
                <View style={styles.answerHeading}>
                  <IconChip name="auto-awesome" tone="purple" />
                  <Text style={styles.answerLabel}>완판e의 설명</Text>
                </View>
                <View style={styles.answerBody}>
                  <Text style={styles.answerText}>{t.text}</Text>
                </View>
              </Appear>
            ),
          )}

          {loading ? (
            <Appear distance={0} style={styles.loadingCard}>
              <View style={styles.loadingIcon}><AiThinkingIndicator /></View>
              <View style={styles.loadingCopy}>
                <Text style={styles.loadingTitle}>답변을 정리하고 있어요</Text>
                <Text style={styles.loadingText} numberOfLines={2}>
                  현재 확인된 정보 안에서 쉽게 설명할게요.
                </Text>
              </View>
            </Appear>
          ) : null}

          {error ? (
            <Appear replayKey="ai-error" distance={0}>
              <View style={styles.errorCard}>
                <View style={styles.errorHeading}>
                  <IconChip name="cloud-off" tone="pink" />
                  <Text style={styles.errorTitle}>답변을 가져오지 못했어요</Text>
                </View>
                <Text style={styles.errorBody}>{error}</Text>
                {turns.some((t) => t.role === 'user') ? (
                  <MotionPressable
                    accessibilityRole="button"
                    onPress={retry}
                    style={styles.retry}
                  >
                    <MaterialIcons name="refresh" size={18} color={colors.primary} />
                    <Text style={styles.retryText}>다시 시도하기</Text>
                  </MotionPressable>
                ) : null}
              </View>
            </Appear>
          ) : null}

          <View style={styles.disclaimerCard}>
            <MaterialIcons name="verified-user" size={17} color={colors.textMuted} />
            <Text style={styles.disclaimer}>
              AI 답변은 청약 자격 판정을 대신하지 않아요. 실제 신청 전에는 공식 공고 기준을 꼭
              확인해 주세요.
            </Text>
          </View>
        </ScrollView>

        <View style={styles.composerShell}>
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="내 상태에서 궁금한 걸 물어보세요"
              placeholderTextColor={colors.outline}
              multiline
              maxLength={500}
              onSubmitEditing={() => void send(input)}
              editable={!loading}
            />
            <MotionPressable
              accessibilityRole="button"
              accessibilityLabel="질문 보내기"
              accessibilityState={{ disabled: loading || !input.trim() }}
              disabled={loading || !input.trim()}
              onPress={() => void send(input)}
              style={[
                styles.sendButton,
                (loading || !input.trim()) && styles.sendDisabled,
              ]}
            >
              <MaterialIcons name="arrow-upward" size={22} color={colors.onPrimary} />
            </MotionPressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function AiThinkingIndicator() {
  const reducedMotion = useReducedMotion();
  const mode = getAiLoadingMode(reducedMotion);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (mode === 'static') {
      progress.setValue(0);
      return;
    }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(progress, { toValue: 1, duration: duration.content, easing: easing.enter, useNativeDriver: useNative }),
      Animated.timing(progress, { toValue: 0, duration: duration.content, easing: easing.standard, useNativeDriver: useNative }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [mode, progress]);

  const animatedOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });
  return (
    <View accessibilityLabel="AI 답변 생성 중" style={styles.thinkingDots}>
      {[0, 1, 2].map((index) => (
        <Animated.View
          key={index}
          style={[styles.thinkingDot, mode === 'animated' && index === 1 ? { opacity: animatedOpacity } : null]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, height: '100%', backgroundColor: colors.background },
  flex: { flex: 1 },
  coachBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: spacing.screen,
    paddingBottom: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  coachCopy: { flex: 1, gap: 1 },
  coachName: { ...type.bodySmStrong, color: colors.text, letterSpacing: tracking.normal },
  coachCtx: { ...type.micro, color: colors.textSubtle },
  coachAction: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainer,
  },
  coachBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.lavender,
    paddingHorizontal: 9,
  },
  coachBadgeText: { ...type.micro, color: colors.primary },
  scroll: { paddingHorizontal: spacing.screen, gap: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.lg },


  suggestBlock: { flex: 1, gap: spacing.sm },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  suggestLabel: { ...type.bodyLgStrong, color: colors.text, letterSpacing: tracking.snug },
  suggestChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 68,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
    backgroundColor: colors.surface,
    padding: 12,
    ...shadow.card,
  },
  suggestChipPrimary: { backgroundColor: colors.lavender, borderColor: colors.primaryFixed },
  suggestNumber: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLow,
  },
  suggestNumberPrimary: { backgroundColor: colors.surface },
  suggestNumberText: { ...type.label, color: colors.textMuted },
  suggestNumberTextPrimary: { color: colors.primary },
  suggestText: { ...type.bodyStrong, color: colors.text, flex: 1 },

  questionWrap: { alignItems: 'flex-end', gap: spacing.xs },
  turnEyebrow: { ...type.caption, color: colors.textMuted, paddingRight: spacing.xs },
  question: {
    maxWidth: '88%',
    borderRadius: radius.card,
    borderTopRightRadius: 4,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
  },
  questionText: { ...type.body, color: colors.onPrimary },

  answer: {
    borderRadius: radius.bento,
    backgroundColor: colors.lavender,
    borderWidth: 1,
    borderColor: colors.primaryFixed,
    padding: spacing.md,
    gap: spacing.md,
    ...shadow.card,
  },
  answerHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  answerLabel: { ...type.cardTitle, color: colors.text },
  answerBody: {
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
    padding: spacing.md,
  },
  answerText: { ...type.body, color: colors.text },
  loadingCard: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.bento,
    backgroundColor: colors.lavender,
    borderWidth: 1,
    borderColor: colors.primaryFixed,
    padding: spacing.md,
  },
  loadingIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  thinkingDots: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  thinkingDot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.primary, opacity: 0.45 },
  loadingCopy: { flex: 1, gap: 2 },
  loadingTitle: { ...type.bodyStrong, color: colors.text },
  loadingText: { ...type.body, color: colors.textMuted, flex: 1 },

  errorCard: {
    borderRadius: radius.bento,
    borderWidth: 1,
    borderColor: '#F4C7C3',
    backgroundColor: '#FFF6F5',
    padding: spacing.md,
    gap: spacing.sm,
  },
  errorHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  errorTitle: { ...type.bodyStrong, color: colors.error },
  errorBody: { ...type.body, color: colors.textMuted },
  retry: {
    alignSelf: 'flex-start',
    minHeight: size.touch,
    justifyContent: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.button,
    backgroundColor: colors.lavender,
  },
  retryText: { ...type.bodyStrong, color: colors.primary },

  disclaimerCard: {
    marginTop: 'auto',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radius.cardSm,
    backgroundColor: colors.surfaceLow,
    padding: 12,
  },
  disclaimer: { ...type.caption, color: colors.textMuted, flex: 1 },

  composerShell: {
    gap: spacing.xs,
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceHigh,
    backgroundColor: colors.surface,
    ...shadow.floating,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.surfaceHighest,
    backgroundColor: colors.surfaceLow,
    padding: 5,
    paddingLeft: spacing.md,
  },
  input: {
    ...type.body,
    flex: 1,
    minHeight: size.touch,
    maxHeight: size.inputMax,
    paddingTop: 10,
    paddingBottom: 10,
    color: colors.text,
  },
  sendButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.cardSm,
    backgroundColor: colors.primary,
  },
  sendDisabled: { opacity: 0.4 },
});
