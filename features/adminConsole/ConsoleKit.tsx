import { MaterialIcons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { StatusPill } from '../../components/StatusPill';
import { colors, radius, spacing, tint, type } from '../../design/tokens';
import { LIFECYCLE_LABEL } from './consoleModel';
import type { ConsoleValidation, NoticeLifecycle } from './contract';

type IconName = ComponentProps<typeof MaterialIcons>['name'];
type Tone = keyof typeof tint;

export const LifecycleBadge = ({ status }: { status: NoticeLifecycle }) => (
  <StatusPill label={LIFECYCLE_LABEL[status].label} tone={LIFECYCLE_LABEL[status].tone as Tone} />
);

export function ValidationBadge({ validation }: { validation: ConsoleValidation }) {
  const map = { PASS: { label: '검증 통과', tone: 'green' }, WARN: { label: '확인 필요', tone: 'amber' }, FAIL: { label: '검증 실패', tone: 'pink' } } as const;
  const item = map[validation.status];
  return <StatusPill label={item.label} tone={item.tone} icon={validation.status === 'PASS' ? 'check-circle' : 'error-outline'} />;
}

/** 비율 막대 목록. 차트 대신 숫자 + 짧은 막대(운영자가 바로 읽게). */
export function ShareBars({ rows, testID, hideShare }: { rows: Array<{ key: string; label: string; count: number; share: number; tone: Tone }>; testID?: string; hideShare?: boolean }) {
  return (
    <View testID={testID} style={styles.bars}>
      {rows.map(row => (
        <View key={row.key} style={styles.barRow}>
          <Text style={styles.barLabel} numberOfLines={1}>{row.label}</Text>
          <View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.round(row.share * 100)}%`, backgroundColor: tint[row.tone].fg }]} /></View>
          <Text style={styles.barValue}>{row.count.toLocaleString('ko-KR')}{row.share && !hideShare ? ` · ${Math.round(row.share * 100)}%` : ''}</Text>
        </View>
      ))}
    </View>
  );
}

/** 탭. 좁으면 줄바꿈한다(가로 스크롤 없음). */
export function WrapTabs<K extends string>({ tabs, active, onChange, testID }: { tabs: Array<{ key: K; label: string; count?: number }>; active: K; onChange: (key: K) => void; testID?: string }) {
  return (
    <View testID={testID} style={styles.tabs} accessibilityRole="tablist">
      {tabs.map(tab => {
        const on = tab.key === active;
        return (
          <MotionPressable
            key={tab.key}
            testID={`${testID ?? 'tab'}-${tab.key}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={tab.label}
            onPress={() => onChange(tab.key)}
            style={[styles.tab, on && styles.tabOn]}
          >
            <Text style={[styles.tabText, on && styles.tabTextOn]}>{tab.label}{tab.count !== undefined ? ` ${tab.count}` : ''}</Text>
          </MotionPressable>
        );
      })}
    </View>
  );
}

/** 라벨·값 한 줄(상세 화면). 값이 길면 줄바꿈. mono 는 해시·locator 같은 운영 식별자. */
export function Field({ label, value, mono, children }: { label: string; value?: string | null; mono?: boolean; children?: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children ?? <Text style={[styles.fieldValue, mono && styles.mono]} selectable>{value ?? '—'}</Text>}
    </View>
  );
}

export function FieldGrid({ children }: { children: ReactNode }) {
  return <View style={styles.fieldGrid}>{children}</View>;
}

export function HealthBanner({ ok, issues }: { ok: boolean; issues: string[] }) {
  const tone = ok ? tint.green : tint.amber;
  const icon: IconName = ok ? 'check-circle' : 'warning-amber';
  return (
    <View testID="console-health" style={[styles.health, { backgroundColor: tone.bg }]}>
      <MaterialIcons name={icon} size={22} color={tone.fg} />
      <View style={styles.healthCopy}>
        <Text style={[styles.healthTitle, { color: tone.fg }]}>{ok ? '시스템 정상' : `확인할 문제 ${issues.length}건`}</Text>
        {issues.map(issue => <Text key={issue} style={[styles.healthLine, { color: tone.fg }]}>· {issue}</Text>)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bars: { gap: 10 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  barLabel: { ...type.bodySmStrong, color: colors.text, width: 128 },
  barTrack: { flex: 1, minWidth: 80, height: 8, borderRadius: 4, backgroundColor: colors.surfaceContainer, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  barValue: { ...type.bodySm, color: colors.textMuted, minWidth: 72, textAlign: 'right' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tab: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.surfaceContainer },
  tabOn: { backgroundColor: colors.primary },
  tabText: { ...type.label, color: colors.textMuted },
  tabTextOn: { color: colors.onPrimary },
  field: { flexGrow: 1, flexBasis: 220, minWidth: 0, gap: 2 },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: spacing.sm },
  fieldLabel: { ...type.caption, color: colors.textMuted },
  fieldValue: { ...type.bodyStrong, color: colors.text },
  mono: { fontFamily: 'monospace', fontSize: 13, lineHeight: 19 },
  health: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: spacing.md, borderRadius: radius.cardSm },
  healthCopy: { flex: 1, gap: 2 },
  healthTitle: { ...type.section },
  healthLine: { ...type.bodySm },
});
