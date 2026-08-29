import { useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MotionPressable } from '../components/motion/MotionPressable';
import { ScreenEnter } from '../components/motion/ScreenEnter';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AICTA } from '../components/AICTA';
import { GradientHero } from '../components/GradientHero';
import { IconChip } from '../components/IconChip';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { StatusPill } from '../components/StatusPill';
import { quizzes } from '../data/quizzes';
import { colors, radius, shadow, spacing, type } from '../design/tokens';
import {
  QUIZ_EXPLAIN_PROMPT,
  XP_PER_QUIZ,
  getPersonalMessage,
  getTodayQuiz,
} from '../domain/quiz';
import { Appear } from '../components/motion/Appear';
import { duration, easing, stagger, useNative } from '../design/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useUserStore } from '../store/useUserStore';

export default function QuizRoute() {
  const router = useRouter();
  const profile = useUserStore((s) => s.profile);
  const completeTodayQuiz = useUserStore((s) => s.completeTodayQuiz);
  const alreadyDone = useUserStore((s) => s.todayQuizDone);

  const [quiz] = useState(() => getTodayQuiz(quizzes));
  const [picked, setPicked] = useState<boolean | null>(null);
  /** 이번 시도로 실제 XP를 받았는지. 이미 받은 날이면 false. */
  const [earnedXp, setEarnedXp] = useState(false);
  const reduced = useReducedMotion();
  const shake = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const xpLift = useRef(new Animated.Value(0)).current;

  const answer = (value: boolean) => {
    setEarnedXp(!alreadyDone);
    setPicked(value);
    completeTodayQuiz();
    if (reduced) return;
    if (value === quiz.answer) {
      // 정답은 check icon 이 살짝 커지며 자리를 잡는다.
      pop.setValue(0);
      Animated.timing(pop, {
        toValue: 1,
        duration: duration.content,
        easing: easing.enter,
        useNativeDriver: useNative,
      }).start();
    } else {
      // 오답은 가로 shake 1회. 빨간 점멸이나 반복 진동은 쓰지 않는다.
      shake.setValue(0);
      Animated.timing(shake, {
        toValue: 1,
        duration: duration.content,
        easing: easing.standard,
        useNativeDriver: useNative,
      }).start();
    }
  };

  useEffect(() => {
    if (picked === null || !earnedXp || reduced) return;
    xpLift.setValue(0);
    // 작은 안내 한 줄이다. major + 지연은 결과를 다 읽고 나서야 뜬다.
    const animation = Animated.timing(xpLift, {
      toValue: 1,
      duration: duration.content,
      delay: stagger.normal,
      easing: easing.enter,
      useNativeDriver: useNative,
    });
    animation.start();
    return () => animation.stop();
  }, [earnedXp, picked, reduced, xpLift]);

  const goHome = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };

  if (picked === null) {
    return (
      <ScreenEnter>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="오늘의 퀴즈" eyebrow="LEARN" onBack={goHome} />
        <View style={styles.screen}>
          <View style={styles.quizMeta}>
            <View style={styles.quizMetaCopy}>
              <StatusPill label="오늘의 한 문제" icon="bolt" />
              <Text style={styles.quizMetaText}>30초면 오늘의 청약 감각이 쌓여요</Text>
            </View>
            <View style={styles.progressRing}>
              <Text style={styles.progressText}>1/1</Text>
            </View>
          </View>

          <View style={styles.questionCard}>
            <View style={styles.questionGlow} />
            <View style={styles.questionTop}>
              <IconChip name="quiz" tone="purple" size="md" />
              <Text style={styles.questionNumber}>QUESTION 01</Text>
            </View>
            <Text style={styles.question}>{quiz.question}</Text>
            <View style={styles.answerHint}>
              <MaterialIcons name="touch-app" size={17} color={colors.primary} />
              <Text style={styles.answerHintText}>직감대로 골라도 괜찮아요</Text>
            </View>
          </View>

          <View style={styles.choiceBlock}>
            <Text style={styles.choiceGuide}>내 답은?</Text>
            <View style={styles.choiceRow}>
              <Choice mark="O" label="맞아요" onPress={() => answer(true)} />
              <Choice mark="X" label="아니에요" onPress={() => answer(false)} />
            </View>
          </View>

          <View style={styles.quizFootnote}>
            <MaterialIcons name="school" size={17} color={colors.textMuted} />
            <Text style={styles.quizFootnoteText}>정답보다 한 가지를 알아가는 게 더 중요해요.</Text>
          </View>
        </View>
      </SafeAreaView>
      </ScreenEnter>
    );
  }

  const correct = picked === quiz.answer;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="오늘의 배움" eyebrow="RESULT" onBack={goHome} />
      <ScrollView contentContainerStyle={styles.resultScreen} showsVerticalScrollIndicator={false}>
        <Animated.View
          style={{
            transform: [
              {
                translateX: shake.interpolate({
                  inputRange: [0, 0.25, 0.5, 0.75, 1],
                  outputRange: [0, -7, 7, -4, 0],
                }),
              },
            ],
          }}
        >
          <GradientHero compact>
          <View style={styles.resultHero}>
            <Animated.View
              style={[
                styles.resultIcon,
                correct && !reduced
                  ? { transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) }] }
                  : null,
              ]}
            >
              <MaterialIcons
                name={correct ? 'check-circle' : 'lightbulb'}
                size={30}
                color={colors.primary}
              />
            </Animated.View>
            <View style={styles.resultCopy}>
              <StatusPill
                label={correct ? '정답이에요' : `정답은 ‘${quiz.answer ? '맞아요' : '아니에요'}’`}
                icon={correct ? 'check-circle' : 'tips-and-updates'}
                inverted
              />
              <Text style={styles.learned}>오늘도 하나 배웠어요</Text>
              <Text style={styles.resultSub}>맞혔는지보다, 이제 알고 있다는 게 중요해요.</Text>
            </View>
          </View>
          </GradientHero>
        </Animated.View>

        <View style={styles.questionRecapCard}>
          <Text style={styles.questionRecapLabel}>오늘의 질문</Text>
          <Text style={styles.questionRecap}>{quiz.question}</Text>
        </View>

        {/* 결과 화면의 핵심. 가장 크고 진하게. */}
        <Appear delay={stagger.short} style={styles.personalCard}>
          <View style={styles.personalTop}>
            <IconChip name="person-pin" tone="purple" size="md" />
            <View style={styles.personalHeading}>
              <Text style={styles.personalEyebrow}>PERSONAL TAKEAWAY</Text>
              <Text style={styles.personalLabel}>그래서 나에게는?</Text>
            </View>
          </View>
          <Text style={styles.personalBody}>{getPersonalMessage(quiz, profile)}</Text>
          <View style={styles.personalFoot}>
            <MaterialIcons name="bookmark-added" size={17} color={colors.primary} />
            <Text style={styles.personalFootText}>오늘 기억해둘 한 가지</Text>
          </View>
        </Appear>

        <Appear delay={stagger.normal} style={styles.explainCard}>
          <View style={styles.explainHeading}>
            <IconChip name="menu-book" tone="amber" />
            <Text style={styles.cardLabel}>왜 그런가요?</Text>
          </View>
          <Text style={styles.cardBody}>{quiz.explanation}</Text>
        </Appear>

        <AICTA
          title="내 상태에 맞춰 더 쉽게"
          description="오늘 배운 내용을 완판e가 내 프로필 기준으로 다시 풀어드려요."
          onPress={() =>
            router.push({
              pathname: '/ai',
              // 문항 텍스트는 질문에 싣지 않는다. quizId 로 AI 화면에서 다시 조립한다.
              params: { q: QUIZ_EXPLAIN_PROMPT, auto: '1', quizId: quiz.id },
            })
          }
        />

        <PrimaryButton label="홈으로 돌아가기" icon="home" onPress={goHome} />

        <View style={styles.xpPill}>
          <MaterialIcons name="stars" size={16} color={colors.warning} />
          <Animated.Text
        style={[
          styles.xpNote,
          earnedXp && !reduced
            ? {
                opacity: xpLift.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
                transform: [
                  { translateY: xpLift.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
                ],
              }
            : null,
        ]}
      >
            {earnedXp
              ? `오늘의 학습 완료 · +${XP_PER_QUIZ} XP`
              : '오늘 XP는 이미 받았어요. 복습은 언제든 환영이에요.'}
          </Animated.Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Choice({ mark, label, onPress }: { mark: string; label: string; onPress: () => void }) {
  return (
    <MotionPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.choice}
    >
      <Text style={styles.choiceMark}>{mark}</Text>
      <Text style={styles.choiceLabel}>{label}</Text>
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, height: '100%', backgroundColor: colors.background },
  screen: {
    flex: 1,
    paddingHorizontal: spacing.screen,
    paddingBottom: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  quizMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  quizMetaCopy: { gap: spacing.xs },
  quizMetaText: { ...type.caption, color: colors.textMuted },
  progressRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 4,
    borderColor: colors.primaryFixed,
  },
  progressText: { ...type.label, color: colors.primary },
  questionCard: {
    flex: 1,
    minHeight: 270,
    justifyContent: 'space-between',
    borderRadius: radius.bento,
    borderWidth: 1,
    borderColor: colors.primaryFixed,
    backgroundColor: colors.lavender,
    padding: spacing.lg,
    overflow: 'hidden',
    ...shadow.card,
  },
  questionGlow: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(83,74,183,0.07)',
    right: -70,
    top: -80,
  },
  questionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  questionNumber: { ...type.label, color: colors.primary },
  question: { ...type.question, color: colors.text },
  answerHint: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  answerHintText: { ...type.caption, color: colors.primary },

  choiceBlock: { gap: spacing.sm },
  choiceGuide: { ...type.label, color: colors.textMuted },
  choiceRow: { flexDirection: 'row', gap: spacing.sm },
  choice: {
    flex: 1,
    minHeight: 112,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.bento,
    borderWidth: 2,
    borderColor: colors.surfaceHighest,
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  choiceMark: { ...type.display, color: colors.primary },
  choiceLabel: { ...type.bodyStrong, color: colors.textMuted },
  quizFootnote: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.xs },
  quizFootnoteText: { ...type.caption, color: colors.textMuted },

  resultScreen: {
    paddingHorizontal: spacing.screen,
    gap: spacing.lg,
    paddingBottom: spacing.xl + spacing.md,
    backgroundColor: colors.background,
  },
  resultHero: {
    minHeight: 156,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  resultIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.onPrimary,
  },
  resultCopy: { flex: 1, gap: spacing.sm },
  learned: { ...type.title, color: colors.onPrimary },
  resultSub: { ...type.caption, color: 'rgba(255,255,255,0.72)' },
  questionRecapCard: {
    gap: spacing.xs,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceLow,
    padding: spacing.md,
  },
  questionRecapLabel: { ...type.caption, color: colors.primary },
  questionRecap: { ...type.body, color: colors.textMuted },

  personalCard: {
    minHeight: 210,
    justifyContent: 'space-between',
    borderRadius: radius.bento,
    backgroundColor: colors.lavender,
    borderWidth: 1,
    borderColor: colors.primaryFixed,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.card,
  },
  personalTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  personalHeading: { gap: 2 },
  personalEyebrow: { ...type.caption, color: colors.primary },
  personalLabel: { ...type.title, color: colors.text },
  personalBody: { ...type.bodyLgStrong, color: colors.text },
  personalFoot: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  personalFootText: { ...type.caption, color: colors.primary },

  explainCard: {
    gap: spacing.md,
    borderRadius: radius.bento,
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  explainHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardLabel: { ...type.cardTitle, color: colors.text },
  cardBody: { ...type.body, color: colors.text },

  xpPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: '#FFF5EC',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  xpNote: { ...type.caption, color: colors.textMuted, textAlign: 'center' },
});
