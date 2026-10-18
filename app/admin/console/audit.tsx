import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, tint, type } from '../../../design/tokens';
import { EmptyState, SectionCard } from '../../../features/adminPortal/ui/AdminKit';
import { ConsoleShell } from '../../../features/adminConsole/ConsoleShell';
import { MoreButton, SearchField, WrapTabs } from '../../../features/adminConsole/ConsoleKit';
import { AUDIT_ENTITY_LABEL, filterAudit, PAGE_SIZE, readableAuditDiff, shortTime } from '../../../features/adminConsole/consoleModel';
import { collected, emptyCopy } from '../../../features/adminConsole/consoleState';
import type { ConsoleAuditEntry, ConsoleSnapshot } from '../../../features/adminConsole/contract';
import { useConsolePagedRows } from '../../../features/adminConsole/useConsolePagedRows';

type EntityFilter = 'ALL' | ConsoleAuditEntry['entity']['type'];

/** 감사 로그: 누가 · 무엇을 · 어떤 대상에 · 언제. 바뀐 필드만 '이전 → 이후'로, 필드 이름과 값은 읽는 말로. */
export default function ConsoleAudit() {
  return (
    <ConsoleShell
      menuKey="audit"
      title="감사 로그"
      subtitle="누가 언제 무엇을 바꿨는지, 바뀐 값만 이전 → 이후로 봐요."
      testID="console-audit"
      needs={['감사 로그(행위자·행동·대상·이전/이후 값·시각)']}
    >
      {snapshot => <Audit snapshot={snapshot} />}
    </ConsoleShell>
  );
}

function Audit({ snapshot }: { snapshot: ConsoleSnapshot }) {
  const [entity, setEntity] = useState<EntityFilter>('ALL');
  const [query, setQuery] = useState('');
  const entries = useMemo(() => filterAudit(snapshot.audit, entity, query), [entity, query, snapshot.audit]);
  const page = useConsolePagedRows<ConsoleAuditEntry>('audit', entries, entity, query);
  const isCollected = collected(snapshot.coverage, 'audit');
  if (!isCollected || !snapshot.audit.length) return <EmptyState {...emptyCopy('audit', isCollected)} />;
  const types = [...new Set(snapshot.audit.map(entry => entry.entity.type))];
  return (
    <View style={styles.stack}>
      <View style={styles.controls}>
        <WrapTabs<EntityFilter>
          testID="console-audit-filter"
          active={entity}
          onChange={setEntity}
          tabs={[{ key: 'ALL', label: '전체', count: snapshot.audit.length }, ...types.map(item => ({ key: item as EntityFilter, label: AUDIT_ENTITY_LABEL[item], count: snapshot.audit.filter(entry => entry.entity.type === item).length }))]}
        />
        <SearchField testID="console-audit-search" value={query} onChange={setQuery} placeholder="사람·행동·대상으로 찾기" />
      </View>
      <SectionCard title={`기록 ${page.total.toLocaleString('ko-KR')}건`} description="최신 순 · 바뀐 필드만 보여요">
        <View testID="console-audit-list" style={styles.list}>
          {page.rows.length ? page.rows.map(entry => {
            const diff = readableAuditDiff(entry);
            return (
              <View key={entry.id} style={styles.entry}>
                <View style={styles.head}>
                  <Text style={styles.action}>{entry.action}</Text>
                  <Text style={styles.meta}>{shortTime(entry.at)}</Text>
                </View>
                <View style={styles.who}>
                  <Text style={styles.whoItem}><Text style={styles.whoLabel}>누가 </Text>{entry.actor}</Text>
                  <Text style={styles.whoItem} numberOfLines={2}><Text style={styles.whoLabel}>대상 </Text>{AUDIT_ENTITY_LABEL[entry.entity.type]} · {entry.entity.label}</Text>
                </View>
                <View style={styles.diff} testID="console-audit-diff">
                  {diff.length ? (
                    <>
                      <Text style={styles.diffHead}>바뀐 항목 · 이전 → 이후</Text>
                      {diff.map(line => (
                        <View key={line.key} style={styles.diffRow}>
                          <Text style={styles.diffKey}>{line.field}</Text>
                          <View style={styles.diffValues}>
                            {line.kind === 'added' ? <Text style={styles.kind}>새로 추가</Text> : <Text style={[styles.value, styles.before]}>{line.before}</Text>}
                            <Text style={styles.arrow}>→</Text>
                            {line.kind === 'removed' ? <Text style={styles.kind}>삭제</Text> : <Text style={[styles.value, styles.after]}>{line.after}</Text>}
                          </View>
                        </View>
                      ))}
                    </>
                  ) : <Text style={styles.meta}>값 변경 없음</Text>}
                </View>
              </View>
            );
          }) : <EmptyState title="조건에 맞는 기록이 없어요" body="검색어나 대상을 바꿔 보세요." />}
          <MoreButton shown={page.rows.length} total={page.total} onMore={page.more} />
        </View>
      </SectionCard>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  controls: { gap: spacing.sm },
  list: { gap: spacing.sm },
  entry: { gap: 6, padding: spacing.sm, borderRadius: radius.cardSm, borderWidth: 1, borderColor: colors.surfaceContainer },
  head: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6 },
  action: { ...type.bodyStrong, color: colors.text, flexShrink: 1 },
  meta: { ...type.caption, color: colors.textMuted },
  who: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: 2 },
  whoItem: { ...type.bodySm, color: colors.text, flexShrink: 1 },
  whoLabel: { color: colors.textMuted },
  diff: { gap: 4, padding: spacing.sm, borderRadius: radius.button, backgroundColor: colors.surfaceContainer },
  diffHead: { ...type.caption, color: colors.textMuted },
  diffRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  diffKey: { ...type.label, color: colors.text, minWidth: 96 },
  diffValues: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, flex: 1, minWidth: 160 },
  value: { ...type.bodySm, paddingHorizontal: 6, borderRadius: 6, flexShrink: 1 },
  before: { color: tint.pink.fg, backgroundColor: tint.pink.bg, textDecorationLine: 'line-through' },
  after: { color: tint.green.fg, backgroundColor: tint.green.bg },
  arrow: { ...type.bodySm, color: colors.textMuted },
  kind: { ...type.caption, color: colors.textMuted },
});
