import { MaterialIcons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import { useDensity } from '../layout/DensityContext';
import { k } from '../ui/theme';

/**
 * 지구별 상세 분석 묶음. 넓은 화면은 늘 펼친다. 휴대폰은 처음에 접어 두고(긴 설명이 비교 영역을 밀어내지 않게)
 * 한 번 누르면 펼친다. 펼친 뒤 내용·testID 는 기존 상세 화면 그대로다.
 */
export function DistrictDetailFold({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const { density, d } = useDensity();
  const touch = density === 'touch';
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? !touch;
  return (
    <View testID="district-detail" style={[styles.wrap, { marginTop: d.sectionGap, gap: d.sectionGap }]}>
      {touch ? (
        <MotionPressable
          testID="district-detail-toggle"
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${title} ${open ? '접기' : '펼치기'}`}
          onPress={() => setChoice(!open)}
          style={[styles.toggle, { padding: d.cardPadding - 2 }]}
        >
          <View style={styles.flex}>
            <Text style={[d.type.cardTitle, styles.text]}>{title}</Text>
            {hint ? <Text style={[d.type.caption, styles.muted]}>{hint}</Text> : null}
          </View>
          <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={24} color={k.colors.primary} />
        </MotionPressable>
      ) : (
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={[d.type.section, styles.text]}>{title}</Text>
          {hint ? <Text style={[d.type.caption, styles.muted]}>{hint}</Text> : null}
        </View>
      )}
      {open ? children : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {},
  flex: { flex: 1, minWidth: 0 },
  text: { color: k.colors.text },
  muted: { color: k.colors.textMuted },
  heading: { gap: 2, paddingTop: 4, borderTopWidth: 1, borderTopColor: k.colors.surfaceHigh },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, backgroundColor: k.colors.surface, borderRadius: k.radius.lg, borderWidth: 1, borderColor: k.colors.surfaceHigh },
});
