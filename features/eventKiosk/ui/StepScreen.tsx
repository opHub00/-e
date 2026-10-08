import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { inputSteps, stepBlocker, type InputStep } from '../model';
import { kioskEvent } from '../kioskEvent';
import { useKioskStore } from '../useKioskStore';
import { KioskButton, Notice } from './controls';
import { KioskFrame } from './KioskFrame';
import { goBack, nextAfter, stepPath } from './navigation';
import { k } from './theme';
import { StepSlide } from '../motion/StepSlide';

/** 입력 단계 화면 틀. 제목, 질문들, 아래 이전/다음. */
export function StepScreen({ step, title, subtitle, children }: {
  step: InputStep;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const load = kioskEvent();
  const answers = useKioskStore(state => state.answers);
  const sessionKey = useKioskStore(state => state.sessionKey);
  const [tried, setTried] = useState(false);
  const steps = inputSteps(answers.householdType);
  const blocker = stepBlocker(answers, step);
  const index = steps.indexOf(step);
  const previous = index > 0 ? stepPath(steps[index - 1]) : '/event/intro';
  const isLast = index === steps.length - 1;

  const next = () => {
    setTried(true);
    if (blocker) return;
    router.push(nextAfter(answers.householdType, step) as never);
  };

  return (
    <KioskFrame
      brand={load.ok ? load.event.config.copy.brand : '완판e'}
      progress={{ steps, current: step }}
      scrollKey={`${sessionKey}-${step}`}
      footer={
        <>
          <KioskButton label="이전" variant="ghost" icon="arrow-back" onPress={() => goBack(previous)} testID="kiosk-prev" />
          <View style={styles.footerRight}>
            {tried && blocker ? <Text style={styles.blocker} accessibilityRole="alert">{blocker}</Text> : null}
            <KioskButton
              testID="kiosk-next"
              label={isLast ? '분석 시작하기' : '다음'}
              icon={isLast ? 'auto-awesome' : 'arrow-forward'}
              onPress={next}
              large
              grow
            />
          </View>
        </>
      }
    >
      <StepSlide index={index}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {answers.householdType === null && step !== 'household' ? (
        <Notice tone="warn">가구 형태를 먼저 골라 주세요. <Text onPress={() => router.replace(stepPath('household') as never)} style={styles.link}>가구 형태 고르기</Text></Notice>
      ) : null}
      <View style={styles.body}>{children}</View>
      {step === 'household' ? null : (
        <Text style={styles.skipHint}>모르는 질문은 비워 두거나 ‘잘 모르겠어요’를 골라도 돼요. 결과에서 무엇을 더 확인하면 되는지 알려 드려요.</Text>
      )}
      </StepSlide>
    </KioskFrame>
  );
}

const styles = StyleSheet.create({
  head: { gap: 8, marginBottom: 28 },
  title: { ...k.type.hero, color: k.colors.text },
  subtitle: { ...k.type.bodyLg, color: k.colors.textMuted },
  body: { gap: 24 },
  footerRight: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16, flexShrink: 1, flexWrap: 'wrap', justifyContent: 'flex-end' },
  blocker: { ...k.type.bodyStrong, color: k.colors.error, flexShrink: 1, maxWidth: 420 },
  link: { color: k.colors.primary, textDecorationLine: 'underline' },
  skipHint: { ...k.type.caption, color: k.colors.textSubtle, marginTop: 40 },
});
