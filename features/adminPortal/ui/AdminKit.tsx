import type { ReactNode } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import { StatusPill } from '../../../components/StatusPill';
import { colors, radius, shadow, size, spacing, tint, tracking, type } from '../../../design/tokens';
import { statusOf, type AdminStatusKey } from '../status';
import { useIsWide } from '../useIsWide';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

/**
 * 관리자 화면 공통 부품.
 *
 * 모든 관리 화면이 같은 뼈대를 쓴다: 제목 → 요약 숫자 → 검색·필터 → 목록 → 액션.
 * 화면마다 다르게 만들면 운영자가 화면을 옮길 때마다 다시 배워야 한다.
 */

/** 상태 배지. 말과 색은 status.ts 한 곳에서만 정한다. */
export function StatusBadge({ status, icon }: { status: AdminStatusKey; icon?: IconName }) {
  const { label, tone } = statusOf(status);
  return <StatusPill label={label} tone={tone} icon={icon} />;
}

/** 화면 맨 위. 제목과 한 줄 설명, 오른쪽에 주요 액션. */
export function PageIntro({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <View style={styles.intro}>
      <View style={styles.introCopy}>
        <Text accessibilityRole="header" style={styles.introTitle}>{title}</Text>
        <Text style={styles.introBody}>{description}</Text>
      </View>
      {actions ? <View style={styles.introActions}>{actions}</View> : null}
    </View>
  );
}

export function AdminButton({ label, onPress, tone = 'primary', icon, disabled }: {
  label: string; onPress: () => void; tone?: 'primary' | 'quiet' | 'danger'; icon?: IconName; disabled?: boolean;
}) {
  const palette = tone === 'primary'
    ? { bg: colors.primary, fg: colors.onPrimary }
    : tone === 'danger'
      ? { bg: tint.pink.bg, fg: tint.pink.fg }
      : { bg: colors.surfaceContainer, fg: colors.textMuted };
  return (
    <MotionPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      onPress={disabled ? () => {} : onPress}
      style={[styles.button, { backgroundColor: palette.bg }, disabled && styles.buttonDisabled]}
    >
      {icon ? <MaterialIcons name={icon} size={16} color={palette.fg} /> : null}
      <Text style={[styles.buttonText, { color: palette.fg }]}>{label}</Text>
    </MotionPressable>
  );
}

export type Kpi = {
  label: string;
  value: string;
  /** 숫자만으로 뜻이 서지 않을 때 한 줄. 없으면 넣지 않는다. */
  hint?: string;
  tone?: keyof typeof tint;
  icon?: IconName;
};

/** 요약 숫자 묶음. 대시보드와 각 목록 화면 위쪽에서 같은 모양으로 쓴다. */
export function KpiGrid({ items }: { items: Kpi[] }) {
  const { width } = useWindowDimensions();
  const columns = width >= 1240 ? 4 : width >= 900 ? 3 : width >= 560 ? 2 : 1;
  return (
    <View style={styles.kpiGrid}>
      {items.map(item => {
        const palette = tint[item.tone ?? 'neutral'];
        return (
          <View key={item.label} style={[styles.kpiCard, { width: `${100 / columns}%` }]}>
            <View style={styles.kpiInner}>
              <View style={styles.kpiTop}>
                <Text style={styles.kpiLabel}>{item.label}</Text>
                {item.icon ? (
                  <View style={[styles.kpiIcon, { backgroundColor: palette.bg }]}>
                    <MaterialIcons name={item.icon} size={16} color={palette.fg} />
                  </View>
                ) : null}
              </View>
              <Text style={[styles.kpiValue, { color: palette.fg === colors.textMuted ? colors.text : palette.fg }]}>{item.value}</Text>
              {item.hint ? <Text style={styles.kpiHint}>{item.hint}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** 카드 한 장. 제목 + 보조설명 + 내용. */
export function SectionCard({ title, description, action, children }: {
  title: string; description?: string; action?: ReactNode; children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.sectionCopy}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
          {description ? <Text style={styles.sectionBody}>{description}</Text> : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

export type FilterChoice = { key: string; label: string };

/** 검색창 + 필터 칩. 표 위에 늘 같은 자리에 놓는다. */
export function SearchFilterBar({ placeholder, query, onQuery, filters }: {
  placeholder: string;
  query: string;
  onQuery: (value: string) => void;
  filters?: { label: string; value: string; choices: FilterChoice[]; onChange: (key: string) => void }[];
}) {
  return (
    <View style={styles.filterBar}>
      <View style={styles.searchBox}>
        <MaterialIcons name="search" size={18} color={colors.textSubtle} />
        <TextInput
          accessibilityLabel={placeholder}
          placeholder={placeholder}
          placeholderTextColor={colors.textSubtle}
          value={query}
          onChangeText={onQuery}
          style={styles.searchInput}
        />
        {query ? (
          <MotionPressable accessibilityRole="button" accessibilityLabel="검색어 지우기" onPress={() => onQuery('')} style={styles.clear}>
            <MaterialIcons name="close" size={16} color={colors.textSubtle} />
          </MotionPressable>
        ) : null}
      </View>
      {filters?.map(filter => (
        <View key={filter.label} style={styles.filterGroup}>
          <Text style={styles.filterLabel}>{filter.label}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
            {filter.choices.map(choice => {
              const active = choice.key === filter.value;
              return (
                <MotionPressable
                  key={choice.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => filter.onChange(choice.key)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{choice.label}</Text>
                </MotionPressable>
              );
            })}
          </ScrollView>
        </View>
      ))}
    </View>
  );
}

export type Column<Row> = {
  key: string;
  header: string;
  /** 표에서 차지할 비율. 좁은 화면에서는 무시된다. */
  flex?: number;
  render: (row: Row) => ReactNode;
  /** 좁은 화면 카드에서 감출 열. 표에서는 그대로 보인다. */
  hideOnNarrow?: boolean;
};

/**
 * 목록.
 *
 * 넓은 화면에서는 표, 좁은 화면에서는 카드로 접힌다. 한 줄이 곧 관리 대상 하나다.
 * 줄마다 오른쪽에 액션을 둔다. 목록이 비면 왜 비었는지 적는다.
 */
export function DataList<Row>({ rows, columns, keyOf, actions, empty }: {
  rows: Row[];
  columns: Column<Row>[];
  keyOf: (row: Row) => string;
  actions?: (row: Row) => ReactNode;
  empty: { title: string; body: string; action?: ReactNode };
}) {
  const wide = useIsWide(900);

  if (!rows.length) return <EmptyState title={empty.title} body={empty.body} action={empty.action} />;

  if (!wide) {
    return (
      <View style={styles.cardList}>
        {rows.map(row => (
          <View key={keyOf(row)} style={styles.rowCard}>
            {columns.filter(column => !column.hideOnNarrow).map(column => (
              <View key={column.key} style={styles.rowCardLine}>
                <Text style={styles.rowCardLabel}>{column.header}</Text>
                <View style={styles.rowCardValue}>{column.render(row)}</View>
              </View>
            ))}
            {actions ? <View style={styles.rowCardActions}>{actions(row)}</View> : null}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.table}>
      <View style={styles.tableHead}>
        {columns.map(column => (
          <Text key={column.key} style={[styles.tableHeadText, { flex: column.flex ?? 1 }]}>{column.header}</Text>
        ))}
        {actions ? <View style={styles.actionColumn} /> : null}
      </View>
      {rows.map(row => (
        <View key={keyOf(row)} style={styles.tableRow}>
          {columns.map(column => (
            <View key={column.key} style={[styles.tableCell, { flex: column.flex ?? 1 }]}>{column.render(row)}</View>
          ))}
          {actions ? <View style={styles.actionColumn}>{actions(row)}</View> : null}
        </View>
      ))}
    </View>
  );
}

/** 표의 본문 글자. 셀 안에서 같은 크기를 쓰려고 따로 둔다. */
export const CellText = ({ children, strong, muted }: { children: ReactNode; strong?: boolean; muted?: boolean }) => (
  <Text style={[styles.cell, strong && styles.cellStrong, muted && styles.cellMuted]} numberOfLines={2}>{children}</Text>
);

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <MaterialIcons name="inbox" size={28} color={colors.textSubtle} />
      <Text accessibilityRole="header" style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {action}
    </View>
  );
}

/**
 * 아직 데이터가 연결되지 않은 화면.
 *
 * 빈 표를 그려 놓고 "0건"이라 적으면 운영자는 진짜 0건인 줄 안다.
 * 그래서 무엇이 있어야 이 화면이 켜지는지 그대로 적는다.
 */
export function NotConnected({ title, purpose, needs }: { title: string; purpose: string; needs: string[] }) {
  return (
    <SectionCard title={title} description={purpose}>
      <View style={styles.notConnected}>
        <StatusBadge status="NOT_CONNECTED" icon="link-off" />
        <Text style={styles.sectionBody}>이 화면은 아직 실제 데이터에 연결되지 않았어요. 숫자를 지어내지 않으려고 비워 두었어요.</Text>
        <Text style={styles.needsTitle}>이 화면이 켜지려면 필요한 것</Text>
        {needs.map(need => (
          <View key={need} style={styles.needRow}>
            <MaterialIcons name="check-box-outline-blank" size={16} color={colors.textSubtle} />
            <Text style={styles.needText}>{need}</Text>
          </View>
        ))}
      </View>
    </SectionCard>
  );
}

/** 되돌리기 어려운 작업 앞에 묻는다. */
export function ConfirmDialog({ open, title, body, confirmLabel, tone = 'primary', onConfirm, onCancel }: {
  open: boolean; title: string; body: string; confirmLabel: string;
  tone?: 'primary' | 'danger'; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text accessibilityRole="header" style={styles.dialogTitle}>{title}</Text>
          <Text style={styles.sectionBody}>{body}</Text>
          <View style={styles.dialogActions}>
            <AdminButton label="취소" tone="quiet" onPress={onCancel} />
            <AdminButton label={confirmLabel} tone={tone} onPress={onConfirm} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** 편집 폼의 한 구역. 무엇을 입력하는 곳인지 제목과 설명을 붙인다. */
export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <View style={styles.formSection}>
      <Text accessibilityRole="header" style={styles.formTitle}>{title}</Text>
      {description ? <Text style={styles.formDescription}>{description}</Text> : null}
      <View style={styles.formBody}>{children}</View>
    </View>
  );
}

export function LabeledValue({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.labeled}>
      <Text style={styles.labeledLabel}>{label}</Text>
      <Text style={styles.labeledValue}>{value}</Text>
      {hint ? <Text style={styles.labeledHint}>{hint}</Text> : null}
    </View>
  );
}

export function NumberField({ label, unit, value, onChange, hint }: {
  label: string; unit: string; value: string; onChange: (next: string) => void; hint?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldRow}>
        <TextInput
          accessibilityLabel={`${label} 입력`}
          value={value}
          onChangeText={onChange}
          inputMode="numeric"
          placeholder="0"
          placeholderTextColor={colors.textSubtle}
          style={styles.fieldInput}
        />
        <Text style={styles.fieldUnit}>{unit}</Text>
      </View>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

/** 접었다 펴는 고급 설정. 평소에는 닫혀 있어야 화면이 조용하다. */
export function Disclosure({ label, open, onToggle, children }: {
  label: string; open: boolean; onToggle: () => void; children: ReactNode;
}) {
  return (
    <View style={styles.disclosure}>
      <MotionPressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={styles.disclosureHead}
      >
        <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={18} color={colors.textMuted} />
        <Text style={styles.disclosureLabel}>{label}</Text>
      </MotionPressable>
      {open ? <View style={styles.disclosureBody}>{children}</View> : null}
    </View>
  );
}

/** 화면 맨 위에 두는 한 줄 알림. 지금 보고 있는 것의 한계를 숨기지 않는다. */
export function Notice({ tone = 'neutral', icon = 'info', children }: {
  tone?: keyof typeof tint; icon?: IconName; children: ReactNode;
}) {
  const palette = tint[tone];
  return (
    <View style={[styles.notice, { backgroundColor: palette.bg }]}>
      <MaterialIcons name={icon} size={16} color={palette.fg} />
      <Text style={[styles.noticeText, { color: palette.fg }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, flexWrap: 'wrap' },
  introCopy: { gap: 4, flex: 1, minWidth: 220 },
  introTitle: { ...type.section, color: colors.text },
  introBody: { ...type.bodySm, color: colors.textMuted },
  introActions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },

  button: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: size.touch, paddingHorizontal: spacing.md, borderRadius: radius.button },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { ...type.bodySmStrong },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.xs },
  kpiCard: { paddingHorizontal: spacing.xs, paddingBottom: spacing.sm },
  kpiInner: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.surfaceHigh, padding: spacing.md, gap: 6, ...shadow.card },
  kpiTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  kpiLabel: { ...type.bodySm, color: colors.textMuted, flexShrink: 1 },
  kpiIcon: { width: 28, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  kpiValue: { ...type.display, color: colors.text },
  kpiHint: { ...type.micro, color: colors.textSubtle },

  section: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.surfaceHigh, padding: spacing.md, gap: spacing.md },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  sectionCopy: { gap: 2, flex: 1, minWidth: 200 },
  sectionTitle: { ...type.cardTitle, color: colors.text },
  sectionBody: { ...type.bodySm, color: colors.textMuted, lineHeight: 20 },

  filterBar: { gap: spacing.sm },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: size.touch, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceLow, borderWidth: 1, borderColor: colors.surfaceHigh },
  searchInput: { flex: 1, ...type.bodySm, color: colors.text, paddingVertical: 0, outlineStyle: 'none' as never },
  clear: { padding: 4 },
  filterGroup: { gap: 4 },
  filterLabel: { ...type.micro, color: colors.textSubtle, letterSpacing: tracking.wide },
  filterChips: { gap: 6, paddingRight: spacing.sm },
  chip: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.surfaceContainer },
  chipActive: { backgroundColor: colors.primary },
  chipText: { ...type.bodySm, color: colors.textMuted },
  chipTextActive: { color: colors.onPrimary },

  table: { borderRadius: radius.cardSm, borderWidth: 1, borderColor: colors.surfaceHigh, overflow: 'hidden' },
  tableHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surfaceLow },
  tableHeadText: { ...type.micro, color: colors.textSubtle, letterSpacing: tracking.wide },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.hairline },
  tableCell: { justifyContent: 'center' },
  actionColumn: { width: 190, alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap' },
  cell: { ...type.bodySm, color: colors.textMuted },
  cellStrong: { ...type.bodySmStrong, color: colors.text },
  cellMuted: { ...type.micro, color: colors.textSubtle },

  cardList: { gap: spacing.sm },
  rowCard: { borderRadius: radius.cardSm, borderWidth: 1, borderColor: colors.surfaceHigh, padding: spacing.md, gap: 6, backgroundColor: colors.surface },
  rowCardLine: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  rowCardLabel: { ...type.micro, color: colors.textSubtle, width: 96 },
  rowCardValue: { flex: 1, alignItems: 'flex-start' },
  rowCardActions: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', paddingTop: 6 },

  empty: { alignItems: 'center', gap: 6, paddingVertical: spacing.xl, paddingHorizontal: spacing.md },
  emptyTitle: { ...type.bodyStrong, color: colors.text },
  emptyBody: { ...type.bodySm, color: colors.textMuted, textAlign: 'center' },

  notConnected: { gap: spacing.sm },
  needsTitle: { ...type.bodySmStrong, color: colors.text, paddingTop: 4 },
  needRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  needText: { ...type.bodySm, color: colors.textMuted, flex: 1, lineHeight: 20 },

  backdrop: { flex: 1, backgroundColor: 'rgba(28,27,34,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.md },
  dialog: { width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: radius.card, padding: spacing.lg, gap: spacing.sm },
  dialogTitle: { ...type.cardTitle, color: colors.text },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, paddingTop: spacing.sm },

  formSection: { gap: 6, paddingVertical: spacing.sm },
  formTitle: { ...type.bodyStrong, color: colors.text },
  formDescription: { ...type.bodySm, color: colors.textMuted },
  formBody: { gap: spacing.sm, paddingTop: 4 },

  labeled: { gap: 2, minWidth: 140 },
  labeledLabel: { ...type.micro, color: colors.textSubtle },
  labeledValue: { ...type.bodySmStrong, color: colors.text },
  labeledHint: { ...type.micro, color: colors.textSubtle },

  field: { gap: 4, minWidth: 160, flex: 1 },
  fieldLabel: { ...type.bodySmStrong, color: colors.text },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: size.touch, paddingHorizontal: spacing.md, borderRadius: radius.button, backgroundColor: colors.surfaceLow, borderWidth: 1, borderColor: colors.surfaceHigh },
  fieldInput: { flex: 1, ...type.bodySm, color: colors.text, paddingVertical: 0, outlineStyle: 'none' as never },
  fieldUnit: { ...type.bodySm, color: colors.textSubtle },
  fieldHint: { ...type.micro, color: colors.textSubtle },

  disclosure: { borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: spacing.sm },
  disclosureHead: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36 },
  disclosureLabel: { ...type.bodySmStrong, color: colors.textMuted },
  disclosureBody: { paddingTop: spacing.sm, gap: spacing.sm },

  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.cardSm },
  noticeText: { ...type.bodySm, flex: 1, lineHeight: 20 },
});
