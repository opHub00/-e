import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MotionPressable } from '../../../components/motion/MotionPressable';
import { StatusPill } from '../../../components/StatusPill';
import { colors, radius, spacing, tint, type } from '../../../design/tokens';
import { AdminButton, ConfirmDialog, EmptyState, Notice, SectionCard } from '../../../features/adminPortal/ui/AdminKit';
import { ConsoleShell } from '../../../features/adminConsole/ConsoleShell';
import { Field, FieldGrid, FilterDisclosure, FilterGroup, MoreButton, NoticePicker, SearchField, ToggleChip, ValidationBadge } from '../../../features/adminConsole/ConsoleKit';
import {
  changeDataAvailable, DEFAULT_RULE_FILTERS, evidenceMissing, filterRules, formatLocator, PAGE_SIZE, type RuleFilters,
} from '../../../features/adminConsole/consoleModel';
import { emptyCopy } from '../../../features/adminConsole/consoleState';
import type { ConsoleRule, ConsoleSnapshot, RuleReviewStatus } from '../../../features/adminConsole/contract';

const REVIEW_LABEL: Record<RuleReviewStatus, { label: string; tone: 'amber' | 'green' | 'neutral'; icon: 'pending' | 'check-circle' | 'block' }> = {
  PENDING: { label: '검토 대기', tone: 'amber', icon: 'pending' },
  APPROVED: { label: '승인', tone: 'green', icon: 'check-circle' },
  REJECTED: { label: '반려', tone: 'neutral', icon: 'block' },
};

/** 규칙 검토: 목록 ↔ 상세 + 원문 근거. 승인·반려는 확인 단계를 거친다. 규칙이 많아도 찾고 거를 수 있게. */
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
  const router = useRouter();
  const { width } = useWindowDimensions();
  const side = width >= 1100;
  const noticeIds = [...new Set(snapshot.rules.map(rule => rule.noticeId))];
  const [noticeId, setNoticeId] = useState<string>(notice && noticeIds.includes(notice) ? notice : noticeIds[0] ?? '');
  // 예시 모드에서만 화면 안 상태로 승인·반려를 반영한다(저장하지 않음).
  const [overrides, setOverrides] = useState<Record<string, RuleReviewStatus>>({});
  const [filters, setFilters] = useState<RuleFilters>(DEFAULT_RULE_FILTERS);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const all = useMemo(() => snapshot.rules.filter(rule => rule.noticeId === noticeId).map(rule => ({ ...rule, status: overrides[rule.id] ?? rule.status })), [noticeId, overrides, snapshot.rules]);
  const rules = useMemo(() => filterRules(all, filters), [all, filters]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = rules.find(rule => rule.id === selectedId) ?? rules[0] ?? null;
  const [confirm, setConfirm] = useState<null | { rule: ConsoleRule; next: RuleReviewStatus }>(null);
  const [done, setDone] = useState<string | null>(null);
  const titleOf = (id: string) => snapshot.notices.find(item => item.id === id)?.title ?? id;
  const supplies = [...new Set(all.map(rule => rule.supplyType))];
  const changeKnown = changeDataAvailable(all);
  const patch = (next: Partial<RuleFilters>) => { setFilters(current => ({ ...current, ...next })); setLimit(PAGE_SIZE); setSelectedId(null); };
  const filtered = JSON.stringify(filters) !== JSON.stringify(DEFAULT_RULE_FILTERS);
  // 좁은 화면에서는 검색만 펼치고 나머지 필터는 접는다(목록이 첫 화면에 보이게).
  const wideFilters = width >= 900;
  const activeFilters = (['validation', 'evidence', 'supply', 'status'] as const).filter(key => filters[key] !== 'ALL').length + (filters.changedOnly ? 1 : 0);

  if (!noticeIds.length) return <EmptyState {...emptyCopy('rules', true)} />;
  const stat = (predicate: (rule: ConsoleRule) => boolean) => all.filter(predicate).length;

  const controls = (
    <SectionCard title="찾기 · 거르기" description={`규칙 ${all.length}건 · 검토 대기 ${stat(rule => rule.status === 'PENDING')} · 검증 실패 ${stat(rule => rule.validation.status === 'FAIL')} · 근거 없음 ${stat(evidenceMissing)}`}>
      <View testID="console-rule-filters" style={styles.controls}>
        <SearchField testID="console-rule-search" value={filters.query} onChange={query => patch({ query })} placeholder="조건·값·근거 문장으로 찾기" />
        <FilterDisclosure testID="console-rule-filter-toggle" collapsible={!wideFilters} active={activeFilters}>
        <FilterGroup<RuleFilters['validation']> label="검증 결과" testID="console-rule-validation" active={filters.validation} onChange={validation => patch({ validation })}
          tabs={[{ key: 'ALL', label: '전체' }, { key: 'FAIL', label: '검증 실패', count: stat(rule => rule.validation.status === 'FAIL') }, { key: 'WARN', label: '확인 필요', count: stat(rule => rule.validation.status === 'WARN') }, { key: 'PASS', label: '통과', count: stat(rule => rule.validation.status === 'PASS') }]} />
        <FilterGroup<RuleFilters['evidence']> label="원문 근거" testID="console-rule-evidence-filter" active={filters.evidence} onChange={evidence => patch({ evidence })}
          tabs={[{ key: 'ALL', label: '전체' }, { key: 'MISSING', label: '근거 없음', count: stat(evidenceMissing) }, { key: 'HAS', label: '근거 있음', count: stat(rule => !evidenceMissing(rule)) }]} />
        <FilterGroup<string> label="공급유형" testID="console-rule-supply" active={filters.supply} onChange={supply => patch({ supply })}
          tabs={[{ key: 'ALL', label: '전체' }, ...supplies.map(supply => ({ key: supply, label: supply, count: stat(rule => rule.supplyType === supply) }))]} />
        <FilterGroup<RuleFilters['status']> label="검토 상태" testID="console-rule-status" active={filters.status} onChange={status => patch({ status })}
          tabs={[{ key: 'ALL', label: '전체' }, { key: 'PENDING', label: '검토 대기' }, { key: 'APPROVED', label: '승인' }, { key: 'REJECTED', label: '반려' }]} />
        <View style={styles.row}>
          <ToggleChip testID="console-rule-changed" label="직전 버전에서 바뀐 것만" on={filters.changedOnly} onChange={changedOnly => patch({ changedOnly })} disabled={!changeKnown}
            hint={changeKnown ? `바뀐 규칙 ${stat(rule => rule.changed === true)}건` : '버전 비교 데이터가 연결되면 쓸 수 있어요'} />
          {filtered ? <AdminButton label="필터 초기화" tone="quiet" icon="filter-alt-off" onPress={() => patch(DEFAULT_RULE_FILTERS)} /> : null}
        </View>
        </FilterDisclosure>
      </View>
    </SectionCard>
  );

  const list = (
    <SectionCard title={`규칙 ${rules.length}건${filtered ? ` / ${all.length}` : ''}`} description={filtered ? '필터 결과' : '검토 대기·검증 실패를 먼저 확인하세요'}>
      <View testID="console-rule-list" style={styles.list}>
        {rules.length ? rules.slice(0, limit).map(rule => {
          const on = selected?.id === rule.id;
          const missing = evidenceMissing(rule);
          return (
            <MotionPressable key={rule.id} testID={`console-rule-${rule.id}`} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${rule.ruleType} ${rule.condition}`} onPress={() => setSelectedId(rule.id)} style={[styles.ruleRow, on && styles.ruleRowOn]}>
              <View style={styles.ruleCopy}>
                <Text style={styles.ruleTitle} numberOfLines={1}>{rule.ruleType} · {rule.supplyType}</Text>
                <Text style={styles.ruleMeta} numberOfLines={2}>{rule.condition} {rule.value}</Text>
              </View>
              <View style={styles.ruleBadges}>
                <StatusPill label={REVIEW_LABEL[rule.status].label} tone={REVIEW_LABEL[rule.status].tone} icon={REVIEW_LABEL[rule.status].icon} />
                {rule.validation.status !== 'PASS' ? <StatusPill label={rule.validation.status === 'FAIL' ? '검증 실패' : '확인 필요'} tone={rule.validation.status === 'FAIL' ? 'pink' : 'amber'} icon="error-outline" /> : null}
                {missing ? <StatusPill label="근거 없음" tone="pink" icon="link-off" /> : null}
                {rule.changed ? <StatusPill label="변경" tone="purple" icon="change-circle" /> : null}
              </View>
            </MotionPressable>
          );
        }) : <EmptyState title="조건에 맞는 규칙이 없어요" body="검색어나 필터를 바꿔 보세요." action={<AdminButton label="필터 초기화" tone="quiet" icon="filter-alt-off" onPress={() => patch(DEFAULT_RULE_FILTERS)} />} />}
        <MoreButton shown={Math.min(limit, rules.length)} total={rules.length} onMore={() => setLimit(value => value + PAGE_SIZE)} />
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
          <Field label="값" value={selected.value || '—'} />
          <Field label="검증"><View style={styles.validation}><ValidationBadge validation={selected.validation} />{selected.validation.messages.map(message => <Text key={message} style={styles.meta}>· {message}</Text>)}</View></Field>
          <Field label="검토 상태"><StatusPill label={REVIEW_LABEL[selected.status].label} tone={REVIEW_LABEL[selected.status].tone} icon={REVIEW_LABEL[selected.status].icon} /></Field>
        </FieldGrid>
        <View style={styles.evidence} testID="console-rule-evidence">
          {evidenceMissing(selected) ? (
            <Text style={styles.evidenceMissing}>원문 근거가 없어요 · 원문에서 이 조건이 나온 위치를 찾아 연결해야 해요.</Text>
          ) : (
            <>
              <Text style={styles.evidenceTitle}>원문 근거 · {selected.evidence.section}</Text>
              <Text style={styles.excerpt} selectable>{selected.evidence.excerpt}</Text>
              <Text style={styles.locator} selectable>위치 · {formatLocator(selected.evidence.locator)}</Text>
            </>
          )}
        </View>
        {done ? <Notice tone="green" icon="check-circle">{done}</Notice> : null}
        {demoMode ? (
          <View style={styles.actions}>
            <AdminButton label="반려" tone="danger" icon="block" disabled={selected.status !== 'PENDING'} onPress={() => setConfirm({ rule: selected, next: 'REJECTED' })} />
            <AdminButton label="승인" icon="check" disabled={selected.status !== 'PENDING' || selected.validation.status === 'FAIL'} onPress={() => setConfirm({ rule: selected, next: 'APPROVED' })} />
          </View>
        ) : (
          <View style={styles.actions}>
            <AdminButton label="기존 검수 콘솔에서 승인" tone="quiet" icon="open-in-new" onPress={() => router.push('/admin/rule-review' as Href)} />
          </View>
        )}
        {selected.validation.status === 'FAIL' && selected.status === 'PENDING' ? <Text style={styles.meta}>검증 실패 규칙은 원문을 다시 확인한 뒤 수정해야 승인할 수 있어요.</Text> : null}
      </View>
    </SectionCard>
  ) : null;

  return (
    <View style={styles.stack}>
      <NoticePicker
        testID="console-rule-notice"
        value={noticeId}
        onChange={id => { setNoticeId(id); setSelectedId(null); setDone(null); setFilters(DEFAULT_RULE_FILTERS); setLimit(PAGE_SIZE); }}
        options={noticeIds.map(id => {
          const pending = snapshot.rules.filter(rule => rule.noticeId === id && rule.status === 'PENDING').length;
          return { id, title: titleOf(id), hint: `검토 대기 ${pending}건` };
        })}
      />
      {controls}
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
  controls: { gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: spacing.sm, justifyContent: 'space-between' },
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
  evidenceMissing: { ...type.bodySm, color: tint.pink.fg },
  excerpt: { ...type.body, color: colors.text },
  locator: { ...type.caption, color: colors.textMuted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-end' },
});
