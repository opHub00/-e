import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type } from '../../../design/tokens';
import { AdminButton, CellText, DataList, EmptyState, SectionCard } from '../../../features/adminPortal/ui/AdminKit';
import { ConsoleShell, useConsole } from '../../../features/adminConsole/ConsoleShell';
import { LifecycleBadge, MoreButton, SearchField, ValidationBadge, WrapTabs } from '../../../features/adminConsole/ConsoleKit';
import { filterNotices, LIFECYCLE_LABEL, PAGE_SIZE, shortHash, shortTime } from '../../../features/adminConsole/consoleModel';
import { emptyCopy } from '../../../features/adminConsole/consoleState';
import type { ConsoleNotice, ConsoleSnapshot, NoticeLifecycle } from '../../../features/adminConsole/contract';

type Filter = 'ALL' | NoticeLifecycle;

/** 공고 목록. 넓은 화면은 표, 좁은 화면은 카드(가로 스크롤 표를 기본으로 쓰지 않는다). */
export default function ConsoleNotices() {
  return (
    <ConsoleShell
      menuKey="notices"
      title="공고"
      subtitle="어떤 공고가 서비스 중인지, 무엇을 검토해야 하는지 봐요."
      testID="console-notices"
      needs={['Generic Notice 목록(상태·규칙/RAG 버전·원문 해시)']}
    >
      {snapshot => <Notices snapshot={snapshot} />}
    </ConsoleShell>
  );
}

function Notices({ snapshot }: { snapshot: ConsoleSnapshot }) {
  const router = useRouter();
  const { link } = useConsole();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const statuses: NoticeLifecycle[] = ['REVIEW_REQUIRED', 'ACTIVE', 'SOURCE_VERIFIED', 'APPROVED', 'DRAFT', 'ARCHIVED'];
  const rows = useMemo(() => filterNotices(snapshot.notices, filter, query), [filter, query, snapshot.notices]);
  const open = (notice: ConsoleNotice) => router.push(link('/admin/console/notice', { id: notice.id }));
  if (!snapshot.notices.length) return <EmptyState {...emptyCopy('notices', true)} />;
  return (
    <View style={styles.stack}>
      <View style={styles.controls}>
        <WrapTabs
          testID="console-notice-filter"
          active={filter}
          onChange={value => { setFilter(value); setLimit(PAGE_SIZE); }}
          tabs={[{ key: 'ALL' as Filter, label: '전체', count: snapshot.notices.length }, ...statuses.map(status => ({ key: status as Filter, label: LIFECYCLE_LABEL[status].label, count: snapshot.notices.filter(notice => notice.status === status).length }))]}
        />
        <SearchField testID="console-notice-search" value={query} onChange={value => { setQuery(value); setLimit(PAGE_SIZE); }} placeholder="공고 이름·지역·ID로 찾기" />
      </View>
      <SectionCard title={`${filter === 'ALL' ? '전체' : LIFECYCLE_LABEL[filter].label} 공고 ${rows.length.toLocaleString('ko-KR')}건`} description="최근 업데이트 순 · '상세'에서 원문·규칙·RAG를 확인해요.">
        <DataList
          rows={rows.slice(0, limit)}
          keyOf={row => row.id}
          empty={{ title: '해당하는 공고가 없어요', body: query ? '검색어를 바꾸거나 지워 보세요.' : '필터를 바꿔 보세요.' }}
          columns={[
            { key: 'title', header: '공고', flex: 2.4, render: row => <View style={styles.titleCell}><CellText strong>{row.title}</CellText><CellText muted>{row.region} · 공고일 {row.announcementDate}</CellText></View> },
            { key: 'status', header: '상태', flex: 1, render: row => <View style={styles.badges}><LifecycleBadge status={row.status} /><ValidationBadge validation={row.validation} /></View> },
            { key: 'versions', header: '규칙 / RAG', flex: 1.2, render: row => <CellText muted>{row.ruleVersion ?? '규칙 없음'} · {row.ragVersion ?? 'RAG 없음'}</CellText> },
            { key: 'provenance', header: '원문', flex: 1.3, render: row => <CellText muted>{row.provenance.official ? '공식 원문' : '사용자 제공본'} · {shortHash(row.provenance.sha256)}</CellText> },
            { key: 'updated', header: '최근 업데이트', flex: 0.9, render: row => <CellText muted>{shortTime(row.updatedAt)}</CellText> },
          ]}
          actions={row => <AdminButton label="상세" tone="quiet" icon="chevron-right" onPress={() => open(row)} />}
        />
        <MoreButton shown={Math.min(limit, rows.length)} total={rows.length} onMore={() => setLimit(value => value + PAGE_SIZE)} />
      </SectionCard>
      <Text style={styles.note}>상태 흐름: 초안 → 원문 확인 → 검토 필요 → 승인 → 서비스 중 → 보관</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  controls: { gap: spacing.sm },
  titleCell: { gap: 2, minWidth: 0 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  note: { ...type.caption, color: colors.textMuted },
});
