import { MaterialIcons } from '@expo/vector-icons';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { MotionPressable } from '../../components/motion/MotionPressable';
import { StatusPill } from '../../components/StatusPill';
import { colors, radius, spacing, tint, type } from '../../design/tokens';
import { AdminButton } from '../adminPortal/ui/AdminKit';
import { ALERT_LEVEL_META, fallbackReasonMeta, LIFECYCLE_LABEL, matches, PAGE_SIZE, shortTime, type AlertLevel, type ConsoleAlert } from './consoleModel';
import { ageLabel, dataAgeMinutes, isStale, LOAD_ERROR_COPY, type ConsoleLoadErrorKind } from './consoleState';
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
          <Text style={styles.barLabel} numberOfLines={2}>{row.label}</Text>
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
  // 막힌 항목 이름이 곧 할 일이라 잘리지 않게 넓히고 두 줄까지 보인다.
  barLabel: { ...type.bodySmStrong, color: colors.text, width: 220, maxWidth: '100%' },
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

/* ── 알림 위계 ─────────────────────────────────────────────────────────────
 * 수준은 색 + 아이콘 + 글자(오류·조치 필요·주의·안내)로 함께 보인다. 색만으로 구분하지 않는다.
 */
export function LevelBadge({ level }: { level: AlertLevel }) {
  const meta = ALERT_LEVEL_META[level];
  return (
    <View testID={`level-${level}`} style={[kit.level, { backgroundColor: tint[meta.tone].bg, borderColor: tint[meta.tone].fg }]}>
      <MaterialIcons name={meta.icon} size={14} color={tint[meta.tone].fg} />
      <Text style={[kit.levelText, { color: tint[meta.tone].fg }]}>{meta.label}</Text>
    </View>
  );
}

export function AlertList({ alerts, onOpen, testID = 'console-alerts' }: { alerts: ConsoleAlert[]; onOpen: (alert: ConsoleAlert) => void; testID?: string }) {
  if (!alerts.length) {
    return (
      <View testID={testID} style={[kit.allClear]}>
        <MaterialIcons name="check-circle" size={20} color={tint.green.fg} />
        <Text style={[kit.allClearText]}>지금 처리할 문제가 없어요</Text>
      </View>
    );
  }
  return (
    <View testID={testID} style={kit.alerts}>
      {alerts.map(alert => (
        <View key={alert.id} testID={`console-alert-${alert.id}`} style={[kit.alert, { borderLeftColor: tint[ALERT_LEVEL_META[alert.level].tone].fg }]}>
          <View style={kit.alertCopy}>
            <View style={kit.alertHead}>
              <LevelBadge level={alert.level} />
              <Text style={kit.alertTitle}>{alert.title}</Text>
            </View>
            <Text style={kit.alertDetail}>{alert.detail}</Text>
          </View>
          {alert.target !== 'dashboard' ? (
            <MotionPressable accessibilityRole="link" accessibilityLabel={`${alert.title} 보기`} onPress={() => onOpen(alert)} style={kit.alertGo}>
              <Text style={kit.alertGoText}>보기</Text>
              <MaterialIcons name="chevron-right" size={18} color={colors.primary} />
            </MotionPressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/* ── 화면 상태 ───────────────────────────────────────────────────────────── */

export function LoadingView({ label = '운영 데이터를 불러오는 중이에요' }: { label?: string }) {
  return (
    <View testID="console-state-loading" accessibilityRole="progressbar" accessibilityLabel={label} style={kit.loading}>
      <View style={kit.loadingHead}>
        <ActivityIndicator color={colors.primary} />
        <Text style={kit.loadingText}>{label}</Text>
      </View>
      {[0, 1, 2].map(index => <View key={index} style={[kit.skeleton, index === 0 && kit.skeletonTall]} />)}
    </View>
  );
}

export function StateView({ kind, status, onRetry, onLogin }: { kind: ConsoleLoadErrorKind; status: number | null; onRetry: () => void; onLogin: () => void }) {
  const copy = LOAD_ERROR_COPY[kind];
  const tone = kind === 'FORBIDDEN' || kind === 'UNAUTHORIZED' ? tint.purple : kind === 'TIMEOUT' || kind === 'AUTH_UNAVAILABLE' ? tint.amber : tint.pink;
  return (
    <View testID={`console-state-${kind.toLowerCase()}`} accessibilityRole="alert" style={[kit.state, { borderColor: tone.fg }]}>
      <View style={[kit.stateIcon, { backgroundColor: tone.bg }]}><MaterialIcons name={copy.icon as IconName} size={24} color={tone.fg} /></View>
      <Text accessibilityRole="header" style={kit.stateTitle}>{copy.title}</Text>
      <Text style={kit.stateBody}>{copy.body}</Text>
      <Text style={kit.stateCode}>상태 코드 · {kind}{status ? ` (HTTP ${status})` : ''}</Text>
      {copy.action === 'RETRY' ? <AdminButton label="다시 시도" icon="refresh" onPress={onRetry} /> : null}
      {copy.action === 'LOGIN' ? <AdminButton label="관리자 로그인" icon="login" onPress={onLogin} /> : null}
    </View>
  );
}

/** 데이터 기준 시각 + 새로고침. 오래된 데이터면 '주의'로 바꿔 보여 준다(글자 + 아이콘). */
export function DataStamp({ generatedAt, now, onRefresh, missing }: { generatedAt: string; now: Date; onRefresh: () => void; missing: string[] }) {
  const age = dataAgeMinutes(generatedAt, now);
  const stale = isStale(generatedAt, now);
  return (
    <View testID="console-stamp" style={[kit.stamp, stale && kit.stampStale]}>
      <MaterialIcons name={stale ? 'history-toggle-off' : 'schedule'} size={16} color={stale ? tint.amber.fg : colors.textMuted} />
      <Text style={[kit.stampText, stale && kit.stampTextStale]}>
        {stale ? '오래된 데이터 · ' : ''}{shortTime(generatedAt)} 기준{age !== null ? ` (${ageLabel(age)})` : ''}
        {missing.length ? ` · 수집 전: ${missing.join(', ')}` : ''}
      </Text>
      <MotionPressable testID="console-refresh" accessibilityRole="button" accessibilityLabel="새로고침" onPress={onRefresh} style={kit.refresh}>
        <MaterialIcons name="refresh" size={18} color={colors.primary} />
        <Text style={kit.refreshText}>새로고침</Text>
      </MotionPressable>
    </View>
  );
}

/* ── 검색 · 필터 · 더 보기 ──────────────────────────────────────────────── */

export function SearchField({ value, onChange, placeholder, testID }: { value: string; onChange: (value: string) => void; placeholder: string; testID?: string }) {
  return (
    <View style={kit.search}>
      <MaterialIcons name="search" size={18} color={colors.textSubtle} />
      <TextInput
        testID={testID}
        accessibilityLabel={placeholder}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        value={value}
        onChangeText={onChange}
        style={kit.searchInput}
      />
      {value ? (
        <MotionPressable accessibilityRole="button" accessibilityLabel="검색어 지우기" onPress={() => onChange('')} style={kit.searchClear}>
          <MaterialIcons name="close" size={16} color={colors.textSubtle} />
        </MotionPressable>
      ) : null}
    </View>
  );
}

/** 라벨 + 줄바꿈 칩(가로 스크롤 없음). */
export function FilterGroup<K extends string>({ label, ...tabs }: { label: string } & Parameters<typeof WrapTabs<K>>[0]) {
  return (
    <View style={kit.filterGroup}>
      <Text style={kit.filterLabel}>{label}</Text>
      <WrapTabs<K> {...tabs} />
    </View>
  );
}

/** 켜고 끄는 칩. disabled 면 이유를 함께 적는다. */
export function ToggleChip({ label, on, onChange, disabled, hint, testID }: { label: string; on: boolean; onChange: (on: boolean) => void; disabled?: boolean; hint?: string; testID?: string }) {
  return (
    <View style={kit.toggleWrap}>
      <MotionPressable
        testID={testID}
        accessibilityRole="switch"
        accessibilityState={{ checked: on, disabled }}
        accessibilityLabel={label}
        disabled={disabled}
        onPress={() => onChange(!on)}
        style={[kit.toggle, on && kit.toggleOn, disabled && kit.toggleDisabled]}
      >
        <MaterialIcons name={on ? 'check-box' : 'check-box-outline-blank'} size={18} color={on ? colors.onPrimary : colors.textMuted} />
        <Text style={[kit.toggleText, on && kit.toggleTextOn]}>{label}</Text>
      </MotionPressable>
      {hint ? <Text style={kit.toggleHint}>{hint}</Text> : null}
    </View>
  );
}

export function MoreButton({ shown, total, onMore, testID }: { shown: number; total: number; onMore: () => void; testID?: string }) {
  if (shown >= total) return total > PAGE_SIZE ? <Text style={kit.moreDone}>{total.toLocaleString('ko-KR')}건 모두 보는 중</Text> : null;
  return (
    <View style={kit.more}>
      <Text style={kit.moreText}>{shown.toLocaleString('ko-KR')} / {total.toLocaleString('ko-KR')}건</Text>
      <AdminButton label={`${Math.min(PAGE_SIZE, total - shown)}건 더 보기`} tone="quiet" icon="expand-more" onPress={onMore} />
      {testID ? <View testID={testID} /> : null}
    </View>
  );
}

/** 대체 사유: 아이콘 + 글자. 색만으로 구분하지 않는다. */
export function ReasonTag({ reason }: { reason: string | null }) {
  const meta = fallbackReasonMeta(reason);
  if (!meta) return <Text style={kit.reasonNone}>—</Text>;
  return (
    <View style={kit.reason}>
      <MaterialIcons name={meta.icon} size={14} color={colors.text} />
      <Text style={kit.reasonText} numberOfLines={2}>{meta.label}</Text>
    </View>
  );
}

/**
 * 공고 고르기. 공고가 적으면 칩, 많으면(7개 이상) 검색해서 고른다(칩 100개를 늘어놓지 않는다).
 */
export function NoticePicker({ options, value, onChange, testID }: { options: Array<{ id: string; title: string; hint?: string }>; value: string; onChange: (id: string) => void; testID?: string }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  if (options.length <= 6) return <WrapTabs testID={testID} active={value} onChange={onChange} tabs={options.map(option => ({ key: option.id, label: option.title }))} />;
  const current = options.find(option => option.id === value);
  const found = options.filter(option => matches(`${option.title} ${option.id}`, query)).slice(0, 8);
  return (
    <View testID={testID} style={kit.picker}>
      <MotionPressable testID={`${testID}-toggle`} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel="공고 바꾸기" onPress={() => setOpen(!open)} style={kit.pickerCurrent}>
        <View style={kit.pickerCopy}>
          <Text style={kit.pickerLabel}>공고 {options.length}개 중</Text>
          <Text style={kit.pickerTitle} numberOfLines={2}>{current?.title ?? '공고를 골라 주세요'}</Text>
        </View>
        <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={22} color={colors.primary} />
      </MotionPressable>
      {open ? (
        <View style={kit.pickerPanel}>
          <SearchField testID={`${testID}-search`} value={query} onChange={setQuery} placeholder="공고 이름으로 찾기" />
          {found.map(option => (
            <MotionPressable key={option.id} testID={`${testID}-${option.id}`} accessibilityRole="button" accessibilityState={{ selected: option.id === value }} onPress={() => { onChange(option.id); setOpen(false); setQuery(''); }} style={[kit.pickerOption, option.id === value && kit.pickerOptionOn]}>
              <Text style={kit.pickerOptionText} numberOfLines={2}>{option.title}</Text>
              {option.hint ? <Text style={kit.pickerHint}>{option.hint}</Text> : null}
            </MotionPressable>
          ))}
          {!found.length ? <Text style={kit.pickerHint}>찾는 공고가 없어요.</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

/** 작은 숫자 묶음. 휴대폰에서도 한두 줄로 끝나 목록이 첫 화면에 보인다(큰 KPI 카드 대신). */
export function SummaryStrip({ items, testID }: { items: Array<{ label: string; value: string; hint?: string; level?: AlertLevel | null }>; testID?: string }) {
  return (
    <View testID={testID} style={kit.strip}>
      {items.map(item => (
        <View key={item.label} style={kit.stripItem}>
          <Text style={kit.stripLabel}>{item.label}</Text>
          <View style={kit.stripValueRow}>
            <Text style={kit.stripValue}>{item.value}</Text>
            {item.level ? <LevelBadge level={item.level} /> : null}
          </View>
          {item.hint ? <Text style={kit.stripHint}>{item.hint}</Text> : null}
        </View>
      ))}
    </View>
  );
}

/** 좁은 화면에서 필터 묶음을 접는다. 켜진 필터 수를 버튼에 적는다. */
export function FilterDisclosure({ active, collapsible, children, testID }: { active: number; collapsible: boolean; children: ReactNode; testID?: string }) {
  const [open, setOpen] = useState(false);
  if (!collapsible) return <>{children}</>;
  return (
    <View style={kit.disclosure}>
      <MotionPressable testID={testID} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel="필터 열기" onPress={() => setOpen(!open)} style={kit.disclosureButton}>
        <MaterialIcons name="tune" size={18} color={colors.primary} />
        <Text style={kit.disclosureText}>필터{active ? ` ${active}개 켜짐` : ''}</Text>
        <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={20} color={colors.primary} />
      </MotionPressable>
      {open ? children : null}
    </View>
  );
}

const kit = StyleSheet.create({
  strip: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stripItem: { flexGrow: 1, flexBasis: 140, minWidth: 0, gap: 2, padding: spacing.sm, borderRadius: radius.cardSm, backgroundColor: colors.surface },
  stripLabel: { ...type.caption, color: colors.textMuted },
  stripValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  stripValue: { ...type.section, color: colors.text },
  stripHint: { ...type.caption, color: colors.textMuted },
  disclosure: { gap: spacing.sm },
  disclosureButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, alignSelf: 'flex-start', borderRadius: radius.button, backgroundColor: tint.purple.bg },
  disclosureText: { ...type.label, color: colors.primary },
  level: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  levelText: { ...type.caption, fontFamily: type.label.fontFamily },
  alerts: { gap: spacing.sm },
  alert: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, paddingLeft: spacing.md, borderRadius: radius.cardSm, backgroundColor: colors.surface, borderLeftWidth: 4, flexWrap: 'wrap' },
  alertCopy: { flex: 1, minWidth: 200, gap: 4 },
  alertHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  alertTitle: { ...type.bodyStrong, color: colors.text, flexShrink: 1 },
  alertDetail: { ...type.bodySm, color: colors.textMuted },
  alertGo: { flexDirection: 'row', alignItems: 'center', minHeight: 44, minWidth: 44, paddingHorizontal: 10, borderRadius: radius.button, backgroundColor: tint.purple.bg },
  alertGoText: { ...type.label, color: colors.primary },
  allClear: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: spacing.md, borderRadius: radius.cardSm, backgroundColor: tint.green.bg },
  allClearText: { ...type.bodyStrong, color: tint.green.fg },
  loading: { gap: spacing.md },
  loadingHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingText: { ...type.body, color: colors.textMuted },
  skeleton: { height: 72, borderRadius: radius.cardSm, backgroundColor: colors.surfaceContainer },
  skeletonTall: { height: 120 },
  state: { alignItems: 'flex-start', gap: spacing.sm, padding: spacing.lg, borderRadius: radius.card, backgroundColor: colors.surface, borderLeftWidth: 4 },
  stateIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  stateTitle: { ...type.section, color: colors.text },
  stateBody: { ...type.body, color: colors.textMuted },
  stateCode: { ...type.caption, color: colors.textSubtle },
  stamp: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingLeft: spacing.sm, borderRadius: radius.button, backgroundColor: colors.surfaceContainer },
  stampStale: { backgroundColor: tint.amber.bg },
  stampText: { ...type.caption, color: colors.textMuted, flex: 1, minWidth: 160 },
  stampTextStale: { color: tint.amber.fg, fontFamily: type.label.fontFamily },
  refresh: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 12 },
  refreshText: { ...type.label, color: colors.primary },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingLeft: 12, borderRadius: radius.button, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outline },
  searchInput: { ...type.body, color: colors.text, flex: 1, minWidth: 0, minHeight: 44, padding: 0 },
  searchClear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  filterGroup: { gap: 4 },
  filterLabel: { ...type.caption, color: colors.textMuted },
  toggleWrap: { gap: 2, alignItems: 'flex-start' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.surfaceContainer },
  toggleOn: { backgroundColor: colors.primary },
  toggleDisabled: { opacity: 0.5 },
  toggleText: { ...type.label, color: colors.textMuted },
  toggleTextOn: { color: colors.onPrimary },
  toggleHint: { ...type.caption, color: colors.textMuted },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, flexWrap: 'wrap', paddingTop: spacing.sm },
  moreText: { ...type.caption, color: colors.textMuted },
  moreDone: { ...type.caption, color: colors.textMuted, textAlign: 'center', paddingTop: spacing.sm },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  reasonText: { ...type.bodySm, color: colors.text, flexShrink: 1 },
  reasonNone: { ...type.bodySm, color: colors.textMuted },
  picker: { gap: 6 },
  pickerCurrent: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, padding: spacing.sm, borderRadius: radius.cardSm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  pickerCopy: { flex: 1, minWidth: 0 },
  pickerLabel: { ...type.caption, color: colors.textMuted },
  pickerTitle: { ...type.bodyStrong, color: colors.text },
  pickerPanel: { gap: 6, padding: spacing.sm, borderRadius: radius.cardSm, backgroundColor: colors.surfaceContainer },
  pickerOption: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.button, backgroundColor: colors.surface },
  pickerOptionOn: { borderWidth: 1, borderColor: colors.primary },
  pickerOptionText: { ...type.bodySm, color: colors.text },
  pickerHint: { ...type.caption, color: colors.textMuted },
});
