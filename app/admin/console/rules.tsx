import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import { StatusPill } from '../../../components/StatusPill';
import { colors, radius, spacing, tint, type } from '../../../design/tokens';
import { AdminButton, ConfirmDialog, EmptyState, Notice, SectionCard } from '../../../features/adminPortal/ui/AdminKit';
import { ConsoleShell } from '../../../features/adminConsole/ConsoleShell';
import { Field, FieldGrid, ValidationBadge, WrapTabs } from '../../../features/adminConsole/ConsoleKit';
import type { ConsoleRule, ConsoleSnapshot, RuleReviewStatus } from '../../../features/adminConsole/contract';

const REVIEW_LABEL: Record<RuleReviewStatus, { label: string; tone: 'amber' | 'green' | 'neutral' }> = {
  PENDING: { label: '검토 대기', tone: 'amber' },
  APPROVED: { label: '승인', tone: 'green' },
  REJECTED: { label: '반려', tone: 'neutral' },
};

/** 규칙 검토: 목록 ↔ 상세 + 원문 근거. 승인·반려는 확인 단계를 거친다. */
export default function ConsoleRules() {
  return (
    <ConsoleShell
      menuKey="rules"
      title="규칙 패키지 검토"
      subtitle="추출된 규칙과 원문 근거를 확인해요. 실제 승인 작업은 기존 검수 콘솔에서 진행합니다."
      testID="console-rules"
      needs={['규칙 목록(유형·공급유형·조건·값·근거 문장·locator·검증 결과)', '승인/반려 API(감사 로그 기록)']}
    >
      {(snapshot, mode) => <Rules snapshot={snapshot} demoMode={mode === 'DEMO'} />}
    </ConsoleShell>
  );
}

function Rules({ snapshot, demoMode }: { snapshot: ConsoleSnapshot; demoMode: boolean }) {
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const { width } = useWindowDimensions();
  const side = width >= 1100;
  const noticeIds = [...new Set(snapshot.rules.map(rule => rule.noticeId))];
  const [noticeId, setNoticeId] = useState<string>(notice && noticeIds.includes(notice) ? notice : noticeIds[0] ?? '');
  // 예시 모드에서만 화면 안 상태로 승인·반려를 반영한다(저장하지 않음).
  const [overrides, setOverrides] = useState<Record<string, RuleReviewStatus>>({});
  const rules = useMemo(() => snapshot.rules.filter(rule => rule.noticeId === noticeId).map(rule => ({ ...rule, status: overrides[rule.id] ?? rule.status })), [noticeId, overrides, snapshot.rules]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = rules.find(rule => rule.id === selectedId) ?? rules[0] ?? null;
  const [confirm, setConfirm] = useState<null | { rule: ConsoleRule; next: RuleReviewStatus }>(null);
  const [done, setDone] = useState<string | null>(null);
  const titleOf = (id: string) => snapshot.notices.find(item => item.id === id)?.title ?? id;

  if (!noticeIds.length) return <EmptyState title="검토할 규칙이 없어요" body="새 공고의 규칙이 추출되면 여기에 보여요." />;
  const list = (
    <SectionCard title={`규칙 ${rules.length}건`} description={`검토 대기 ${rules.filter(rule => rule.status === 'PENDING').length}건`}>
      <View testID="console-rule-list" style={styles.list}>
        {rules.map(rule => {
          const on = selected?.id === rule.id;
          return (
            <MotionPressable key={rule.id} testID={`console-rule-${rule.id}`} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${rule.ruleType} ${rule.condition}`} onPress={() => setSelectedId(rule.id)} style={[styles.ruleRow, on && styles.ruleRowOn]}>
              <View style={styles.ruleCopy}>
                <Text style={styles.ruleTitle} numberOfLines={1}>{rule.ruleType} · {rule.supplyType}</Text>
                <Text style={styles.ruleMeta} numberOfLines={2}>{rule.condition} {rule.value}</Text>
              </View>
              <View style={styles.ruleBadges}>
                <StatusPill label={REVIEW_LABEL[rule.status].label} tone={REVIEW_LABEL[rule.status].tone} />
                {rule.validation.status !== 'PASS' ? <StatusPill label={rule.validation.status === 'FAIL' ? '검증 실패' : '확인 필요'} tone={rule.validation.status === 'FAIL' ? 'pink' : 'amber'} /> : null}
              </View>
            </MotionPressable>
          );
        })}
      </View>
    </SectionCard>
  );
  const detail = selected ? (
    <SectionCard title="규칙 상세" description={titleOf(selected.noticeId)}>
      <View testID="console-rule-detail" style={styles.detail}>
        <FieldGrid>
          <Field label="규칙 유형" value={selected.ruleType} />
          <Field label="공급유형" value={selected.supplyType} />
          <Field label="조건" value={selected.condition} />
          <Field label="값" value={selected.value} />
          <Field label="검증"><View style={styles.validation}><ValidationBadge validation={selected.validation} />{selected.validation.messages.map(message => <Text key={message} style={styles.meta}>· {message}</Text>)}</View></Field>
          <Field label="검토 상태"><StatusPill label={REVIEW_LABEL[selected.status].label} tone={REVIEW_LABEL[selected.status].tone} /></Field>
        </FieldGrid>
        <View style={styles.evidence} testID="console-rule-evidence">
          <Text style={styles.evidenceTitle}>원문 근거 · {selected.evidence.section}</Text>
          <Text style={styles.excerpt} selectable>{selected.evidence.excerpt}</Text>
          <Text style={styles.locator} selectable>locator: {selected.evidence.locator}</Text>
        </View>
        {done ? <Notice tone="green" icon="check-circle">{done}</Notice> : null}
        <View style={styles.actions}>
          <AdminButton label="반려" tone="danger" icon="block" disabled={!demoMode || selected.status !== 'PENDING'} onPress={() => setConfirm({ rule: selected, next: 'REJECTED' })} />
          <AdminButton label="승인" icon="check" disabled={!demoMode || selected.status !== 'PENDING' || selected.validation.status === 'FAIL'} onPress={() => setConfirm({ rule: selected, next: 'APPROVED' })} />
        </View>
        {selected.validation.status === 'FAIL' && selected.status === 'PENDING' ? <Text style={styles.meta}>검증 실패 규칙은 원문을 다시 확인한 뒤 수정해야 승인할 수 있어요.</Text> : null}
      </View>
    </SectionCard>
  ) : null;

  return (
    <View style={styles.stack}>
      <WrapTabs testID="console-rule-notice" active={noticeId} onChange={id => { setNoticeId(id); setSelectedId(null); setDone(null); }} tabs={noticeIds.map(id => ({ key: id, label: titleOf(id) }))} />
      <View style={[styles.split, side && styles.splitSide]}>
        <View style={side ? styles.listCol : null}>{list}</View>
        <View style={side ? styles.detailCol : null}>{detail}</View>
      </View>
      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.next === 'APPROVED' ? '이 규칙을 승인할까요?' : '이 규칙을 반려할까요?'}
        body={confirm ? `${confirm.rule.ruleType} · ${confirm.rule.condition} ${confirm.rule.value}\n예시 데이터의 화면 상태만 바뀌며 저장되지 않아요.` : ''}
        confirmLabel={confirm?.next === 'APPROVED' ? '승인' : '반려'}
        tone={confirm?.next === 'APPROVED' ? 'primary' : 'danger'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm || !demoMode) return;
          setOverrides(current => ({ ...current, [confirm.rule.id]: confirm.next }));
          setDone(`${confirm.next === 'APPROVED' ? '승인' : '반려'}했어요 (예시 데이터 · 저장 안 됨)`);
          setConfirm(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  split: { gap: spacing.md },
  splitSide: { flexDirection: 'row', alignItems: 'flex-start' },
  listCol: { flex: 1, minWidth: 0 },
  detailCol: { flex: 1.3, minWidth: 0 },
  list: { gap: 6 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, padding: 10, borderRadius: radius.cardSm, borderWidth: 1, borderColor: colors.surfaceContainer, flexWrap: 'wrap' },
  ruleRowOn: { borderColor: colors.primary, backgroundColor: tint.purple.bg },
  ruleCopy: { flex: 1, minWidth: 160, gap: 2 },
  ruleTitle: { ...type.bodySmStrong, color: colors.text },
  ruleMeta: { ...type.caption, color: colors.textMuted },
  ruleBadges: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  detail: { gap: spacing.md },
  validation: { gap: 2 },
  meta: { ...type.caption, color: colors.textMuted },
  evidence: { gap: 4, padding: spacing.sm, borderRadius: radius.cardSm, backgroundColor: colors.surfaceContainer },
  evidenceTitle: { ...type.label, color: colors.textMuted },
  excerpt: { ...type.body, color: colors.text },
  locator: { fontFamily: 'monospace', fontSize: 12, lineHeight: 18, color: colors.textMuted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-end' },
});
