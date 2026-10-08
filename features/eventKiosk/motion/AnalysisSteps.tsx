import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Appear } from '../../../components/motion/Appear';
import { AnimatedBar } from '../../../components/motion/AnimatedBar';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { k } from '../ui/theme';

/**
 * 분석 중 화면의 네 단계. 실제 분석은 이 표시와 상관없이 진행되고, 끝나면 바로 결과로 넘어간다.
 * 단계 간격은 분석 화면의 최소 표시 시간을 네 칸으로 나눈 값이라 체험을 더 늦추지 않는다.
 */
export function AnalysisSteps({ regionLabel, totalMs }: { regionLabel: string; totalMs: number }) {
  const steps = [`${regionLabel} 공고 확인`, '공급유형 비교', '조건 분석', '결과 생성'];
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const stepMs = Math.max(1, Math.floor(totalMs / steps.length));

  useEffect(() => {
    if (active >= steps.length - 1) return;
    const timer = setTimeout(() => setActive(current => Math.min(steps.length - 1, current + 1)), stepMs);
    return () => clearTimeout(timer);
  }, [active, stepMs, steps.length]);

  return (
    <View style={styles.wrap} testID="analysis-steps" accessibilityLiveRegion="polite" accessibilityLabel={`분석 중: ${steps[active]}`}>
      <View style={styles.track}>
        <AnimatedBar ratio={(active + 1) / steps.length} style={styles.fill} />
      </View>
      <View style={styles.list}>
        {steps.map((label, index) => {
          const done = index < active;
          const current = index === active;
          return (
            <View key={label} style={styles.row} testID={`analysis-step-${index}`}>
              <View style={[styles.dot, done && styles.dotDone, current && styles.dotCurrent]}>
                {done ? (
                  <Appear distance={0} replayKey={`${label}-done`}>
                    <MaterialIcons name="check" size={18} color={k.colors.onPrimary} />
                  </Appear>
                ) : (
                  <Text style={[styles.dotText, current && { color: k.colors.primary }]}>{index + 1}</Text>
                )}
              </View>
              <Text style={[styles.label, (done || current) && styles.labelOn]}>{label}</Text>
              {current && !reduced ? <Text style={styles.now}>진행 중</Text> : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 520, gap: 20 },
  track: { height: 8, borderRadius: 4, backgroundColor: k.colors.surfaceHighest, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: k.colors.primary },
  list: { gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 36 },
  dot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: k.colors.surfaceHighest, alignItems: 'center', justifyContent: 'center', backgroundColor: k.colors.surface },
  dotCurrent: { borderColor: k.colors.primary },
  dotDone: { borderColor: k.colors.primary, backgroundColor: k.colors.primary },
  dotText: { ...k.type.label, color: k.colors.textSubtle },
  label: { ...k.type.bodyLg, color: k.colors.textSubtle, flex: 1 },
  labelOn: { color: k.colors.text },
  now: { ...k.type.caption, color: k.colors.primary },
});
