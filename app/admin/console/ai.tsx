import { useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { StatusPill } from '../../../components/StatusPill';
import { colors, radius, spacing, type } from '../../../design/tokens';
import { AdminButton, CellText, DataList, SectionCard } from '../../../features/adminPortal/ui/AdminKit';
import { ConsoleShell } from '../../../features/adminConsole/ConsoleShell';
import { Field, FieldGrid, WrapTabs } from '../../../features/adminConsole/ConsoleKit';
import { AI_MODE_LABEL, filterAi, shortTime, type AiFilter } from '../../../features/adminConsole/consoleModel';
import type { ConsoleAiEvent, ConsoleSnapshot } from '../../../features/adminConsole/contract';

/** AI 모니터링: 답변 방식·대체 사유·근거 수·지연. 상세는 개인정보를 지운 질문과 찾은 근거만. */
export default function ConsoleAi() {
  return (
    <ConsoleShell
      menuKey="ai"
      title="AI 모니터링"
      subtitle="AI 상담이 규칙 답변·AI 답변·대체 답변 중 무엇으로 나갔는지, 근거 검증이 실패했는지 봐요."
      testID="console-ai"
      needs={['AI 상담 로그(sanitized 질문·mode·provider·fallback 사유·근거 수·지연·근거 locator)']}
    >
      {snapshot => <AiLog snapshot={snapshot} />}
    </ConsoleShell>
  );
}

function AiLog({ snapshot }: { snapshot: ConsoleSnapshot }) {
  const [filter, setFilter] = useState<AiFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const side = width >= 1200;
  const rows = filterAi(snapshot.ai, filter);
  const selected = rows.find(row => row.id === selectedId) ?? null;
  const count = (f: AiFilter) => filterAi(snapshot.ai, f).length;
  const list = (
    <SectionCard title={`질문 ${rows.length}건`} description="최신 순">
      <DataList<ConsoleAiEvent>
        rows={[...rows].sort((a, b) => b.at.localeCompare(a.at))}
        keyOf={row => row.id}
        empty={{ title: '해당하는 질문이 없어요', body: '다른 필터를 골라 보세요.' }}
        columns={[
          { key: 'q', header: '질문', flex: 2.4, render: row => <CellText strong>{row.question}</CellText> },
          { key: 'mode', header: '방식', flex: 1, render: row => <View style={styles.badges}><StatusPill label={AI_MODE_LABEL[row.mode].label} tone={AI_MODE_LABEL[row.mode].tone} />{row.groundingRejected ? <StatusPill label="근거 실패" tone="pink" /> : null}</View> },
          { key: 'reason', header: '대체 사유', flex: 1.4, render: row => <CellText muted>{row.fallbackReason ?? '—'}</CellText> },
          { key: 'ev', header: '근거 / 지연', flex: 0.9, render: row => <CellText muted>{row.evidenceCount}건 · {(row.latencyMs / 1000).toFixed(1)}초</CellText> },
          { key: 'at', header: '시각', flex: 0.8, render: row => <CellText muted>{shortTime(row.at)}</CellText> },
        ]}
        actions={row => <AdminButton label="자세히" tone="quiet" icon="chevron-right" onPress={() => setSelectedId(row.id)} />}
      />
    </SectionCard>
  );
  const detail = selected ? (
    <SectionCard title="질문 상세" description={`${shortTime(selected.at)} · ${selected.provider ?? '제공자 없음(규칙 답변)'}`} action={<AdminButton label="닫기" tone="quiet" icon="close" onPress={() => setSelectedId(null)} />}>
      <View testID="console-ai-detail" style={styles.detail}>
        <Field label="질문(개인정보 제거됨)" value={selected.question} />
        <FieldGrid>
          <Field label="답변 방식" value={AI_MODE_LABEL[selected.mode].label} />
          <Field label="대체 사유" value={selected.fallbackReason ?? '없음'} />
          <Field label="근거 검증" value={selected.groundingRejected ? '실패(답변 폐기)' : '통과'} />
          <Field label="지연" value={`${selected.latencyMs.toLocaleString('ko-KR')}ms`} />
        </FieldGrid>
        <Text style={styles.evidenceHead}>찾은 근거 {selected.evidence.length}건</Text>
        {selected.evidence.length ? selected.evidence.map(item => (
          <View key={`${item.section}-${item.locator}`} style={styles.evidence}>
            <Text style={styles.evidenceSection}>{item.section}</Text>
            <Text style={styles.excerpt} selectable>{item.excerpt}</Text>
            <Text style={styles.locator} selectable>locator: {item.locator}</Text>
          </View>
        )) : <Text style={styles.muted}>근거를 찾지 못했어요.</Text>}
      </View>
    </SectionCard>
  ) : null;
  return (
    <View style={styles.stack}>
      <WrapTabs<AiFilter>
        testID="console-ai-filter"
        active={filter}
        onChange={value => { setFilter(value); setSelectedId(null); }}
        tabs={[
          { key: 'all', label: '전체', count: count('all') },
          { key: 'deterministic', label: '규칙 답변', count: count('deterministic') },
          { key: 'llm', label: 'AI 답변', count: count('llm') },
          { key: 'fallback', label: '대체 답변', count: count('fallback') },
          { key: 'grounding', label: '근거 실패', count: count('grounding') },
          { key: 'provider', label: '제공자 오류', count: count('provider') },
        ]}
      />
      {side ? (
        <View style={styles.split}>
          <View style={styles.listCol}>{list}</View>
          {detail ? <View style={styles.detailCol}>{detail}</View> : null}
        </View>
      ) : (
        <>{detail}{list}</>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  split: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  listCol: { flex: 1.6, minWidth: 0 },
  detailCol: { flex: 1, minWidth: 0 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  detail: { gap: spacing.sm },
  evidenceHead: { ...type.label, color: colors.textMuted },
  evidence: { gap: 2, padding: spacing.sm, borderRadius: radius.cardSm, backgroundColor: colors.surfaceContainer },
  evidenceSection: { ...type.label, color: colors.text },
  excerpt: { ...type.bodySm, color: colors.text },
  locator: { fontFamily: 'monospace', fontSize: 12, lineHeight: 18, color: colors.textMuted },
  muted: { ...type.bodySm, color: colors.textMuted },
});
