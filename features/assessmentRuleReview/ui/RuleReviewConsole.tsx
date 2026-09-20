import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import { colors, radius, size, spacing, type } from '../../../design/tokens';
import { RuleDetailPanel } from './RuleDetailPanel';
import { approvalBlockReasons, PRIORITY_LABEL, SOURCE_STATUS_LABEL, SUPPLY_GROUP_LABEL, supplyGroupOf } from './reviewLabels';
import { useRuleReviewWorkspace } from './useRuleReviewWorkspace';
import { reviewProgressPresentation, reviewStatusPresentation } from './reviewPresentation';
import type { RuleListItemDto } from '../server/dto';
import type { RuleReviewWorkspace } from '../server/types';
import type { RuleReviewRepositoryLike } from '../repository/RuleReviewRepository';

const REASON = '관리자 검수 콘솔에서 확인';

export function RuleReviewConsole({ onBack, repository, persistence = 'local' }: { onBack: () => void; repository: RuleReviewRepositoryLike; persistence?: 'local' | 'staging' }) {
  const { workspace, summary, gate, rules, detail, actions, loading, saving, lastError, lastDone, lastDoneTone, clearFeedback } = useRuleReviewWorkspace(repository);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [onlyBlocking, setOnlyBlocking] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);
  const onDirtyChange = useCallback((value: boolean) => setDirty(value), []);

  /** Moving away from a half-finished edit asks first instead of dropping the change. */
  const selectRule = (ruleId: string) => {
    if (dirty && ruleId !== selectedId) { setPendingSelection(ruleId); return; }
    setSelectedId(ruleId);
  };
    // Static export renders without a viewport; widening only after mount keeps
  // the server and client markup identical and avoids a hydration mismatch.
  const width = useWindowDimensions().width;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const wide = mounted && width >= 1024;

  if (loading || !workspace || !summary || !gate) return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="Rule 검수 콘솔" onBack={onBack} />
      <View style={styles.loading}><Text style={styles.empty}>{lastError ? `검수 데이터를 불러오지 못했어요: ${lastError}` : '검수 데이터를 불러오는 중이에요.'}</Text></View>
    </SafeAreaView>
  );

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
  const criticalCount = all.filter(item => item.priority === 'CRITICAL_BLOCKER').length;
  const progress = reviewProgressPresentation(summary, workspace.lifecycleStatus, gate.blockers.length, criticalCount);

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
            {persistence === 'staging' ? 'Staging 검수 저장소에 연결되어 있어요. 모든 결정은 revision과 감사 로그를 포함해 저장됩니다.' : '개발용 로컬 콘솔이에요. 검수 결정은 이 페이지 안에서만 유지되고 원격 DB에 저장되지 않아요.'}
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
        {revalidation ? (
          <View style={styles.lifecycleContext}>
            <Badge tone="REVIEW_REQUIRED" text="재검수 중" />
            <Text style={styles.lifecycleContextText}>이전 검수 결정은 현재 공고문에 대한 승인이 아닙니다.</Text>
          </View>
        ) : null}

        {/* rule 수보다 위험 수를 먼저 읽게 한다. */}
        <View style={styles.riskRow}>
          <Risk tone="critical" value={summary.criticalPending} label="critical 검수 대기" />
          <Risk tone="critical" value={summary.conflicts} label="기준 충돌" />
          <Risk tone="critical" value={summary.orphanExceptions} label="연결 안 된 예외" />
          <Risk tone="warn" value={summary.unresolved} label="미해결 항목" />
          <Risk tone="warn" value={revalidation ? summary.totalRules : summary.pending} label={revalidation ? '재확인 필요' : '검수 필요'} />
          <Risk tone={revalidation ? 'warn' : 'ok'} value={summary.approved + summary.edited} label={revalidation ? '이전 문서 승인' : '승인 완료'} />
        </View>

        {/* 퍼센트 하나로 뭉치지 않는다. 남은 개수를 종류별로 센다. */}
        <View style={styles.progress}>
          <Text accessibilityRole="header" style={styles.progressTitle}>
            {progress.heading}
          </Text>
          <Text style={styles.progressLine}>{progress.primaryLine}</Text>
          <Text style={styles.progressLine}>{progress.decisionLine}</Text>
        </View>

        <ActivationPanel gate={gate} />

        {/* 미해결 항목은 근거 없이 체크로 지우지 못하게 사유를 입력받는다. */}
        {workspace.unresolvedItems.length ? (
          <View style={styles.unresolved}>
            <Text accessibilityRole="header" style={styles.sectionHeading}>공고에서 확정되지 않은 항목</Text>
            {workspace.unresolvedItems.map(item => (
              <UnresolvedRow key={item.unresolvedId} item={item} locked={notStarted || revalidation} onResolve={actions.resolveUnresolved} />
            ))}
          </View>
        ) : null}

        {notStarted ? (
          <Action label="검수 시작하기" tone="primary" disabled={saving} onPress={() => actions.startReview(REASON)} />
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

        {/*
          조용히 바뀌지 않게 하되, 자리를 늘 비워 둔다. 알림이 나타나면서 아래 내용이
          밀리면 방금 누르려던 버튼이 옮겨가 오클릭이 난다.
        */}
        <View style={styles.feedbackSlot}>
          {lastError ? (
            <View style={styles.feedbackBad}>
              <Text accessibilityRole="alert" style={styles.feedbackBadText}>
                {lastError === 'STALE_REVIEW_REVISION'
                  ? '다른 검수자가 먼저 수정했습니다. 최신 내용을 다시 불러왔어요. 입력하던 내용은 그대로 두었으니 확인 후 다시 저장해 주세요.'
                  : `처리하지 않았어요: ${lastError}`}
              </Text>
              <Action label="닫기" onPress={clearFeedback} />
            </View>
          ) : lastDone ? (
            <View style={lastDoneTone === 'warning' ? styles.feedbackWarn : styles.feedbackOk}>
              <Text accessibilityRole="alert" style={lastDoneTone === 'warning' ? styles.feedbackWarnText : styles.feedbackOkText}>{lastDone}</Text>
              <Action label="닫기" onPress={clearFeedback} />
            </View>
          ) : (
            <Text style={styles.feedbackIdle}>검수 결정을 하면 결과를 여기에서 알려드려요.</Text>
          )}
        </View>

        {pendingSelection ? (
          <View style={styles.dirtyDialog}>
            <Text accessibilityRole="header" style={styles.dirtyTitle}>저장되지 않은 변경이 있어요</Text>
            <Text style={styles.dirtyBody}>다른 rule로 이동하면 지금 고치던 내용이 사라져요.</Text>
            <View style={styles.actionRow}>
              <Action label="변경 버리고 이동" tone="danger"
                onPress={() => { setDirty(false); setSelectedId(pendingSelection); setPendingSelection(null); }} />
              <Action label="여기 남기" onPress={() => setPendingSelection(null)} />
            </View>
          </View>
        ) : null}

        {/* 검수 상태를 실제로 만들어 보기 위한 dev 전용 진입점. 운영 동작이 아니다. */}
        <View style={styles.scenarioRow}>
          <Text style={styles.scenarioLabel}>검수 상태 재현</Text>
          <Action label="다른 검수자가 먼저 저장한 상황" disabled={notStarted || revalidation}
            onPress={() => actions.simulateStaleRevision(all[0]?.ruleId ?? '')} />
          <Action label="공고문이 바뀐 상황" disabled={revalidation}
            onPress={() => actions.invalidateDocument('a'.repeat(63) + '1', '공고문 교체 재현')} />
        </View>

        <View style={[styles.split, wide && styles.splitWide]}>
          <View style={[styles.column, wide && styles.listColumn]}>
            {grouped.map(([group, items]) => (
              <View key={group} style={styles.group}>
                <Text accessibilityRole="header" style={styles.groupTitle}>{SUPPLY_GROUP_LABEL[group] ?? group} · {items.length}건</Text>
                {items.map(item => {
                  const presentation = reviewStatusPresentation(item.reviewStatus, workspace.lifecycleStatus);
                  return (
                  <MotionPressable
                    key={item.ruleId} accessibilityRole="button" accessibilityState={{ selected: selectedId === item.ruleId }}
                    onPress={() => selectRule(item.ruleId)} style={[styles.row, ROW_TONE[item.priority], selectedId === item.ruleId && styles.rowOn]}
                  >
                    <Text style={styles.rowLabel}>{item.ruleLabel}</Text>
                    <View style={styles.rowMeta}>
                      <Badge tone={item.priority} text={PRIORITY_LABEL[item.priority]} />
                      <Badge tone={presentation.tone} text={presentation.currentLabel} />
                      {presentation.previousLabel ? <Badge tone="plain" text={presentation.previousLabel} /> : null}
                      {item.critical ? <Badge tone="plain" text="critical" /> : null}
                      {item.hasConflict ? <Badge tone="CRITICAL_BLOCKER" text="충돌" /> : null}
                      {item.hasException ? <Badge tone="REVIEW_REQUIRED" text="예외" /> : null}
                    </View>
                  </MotionPressable>
                  );
                })}
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
                revalidation={revalidation}
                actions={actions}
                onDirtyChange={onDirtyChange}
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

function ActivationPanel({ gate }: { gate: NonNullable<ReturnType<typeof useRuleReviewWorkspace>['gate']> }) {
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
      <Text style={styles.activationBody}>운영 DB 연결 후 활성화할 수 있어요.</Text>
    </View>
  );
}

/** Resolving a note needs a written reason; a bare checkbox would erase the finding. */
function UnresolvedRow({ item, locked, onResolve }: {
  item: RuleReviewWorkspace['unresolvedItems'][number];
  locked: boolean;
  onResolve: (unresolvedId: string, resolution: string, reason: string) => unknown;
}) {
  const [note, setNote] = useState('');
  const resolved = item.resolution !== null;
  return (
    <View style={styles.unresolvedRow}>
      <View style={styles.unresolvedHead}>
        <Badge tone={resolved ? 'NORMAL' : 'CRITICAL_BLOCKER'} text={resolved ? '처리됨' : '확인 필요'} />
        <Text style={styles.unresolvedText}>{item.description}</Text>
      </View>
      {resolved ? (
        <Text style={styles.unresolvedResolution}>처리 내용: {item.resolution}</Text>
      ) : (
        <>
          <TextInput
            accessibilityLabel={`${item.description} 검토 메모`} style={styles.unresolvedInput}
            value={note} onChangeText={setNote} editable={!locked}
            placeholder="어떻게 확인했는지 적어 주세요" placeholderTextColor={colors.textSubtle}
          />
          {!note.trim() ? <Text style={styles.unresolvedHint}>검토 메모를 적어야 처리할 수 있어요.</Text> : null}
          <View style={styles.actionRow}>
            <Action label="확인 완료로 처리" disabled={locked || !note.trim()}
              onPress={() => onResolve(item.unresolvedId, note.trim(), '관리자 검수 콘솔에서 확인')} />
            <Action label="보류로 남기기" disabled={locked || !note.trim()}
              onPress={() => onResolve(item.unresolvedId, `보류 · ${note.trim()}`, '관리자 검수 콘솔에서 확인')} />
          </View>
        </>
      )}
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
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
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
  lifecycleContext: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  lifecycleContextText: { ...type.bodySmStrong, color: '#8A4900', flexShrink: 1 },
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
  progress: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceHigh, borderRadius: radius.cardSm, padding: spacing.sm, gap: 2 },
  progressTitle: { ...type.section, color: colors.text },
  progressLine: { ...type.bodySm, color: colors.textMuted },
  sectionHeading: { ...type.bodySmStrong, color: colors.text },
  unresolved: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceHigh, borderRadius: radius.cardSm, padding: spacing.sm, gap: spacing.sm },
  unresolvedRow: { gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: spacing.xs },
  unresolvedHead: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start', flexWrap: 'wrap' },
  unresolvedText: { ...type.bodySm, color: colors.text, flexShrink: 1 },
  unresolvedResolution: { ...type.bodySm, color: colors.textMuted },
  unresolvedInput: { ...type.bodySm, color: colors.text, borderWidth: 1, borderColor: colors.outline, borderRadius: radius.button, minHeight: size.control, paddingHorizontal: spacing.sm },
  unresolvedHint: { ...type.caption, color: colors.error },
  feedbackSlot: { minHeight: 56, justifyContent: 'center' },
  feedbackIdle: { ...type.bodySm, color: colors.textSubtle },
  feedbackOk: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', backgroundColor: '#D6EFE0', borderRadius: radius.cardSm, padding: spacing.sm },
  feedbackOkText: { ...type.bodySmStrong, color: colors.success, flex: 1 },
  feedbackWarn: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', backgroundColor: '#FFDCC3', borderRadius: radius.cardSm, padding: spacing.sm },
  feedbackWarnText: { ...type.bodySmStrong, color: '#8A4900', flex: 1 },
  feedbackBad: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', backgroundColor: '#FFDAD6', borderRadius: radius.cardSm, padding: spacing.sm },
  feedbackBadText: { ...type.bodySm, color: '#93000A', flex: 1 },
  dirtyDialog: { borderRadius: radius.cardSm, borderWidth: 1, borderColor: colors.warning, backgroundColor: '#FFDCC3', padding: spacing.sm, gap: spacing.xs },
  dirtyTitle: { ...type.bodySmStrong, color: '#8A4900' },
  dirtyBody: { ...type.bodySm, color: colors.textMuted },
  scenarioRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center' },
  scenarioLabel: { ...type.caption, color: colors.textSubtle },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center' },
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
