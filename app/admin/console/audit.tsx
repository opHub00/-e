import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, tint, type } from '../../../design/tokens';
import { SectionCard } from '../../../features/adminPortal/ui/AdminKit';
import { ConsoleShell } from '../../../features/adminConsole/ConsoleShell';
import { auditDiff, shortTime } from '../../../features/adminConsole/consoleModel';
import type { ConsoleSnapshot } from '../../../features/adminConsole/contract';

const ENTITY_LABEL = { NOTICE: '공고', RULE: '규칙', RULE_PACKAGE: '규칙 패키지', RAG: 'RAG', SETTING: '설정' } as const;

/** 감사 로그: 누가 · 무엇을 · 어떤 대상에 · 언제. 바뀐 값만 '이전 → 이후'로. */
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
  const entries = [...snapshot.audit].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <SectionCard title={`기록 ${entries.length}건`} description="최신 순">
      <View testID="console-audit-list" style={styles.list}>
        {entries.map(entry => {
          const diff = auditDiff(entry);
          return (
            <View key={entry.id} style={styles.entry}>
              <View style={styles.head}>
                <Text style={styles.action}>{entry.action}</Text>
                <Text style={styles.meta}>{shortTime(entry.at)} · {entry.actor}</Text>
              </View>
              <Text style={styles.entity}>{ENTITY_LABEL[entry.entity.type]} · {entry.entity.label}</Text>
              <View style={styles.diff}>
                {diff.length ? diff.map(line => (
                  <View key={line.key} style={styles.diffRow}>
                    <Text style={styles.diffKey}>{line.key}</Text>
                    <View style={styles.diffValues}>
                      {line.kind !== 'added' ? <Text style={[styles.value, styles.before]}>{line.before}</Text> : null}
                      {line.kind === 'changed' ? <Text style={styles.arrow}>→</Text> : null}
                      {line.kind !== 'removed' ? <Text style={[styles.value, styles.after]}>{line.after}</Text> : null}
                      {line.kind !== 'changed' ? <Text style={styles.kind}>{line.kind === 'added' ? '추가' : '삭제'}</Text> : null}
                    </View>
                  </View>
                )) : <Text style={styles.meta}>값 변경 없음</Text>}
              </View>
            </View>
          );
        })}
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  entry: { gap: 4, padding: spacing.sm, borderRadius: radius.cardSm, borderWidth: 1, borderColor: colors.surfaceContainer },
  head: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6 },
  action: { ...type.bodyStrong, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted },
  entity: { ...type.bodySm, color: colors.textMuted },
  diff: { gap: 4, marginTop: 2 },
  diffRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  diffKey: { fontFamily: 'monospace', fontSize: 12, lineHeight: 18, color: colors.textMuted, minWidth: 96 },
  diffValues: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, flex: 1, minWidth: 160 },
  value: { ...type.bodySm, paddingHorizontal: 6, borderRadius: 6 },
  before: { color: tint.pink.fg, backgroundColor: tint.pink.bg, textDecorationLine: 'line-through' },
  after: { color: tint.green.fg, backgroundColor: tint.green.bg },
  arrow: { ...type.bodySm, color: colors.textMuted },
  kind: { ...type.caption, color: colors.textMuted },
});
