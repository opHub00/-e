import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import type { AdaptiveQuestion } from '../../features/eventKiosk/adaptiveAssessment';
import type { AdaptiveInfo } from '../../features/eventKiosk/model';
import { kioskEvent } from '../../features/eventKiosk/kioskEvent';
import { useKioskStore } from '../../features/eventKiosk/useKioskStore';
import { ChoiceGroup, KioskButton, Notice, NumberInput, Question, Section, UnknownToggle, YesNoUnknown } from '../../features/eventKiosk/ui/controls';
import { KioskFrame } from '../../features/eventKiosk/ui/KioskFrame';
import { k } from '../../features/eventKiosk/ui/theme';
import { Appear } from '../../components/motion/Appear';
import { travel } from '../../design/motion';
import { eventMotion } from '../../features/eventKiosk/motion/eventMotion';
import { StaggerList } from '../../features/eventKiosk/motion/StaggerList';
import { doesNotKnowLabel } from '../../features/eventKiosk/questionPolicy';
import { SAMDO_EVENT } from '../../features/eventKiosk/samdoEventScope';

function AdaptiveControl({ question }: { question: AdaptiveQuestion }) {
  const value = useKioskStore(state => state.answers.adaptive[question.id]);
  const answered = useKioskStore(state => state.answered.includes(`adaptive.${question.id}`));
  const unknown = useKioskStore(state => state.answerStates[`adaptive.${question.id}`] === 'DOES_NOT_KNOW');
  const patch = useKioskStore(state => state.patchAdaptive);
  const markAnswered = useKioskStore(state => state.markAnswered);
  const markDoesNotKnow = useKioskStore(state => state.markDoesNotKnow);
  const clearAnswerState = useKioskStore(state => state.clearAnswerState);
  const update = (next: AdaptiveInfo[typeof question.id]) => {
    if (next === null) markDoesNotKnow(`adaptive.${question.id}`);
    else markAnswered(`adaptive.${question.id}`);
    patch({ [question.id]: next } as Partial<AdaptiveInfo>);
  };

  if (question.kind === 'BOOLEAN') {
    return (
      <YesNoUnknown
        testID={`q-adaptive-${question.id}`}
        value={value as boolean | null}
        answered={answered}
        unknown={doesNotKnowLabel(`adaptive.${question.id}`)}
        onChange={next => update(next)}
      />
    );
  }
  if (question.kind === 'SELECT') {
    return (
      <ChoiceGroup
        testID={`q-adaptive-${question.id}`}
        columns={2}
        choices={(question.options ?? []).map(option => ({ ...option }))}
        value={answered || value !== null ? value as string | null : undefined}
        onChange={next => update(next as AdaptiveInfo[typeof question.id])}
      />
    );
  }
  return (
    <View style={styles.numberControl}>
      <NumberInput
        testID={`input-adaptive-${question.id}`}
        accessibilityLabel={question.title}
        value={value as number | null}
        onChange={next => {
          if (next !== null) markAnswered(`adaptive.${question.id}`);
          else clearAnswerState(`adaptive.${question.id}`);
          patch({ [question.id]: next } as Partial<AdaptiveInfo>);
        }}
        unit={question.unit ?? ''}
        unitScale={question.unitScale}
        placeholder="숫자로 입력"
      />
      <UnknownToggle
        testID={`unknown-adaptive-${question.id}`}
        label={doesNotKnowLabel(`adaptive.${question.id}`)}
        active={unknown}
        onPress={() => {
          if (unknown) clearAnswerState(`adaptive.${question.id}`);
          else markDoesNotKnow(`adaptive.${question.id}`);
          patch({ [question.id]: null } as Partial<AdaptiveInfo>);
        }}
      />
    </View>
  );
}

export default function AdaptiveAssessmentScreen() {
  const load = kioskEvent();
  const plan = useKioskStore(state => state.adaptivePlan);
  const evaluation = useKioskStore(state => state.evaluation);
  if (!load.ok) return null;

  const questions = plan?.questions ?? [];
  const evidenceOnlyFacts = plan?.evidenceOnlyFacts ?? [];
  if (!evaluation || !questions.length) {
    return (
      <KioskFrame partner hideChat brand={load.event.config.copy.brand} progress={{ label: '추가 확인' }}>
        <Notice tone="warn">추가 확인할 질문이 없어요. 현재 결과를 확인해 주세요.</Notice>
        <View style={styles.inlineAction}><KioskButton label="결과 보기" onPress={() => router.replace(SAMDO_EVENT.resultPath as never)} /></View>
      </KioskFrame>
    );
  }

  return (
    <KioskFrame
      partner
      hideChat
      brand={load.event.config.copy.brand}
      progress={{ label: `추가 확인 · ${questions.length}개` }}
      scrollKey="adaptive-assessment"
      footer={
        <>
          <KioskButton label="이전" variant="ghost" icon="arrow-back" onPress={() => router.replace('/event/subscription' as never)} />
          <View style={styles.footerAction}>
            <KioskButton testID="adaptive-submit" label="답변 반영하고 다시 분석" icon="refresh" large grow onPress={() => router.replace('/event/analysis' as never)} />
          </View>
        </>
      }
    >
      {/* 일반 입력 단계와 다르게 들어온다: 안내 문구가 먼저, 몇 개 남았는지, 그다음 질문 카드가 차례로. */}
      <View style={styles.head} testID="adaptive-assessment">
        <Appear distance={travel.md}>
          <Text style={styles.eyebrow}>{SAMDO_EVENT.contextLabel}</Text>
          <Text style={styles.title} accessibilityRole="header">정확한 판정을 위해 몇 가지만 더 확인할게요.</Text>
        </Appear>
        <Appear delay={eventMotion.sequence} distance={travel.sm}>
          <Text style={styles.count}>{questions.length}개만 더 확인하면 됩니다.</Text>
          <Text style={styles.subtitle}>이미 신청이 어려운 유형은 제외했고, 여러 신청유형이 함께 쓰는 정보는 한 번만 물어요.</Text>
        </Appear>
      </View>

      <Section title="추가 확인">
        <StaggerList after={eventMotion.sequence * 2} style={styles.questions}>
          {questions.map((question, index) => (
            <Question key={question.id} testID={`adaptive-question-${question.id}`} title={`${index + 1}. ${question.title}`} hint={question.hint}>
              <AdaptiveControl question={question} />
            </Question>
          ))}
        </StaggerList>
      </Section>

      {evidenceOnlyFacts.length ? (
        <Notice tone="info">공식 가점이나 우선순위 중 {evidenceOnlyFacts.length}개 항목은 행사장에서 추측하지 않고 ‘서류 확인 필요’로 남겨요.</Notice>
      ) : null}
    </KioskFrame>
  );
}

const styles = StyleSheet.create({
  head: { gap: 8, marginBottom: 28 },
  title: { ...k.type.hero, color: k.colors.text },
  eyebrow: { ...k.type.label, color: k.colors.primary, marginBottom: 4 },
  count: { ...k.type.title, color: k.colors.primary },
  subtitle: { ...k.type.bodyLg, color: k.colors.textMuted },
  numberControl: { gap: 8, alignItems: 'flex-start' },
  inlineAction: { marginTop: 20, alignItems: 'flex-start' },
  footerAction: { flex: 1, flexDirection: 'row' },
  questions: { gap: 24 },
});
