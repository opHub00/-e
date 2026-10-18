import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { StatusPill } from '../../../components/StatusPill';
import { colors, radius, spacing, type } from '../../../design/tokens';
import { AdminButton, CellText, DataList, EmptyState, SectionCard } from '../../../features/adminPortal/ui/AdminKit';
import { ConsoleShell } from '../../../features/adminConsole/ConsoleShell';
import { Field, FieldGrid, MoreButton, ReasonTag, SearchField, SummaryStrip, WrapTabs } from '../../../features/adminConsole/ConsoleKit';
import {
  AI_MODE_LABEL, aiSummary, ALERT_THRESHOLDS, fallbackReasonMeta, filterAiLog, formatLocator, maskPii, PAGE_SIZE, percent, shortTime, type AiLogFilter,
} from '../../../features/adminConsole/consoleModel';
import { collected, emptyCopy } from '../../../features/adminConsole/consoleState';
import type { ConsoleAiEvent, ConsoleSnapshot } from '../../../features/adminConsole/contract';
import { useConsolePagedRows } from '../../../features/adminConsole/useConsolePagedRows';

/** AI 모니터링: 답변 방식·대체 사유·근거 수·지연. 질문은 개인정보를 한 번 더 가린 뒤 보여 준다. */
export default function ConsoleAi() {
  return (
    <ConsoleShell
      menuKey="ai"
      title="AI 모니터링"
      subtitle="AI 상담이 규칙 답변·AI 답변·대체 답변 중 무엇으로 나갔는지, 왜 대체됐는지 봐요."
      testID="console-ai"
      needs={['AI 상담 로그(sanitized 질문·mode·provider·fallback 사유·근거 수·지연·근거 locator)']}
    >
      {snapshot => <AiLog snapshot={snapshot} />}
    </ConsoleShell>
  );
}

const FILTERS: Array<{ key: AiLogFilter; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'deterministic', label: '규칙 답변' },
  { key: 'llm', label: 'AI 답변' },
  { key: 'fallback', label: '대체 답변' },
  { key: 'grounding', label: '근거 검증 실패' },
  { key: 'timeout', label: '시간 초과' },
  { key: 'provider', label: '제공자 오류' },
];

const seconds = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)}초`);

function Question({ text }: { text: string }) {
  const safe = maskPii(text);
  return (
    <View style={styles.question}>
      <CellText strong>{safe.text}</CellText>
      {safe.masked ? <Text style={styles.masked}>개인정보로 보이는 값을 가렸어요</Text> : null}
    </View>
  );
}

function AiLog({ snapshot }: { snapshot: ConsoleSnapshot }) {
  const [filter, setFilter] = useState<AiLogFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const side = width >= 1200;
  const isCollected = collected(snapshot.coverage, 'ai');
  const rows = useMemo(() => filterAiLog(snapshot.ai, filter, query), [filter, query, snapshot.ai]);
  const page = useConsolePagedRows<ConsoleAiEvent>('ai', rows, filter, query);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(item => [item.key, filterAiLog(snapshot.ai, item.key).length])), [snapshot.ai]);
  const summary = aiSummary(snapshot.ai);
  const selected = page.rows.find(row => row.id === selectedId) ?? null;
  const reset = () => setSelectedId(null);

  if (!isCollected || !snapshot.ai.length) return <EmptyState {...emptyCopy('ai', isCollected)} />;

  const list = (
    <SectionCard title={`질문 ${page.total.toLocaleString('ko-KR')}건`} description="최신 순 · 질문은 개인정보를 지운 문장이에요">
      <DataList<ConsoleAiEvent>
        rows={page.rows}
        keyOf={row => row.id}
        empty={{ title: '해당하는 질문이 없어요', body: query ? '검색어를 바꾸거나 지워 보세요.' : '다른 필터를 골라 보세요.' }}
        columns={[
          { key: 'q', header: '질문', flex: 2.4, render: row => <Question text={row.question} /> },
          { key: 'mode', header: '방식', flex: 1, render: row => <View style={styles.badges}><StatusPill label={AI_MODE_LABEL[row.mode].label} tone={AI_MODE_LABEL[row.mode].tone} />{row.groundingRejected ? <StatusPill label="근거 실패" tone="pink" icon="gpp-bad" /> : null}</View> },
          { key: 'reason', header: '대체 사유', flex: 1.3, render: row => <ReasonTag reason={row.fallbackReason} /> },
          { key: 'ev', header: '근거 / 지연', flex: 0.9, render: row => <CellText muted>{row.evidenceCount}건 · {seconds(row.latencyMs)}</CellText> },
          { key: 'at', header: '시각', flex: 0.8, render: row => <CellText muted>{shortTime(row.at)}</CellText> },
        ]}
        actions={row => <AdminButton label="자세히" tone="quiet" icon="chevron-right" onPress={() => setSelectedId(row.id)} />}
      />
      <MoreButton shown={page.rows.length} total={page.total} onMore={page.more} />
    </SectionCard>
  );
  const detail = selected ? (
    <SectionCard title="질문 상세" description={`${shortTime(selected.at)} · ${selected.provider ?? '제공자 없음(규칙 답변)'}`} action={<AdminButton label="닫기" tone="quiet" icon="close" onPress={() => setSelectedId(null)} />}>
      <View testID="console-ai-detail" style={styles.detail}>
        <Field label="질문(개인정보 제거됨)" value={maskPii(selected.question).text} />
        <FieldGrid>
          <Field label="답변 방식" value={AI_MODE_LABEL[selected.mode].label} />
          <Field label="대체 사유" value={fallbackReasonMeta(selected.fallbackReason)?.label ?? '없음'} />
          <Field label="근거 검증" value={selected.groundingRejected ? '실패(답변 폐기)' : '통과'} />
          <Field label="지연" value={`${selected.latencyMs.toLocaleString('ko-KR')}ms`} />
        </FieldGrid>
        <Text style={styles.evidenceHead}>찾은 근거 {selected.evidence.length}건</Text>
        {selected.evidence.length ? selected.evidence.map(item => (
          <View key={`${item.section}-${item.locator}`} style={styles.evidence}>
            <Text style={styles.evidenceSection}>{item.section}</Text>
            <Text style={styles.excerpt} selectable>{maskPii(item.excerpt).text}</Text>
            <Text style={styles.locator} selectable>위치 · {formatLocator(item.locator)}</Text>
          </View>
        )) : <Text style={styles.muted}>근거를 찾지 못했어요.</Text>}
      </View>
    </SectionCard>
  ) : null;
  return (
    <View style={styles.stack}>
      <SummaryStrip testID="console-ai-summary" items={[
        { label: '질문', value: `${summary.total.toLocaleString('ko-KR')}건` },
        { label: '대체 답변 비율', value: percent(summary.fallbackRate), hint: `대체 ${counts.fallback}건`, level: (summary.fallbackRate ?? 0) >= ALERT_THRESHOLDS.fallbackRate ? 'WARNING' : null },
        { label: '평균 응답', value: seconds(summary.averageMs), hint: `p95 ${seconds(summary.p95Ms)}` },
        { label: '근거 검증 실패', value: `${counts.grounding}건`, hint: `시간 초과 ${counts.timeout} · 제공자 오류 ${counts.provider}`, level: counts.grounding ? 'WARNING' : null },
      ]} />
      <View style={styles.controls}>
        <WrapTabs<AiLogFilter>
          testID="console-ai-filter"
          active={filter}
          onChange={value => { setFilter(value); reset(); }}
          tabs={FILTERS.map(item => ({ key: item.key, label: item.label, count: counts[item.key] }))}
        />
        <SearchField testID="console-ai-search" value={query} onChange={value => { setQuery(value); reset(); }} placeholder="질문·대체 사유로 찾기" />
      </View>
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
  controls: { gap: spacing.sm },
  split: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  listCol: { flex: 1.6, minWidth: 0 },
  detailCol: { flex: 1, minWidth: 0 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  question: { gap: 2, minWidth: 0 },
  masked: { ...type.caption, color: colors.textMuted },
  detail: { gap: spacing.sm },
  evidenceHead: { ...type.label, color: colors.textMuted },
  evidence: { gap: 2, padding: spacing.sm, borderRadius: radius.cardSm, backgroundColor: colors.surfaceContainer },
  evidenceSection: { ...type.label, color: colors.text },
  excerpt: { ...type.bodySm, color: colors.text },
  locator: { ...type.caption, color: colors.textMuted },
  muted: { ...type.bodySm, color: colors.textMuted },
});
