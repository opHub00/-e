import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import { colors, radius, size, spacing, type } from '../../../design/tokens';
import { RuleDetailPanel } from './RuleDetailPanel';
import { approvalBlockReasons, PRIORITY_LABEL, REVIEW_STATUS_LABEL, SOURCE_STATUS_LABEL, SUPPLY_GROUP_LABEL, supplyGroupOf } from './reviewLabels';
import { useRuleReviewWorkspace } from './useRuleReviewWorkspace';
import type { RuleListItemDto } from '../server/dto';

const REASON = '관리자 검수 콘솔에서 확인';

export function RuleReviewConsole({ onBack }: { onBack: () => void }) {
  const { workspace, summary, gate, rules, detail, actions, lastError } = useRuleReviewWorkspace();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [onlyBlocking, setOnlyBlocking] = useState(false);
    // Static export renders without a viewport; widening only after mount keeps
  // the server and client markup identical and avoids a hydration mismatch.
  const width = useWindowDimensions().width;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const wide = mounted && width >= 1024;

  const all = rules({});
  const visible = onlyBlocking ? all.filter(item => item.priority === 'CRITICAL_BLOCKER') : all;
  const grouped = useMemo(() => {
    const groups = new Map<string, RuleListItemDto[]>();
    for (const item of visible) {
      const key = supplyGroupOf(item);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups.entries()];
  }, [visible]);

  const selected = selectedId && workspace.rules.some(rule => rule.ruleId === selectedId) ? detail(selectedId) : null;
  const selectedRecord = selectedId ? workspace.rules.find(rule => rule.ruleId === selectedId) ?? null : null;
  const revalidation = workspace.lifecycleStatus === 'REVALIDATION_REQUIRED';
  const notStarted = workspace.lifecycleStatus === 'PENDING_REVIEW';

  // The service refuses unsafe bulk approval; the console offers only what it would accept.
  const bulkTargets = all.filter(item => item.priority === 'NORMAL' && !item.critical && !item.hasConflict && !item.hasException && !item.hasWarning);
  const bulkBlockedBy = [
    summary.conflicts ? `충돌 ${summary.conflicts}건` : null,
    summary.orphanExceptions ? `연결 안 된 예외 ${summary.orphanExceptions}건` : null,
    summary.criticalPending ? `critical 검수 대기 ${summary.criticalPending}건` : null,
  ].filter(Boolean) as string[];

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="Rule 검수 콘솔" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.banner}>
          <MaterialIcons name="science" size={16} color={colors.warning} />
          <Text style={styles.bannerText}>
            관리자 인증과 운영 DB가 연결되기 전의 콘솔이에요. 검수 결정은 이 페이지 안에서만 유지되고 저장되지 않아요.
          </Text>
        </View>

        {/* 공고문이 바뀐 상태를 승인된 검수처럼 보이게 두지 않는다. */}
        {revalidation ? (
          <View style={styles.revalidate}>
            <Text accessibilityRole="header" style={styles.revalidateTitle}>공고문이 변경되어 기존 검수를 다시 확인해야 합니다</Text>
            <Text style={styles.revalidateBody}>
              문서 hash가 검수 시점과 달라졌어요. 이전 승인은 새 문서에 대한 승인이 아니며, 새 rule version으로 다시 검수해야 활성화할 수 있어요.
            </Text>
          </View>
        ) : null}

        <Text accessibilityRole="header" style={styles.title}>{summary.announcement.title}</Text>
        <Text style={styles.meta}>
          {SOURCE_STATUS_LABEL[summary.sourceStatus]} · {summary.document.versionLabel} · rule {summary.totalRules}개 · revision {summary.ruleVersion.revision}
        </Text>
        <Text style={styles.metaFaint}>문서 {summary.document.fileName} · sha256 {workspace.currentDocumentHash.slice(0, 12)}…</Text>

        {/* rule 수보다 위험 수를 먼저 읽게 한다. */}
        <View style={styles.riskRow}>
          <Risk tone="critical" value={summary.criticalPending} label="critical 검수 대기" />
          <Risk tone="critical" value={summary.conflicts} label="기준 충돌" />
          <Risk tone="critical" value={summary.orphanExceptions} label="연결 안 된 예외" />
          <Risk tone="warn" value={summary.unresolved} label="미해결 항목" />
          <Risk tone="warn" value={summary.pending} label="검수 필요" />
          <Risk tone="ok" value={summary.approved + summary.edited} label="승인 완료" />
        </View>

        <ActivationPanel gate={gate} />

        {notStarted ? (
          <Action label="검수 시작하기" tone="primary" onPress={() => actions.startReview(REASON)} />
        ) : null}

        <View style={styles.bulkRow}>
          <Action
            label={`근거 명확 ${bulkTargets.length}건 한 번에 승인`}
            disabled={notStarted || revalidation || bulkBlockedBy.length > 0 || bulkTargets.length === 0}
            onPress={() => actions.bulkApproveSafe(bulkTargets.map(item => item.ruleId), REASON)}
          />
          {bulkBlockedBy.length ? (
            <Text style={styles.bulkWhy}>{bulkBlockedBy.join(' · ')}이 포함되어 있어 한 번에 승인할 수 없어요. 개별로 확인해 주세요.</Text>
          ) : null}
        </View>

        <MotionPressable
          accessibilityRole="button" accessibilityState={{ selected: onlyBlocking }}
          onPress={() => setOnlyBlocking(value => !value)} style={[styles.filter, onlyBlocking && styles.filterOn]}
        >
          <Text style={[styles.filterText, onlyBlocking && styles.filterTextOn]}>
            {onlyBlocking ? '전체 rule 보기' : '반드시 확인만 보기'}
          </Text>
        </MotionPressable>

        {lastError ? <Text accessibilityRole="alert" style={styles.error}>처리하지 않았어요: {lastError}</Text> : null}

        <View style={[styles.split, wide && styles.splitWide]}>
          <View style={[styles.column, wide && styles.listColumn]}>
            {grouped.map(([group, items]) => (
              <View key={group} style={styles.group}>
                <Text accessibilityRole="header" style={styles.groupTitle}>{SUPPLY_GROUP_LABEL[group] ?? group} · {items.length}건</Text>
                {items.map(item => (
                  <MotionPressable
                    key={item.ruleId} accessibilityRole="button" accessibilityState={{ selected: selectedId === item.ruleId }}
                    onPress={() => setSelectedId(item.ruleId)} style={[styles.row, ROW_TONE[item.priority], selectedId === item.ruleId && styles.rowOn]}
                  >
                    <Text style={styles.rowLabel}>{item.ruleLabel}</Text>
                    <View style={styles.rowMeta}>
                      <Badge tone={item.priority} text={PRIORITY_LABEL[item.priority]} />
                      <Badge tone="plain" text={REVIEW_STATUS_LABEL[item.reviewStatus]} />
                      {item.critical ? <Badge tone="plain" text="critical" /> : null}
                      {item.hasConflict ? <Badge tone="CRITICAL_BLOCKER" text="충돌" /> : null}
                      {item.hasException ? <Badge tone="REVIEW_REQUIRED" text="예외" /> : null}
                    </View>
                  </MotionPressable>
                ))}
              </View>
            ))}
            {visible.length === 0 ? <Text style={styles.empty}>이 조건에 해당하는 rule이 없어요.</Text> : null}
          </View>

          <View style={[styles.column, wide && styles.detailColumn]}>
            {selected && selectedRecord ? (
              <RuleDetailPanel
                detail={selected}
                record={selectedRecord}
                workspace={workspace}
                blockReasons={approvalBlockReasons(selectedRecord, workspace, gate)}
                locked={notStarted || revalidation}
                actions={actions}
              />
            ) : (
              <Text style={styles.empty}>왼쪽에서 rule을 선택하면 원문과 AI 해석을 나란히 확인할 수 있어요.</Text>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ActivationPanel({ gate }: { gate: ReturnType<typeof useRuleReviewWorkspace>['gate'] }) {
  const eligible = gate.status === 'ACTIVATION_ELIGIBLE';
  return (
    <View style={[styles.activation, eligible ? styles.activationOk : styles.activationBlocked]}>
      <Text accessibilityRole="header" style={[styles.activationTitle, { color: eligible ? colors.success : colors.error }]}>
        {eligible ? '활성화 가능' : gate.status === 'REVALIDATION_REQUIRED' ? '활성화할 수 없음 · 재검수 필요' : '활성화할 수 없음'}
      </Text>
      {eligible ? (
        <Text style={styles.activationBody}>모든 검수 항목이 해결됐어요. 실제 활성화는 운영 backend 연결 후에 가능해요.</Text>
      ) : (
        <>
          <Text style={styles.activationBody}>남은 차단 사유 {gate.blockers.length}건</Text>
          {gate.blockers.slice(0, 6).map(blocker => (
            <Text key={`${blocker.code}:${blocker.ruleId ?? blocker.conflictId ?? blocker.unresolvedId ?? ''}`} style={styles.blocker}>
              • [{blocker.code}] {blocker.message}
            </Text>
          ))}
          {gate.blockers.length > 6 ? <Text style={styles.blocker}>… 외 {gate.blockers.length - 6}건</Text> : null}
        </>
      )}
      <Action label="rule version 활성화" disabled onPress={() => undefined} />
      <Text style={styles.activationBody}>활성화 버튼은 운영 backend 연결 전까지 비활성 상태로 둡니다.</Text>
    </View>
  );
}

function Risk({ value, label, tone }: { value: number; label: string; tone: 'critical' | 'warn' | 'ok' }) {
  const color = tone === 'critical' ? colors.error : tone === 'warn' ? colors.warning : colors.success;
  return (
    <View style={[styles.risk, { borderLeftColor: value > 0 ? color : colors.outline }]}>
      <Text style={[styles.riskValue, { color: value > 0 ? color : colors.textSubtle }]}>{value}</Text>
      <Text style={styles.riskLabel}>{label}</Text>
    </View>
  );
}

export function Badge({ text, tone }: { text: string; tone: string }) {
  return (
    <View style={[styles.badge, BADGE_TONE[tone] ?? styles.badgePlain]}>
      <Text style={[styles.badgeText, BADGE_TEXT[tone] ?? styles.badgeTextPlain]}>{text}</Text>
    </View>
  );
}

export function Action({ label, onPress, disabled, tone }: { label: string; onPress: () => void; disabled?: boolean; tone?: 'primary' | 'danger' }) {
  return (
    <MotionPressable
      accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
      style={[styles.action, tone === 'primary' && styles.actionPrimary, tone === 'danger' && styles.actionDanger, disabled && styles.actionOff]}
    >
      <Text style={[styles.actionText, tone === 'primary' && styles.actionTextPrimary, tone === 'danger' && styles.actionTextDanger]}>{label}</Text>
    </MotionPressable>
  );
}

const ROW_TONE: Record<string, object> = {
  CRITICAL_BLOCKER: { borderLeftColor: colors.error },
  REVIEW_REQUIRED: { borderLeftColor: colors.warning },
  NORMAL: { borderLeftColor: colors.success },
};
const BADGE_TONE: Record<string, object> = {
  CRITICAL_BLOCKER: { backgroundColor: '#FFDAD6', borderColor: colors.error },
  REVIEW_REQUIRED: { backgroundColor: '#FFDCC3', borderColor: colors.warning },
  NORMAL: { backgroundColor: '#D6EFE0', borderColor: colors.success },
};
const BADGE_TEXT: Record<string, object> = {
  CRITICAL_BLOCKER: { color: '#93000A' }, REVIEW_REQUIRED: { color: '#8A4900' }, NORMAL: { color: colors.success },
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { width: '100%', maxWidth: 1240, alignSelf: 'center', padding: spacing.screen, paddingBottom: spacing.xl, gap: spacing.md },
  banner: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', backgroundColor: colors.surfaceLow, borderRadius: radius.cardSm, padding: spacing.sm },
  bannerText: { ...type.bodySm, color: colors.textMuted, flex: 1 },
  revalidate: { borderRadius: radius.cardSm, borderWidth: 1, borderColor: colors.error, backgroundColor: '#FFDAD6', padding: spacing.md, gap: spacing.xs },
  revalidateTitle: { ...type.bodyLgStrong, color: '#93000A' },
  revalidateBody: { ...type.bodySm, color: colors.textMuted },
  title: { ...type.page, color: colors.text },
  meta: { ...type.body, color: colors.textMuted },
  metaFaint: { ...type.caption, color: colors.textSubtle },
  riskRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  risk: { minWidth: 132, flexGrow: 1, flexBasis: 132, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceHigh, borderLeftWidth: 4, borderRadius: radius.cardSm, padding: spacing.sm },
  riskValue: { ...type.headline },
  riskLabel: { ...type.bodySm, color: colors.textMuted },
  activation: { borderRadius: radius.cardSm, borderWidth: 1, padding: spacing.md, gap: spacing.xs },
  activationOk: { borderColor: colors.success, backgroundColor: '#D6EFE0' },
  activationBlocked: { borderColor: colors.error, backgroundColor: colors.surface },
  activationTitle: { ...type.section },
  activationBody: { ...type.bodySm, color: colors.textMuted },
  blocker: { ...type.bodySm, color: colors.text },
  bulkRow: { gap: spacing.xs },
  bulkWhy: { ...type.bodySm, color: colors.error },
  filter: { alignSelf: 'flex-start', minHeight: size.touch, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.outline, paddingHorizontal: spacing.md },
  filterOn: { backgroundColor: colors.lavender, borderColor: colors.primary },
  filterText: { ...type.bodySm, color: colors.text }, filterTextOn: { color: colors.primary },
  error: { ...type.bodySm, color: colors.error },
  split: { gap: spacing.md },
  splitWide: { flexDirection: 'row', alignItems: 'flex-start' },
  column: { gap: spacing.md, minWidth: 0 },
  listColumn: { flexBasis: 400, flexGrow: 0, flexShrink: 0 },
  detailColumn: { flex: 1, minWidth: 0 },
  group: { gap: spacing.xs },
  groupTitle: { ...type.bodySmStrong, color: colors.textSubtle },
  row: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceHigh, borderLeftWidth: 4, borderRadius: radius.cardSm, padding: spacing.sm, gap: spacing.xs, minHeight: size.touch },
  rowOn: { borderColor: colors.primary, backgroundColor: colors.lavender },
  rowLabel: { ...type.bodyStrong, color: colors.text },
  rowMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  badge: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 1 },
  badgePlain: { borderColor: colors.outline, backgroundColor: colors.surfaceLow },
  badgeText: { ...type.caption }, badgeTextPlain: { color: colors.textMuted },
  empty: { ...type.body, color: colors.textMuted },
  action: { minHeight: size.touch, justifyContent: 'center', alignSelf: 'flex-start', borderRadius: radius.button, borderWidth: 1, borderColor: colors.outline, paddingHorizontal: spacing.md, backgroundColor: colors.surface },
  actionPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionDanger: { borderColor: colors.error },
  actionOff: { opacity: 0.4 },
  actionText: { ...type.bodySmStrong, color: colors.text },
  actionTextPrimary: { color: colors.onPrimary },
  actionTextDanger: { color: colors.error },
});
