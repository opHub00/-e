import { useMemo, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type } from '../../design/tokens';
import { AdminShell } from '../../features/adminPortal/AdminShell';
import { useLearningRows } from '../../features/adminPortal/useLearningRows';
import { adminAccessMessage } from '../../features/adminPortal/access';
import { RLS_LIMIT_NOTE } from '../../features/adminPortal/dashboard';
import { countLabel } from '../../features/adminPortal/status';
import {
  buildAnnouncementRows, regionChoices, selectAnnouncementRows,
  type AdminAnnouncementRow, type AnnouncementFilter,
} from '../../features/adminPortal/announcementRows';
import {
  AdminButton, CellText, DataList, KpiGrid, Notice, PageIntro, SearchFilterBar, SectionCard, StatusBadge,
} from '../../features/adminPortal/ui/AdminKit';
import { resolvedListingImage } from '../../features/listingVisual/resolvedRegistry';

const STATUS_FILTERS: { key: AnnouncementFilter; label: string }[] = [
  { key: 'ALL', label: '전체' },
  { key: 'ANALYZABLE', label: '분석 가능' },
  { key: 'NO_ACTIVE_RULES', label: '활성 규칙 없음' },
];

/**
 * 공고 관리.
 *
 * 한 줄이 공고 하나다. 이 공고가 지금 사용자에게 어디까지 열려 있는지(분석 가능 여부, 규칙, 연결,
 * 대표 이미지)를 한 줄에서 읽고, 더 들어갈 일은 오른쪽 버튼으로 넘긴다. 이 화면은 읽기만 한다.
 */
export default function AdminAnnouncementsRoute() {
  return (
    <AdminShell title="공고 관리" subtitle="지금 관리자 권한으로 조회할 수 있는 공고예요.">
      {() => <AnnouncementList />}
    </AdminShell>
  );
}

/** 이 공고에 연결된 listing 중 검증된 대표 이미지가 있는지. */
const hasImage = (row: AdminAnnouncementRow, listingIds: string[]) =>
  listingIds.some(id => resolvedListingImage({ id }));

function AnnouncementList() {
  const router = useRouter();
  const state = useLearningRows(true);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<AnnouncementFilter>('ALL');
  const [region, setRegion] = useState('ALL');

  const all = useMemo(
    () => (state.phase === 'READY' ? buildAnnouncementRows(state.rows) : []),
    [state.phase, state.phase === 'READY' ? state.rows : null],
  );
  const listingsByAnnouncement = useMemo(() => {
    const map = new Map<string, string[]>();
    if (state.phase === 'READY') for (const row of state.rows) map.set(row.announcementId, row.listingIds);
    return map;
  }, [state.phase, state.phase === 'READY' ? state.rows : null]);

  if (state.phase === 'LOADING') {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} /><Text style={styles.body}>공고를 불러오는 중이에요</Text></View>;
  }
  if (state.phase === 'FAILED') {
    return (
      <SectionCard title="공고를 불러오지 못했어요" description={adminAccessMessage(state.code)}>
        <AdminButton label="다시 불러오기" icon="refresh" onPress={state.refresh} />
      </SectionCard>
    );
  }

  const rows = selectAnnouncementRows(all, { query, status, region });
  const analyzable = all.filter(row => row.analyzable).length;
  const withImage = all.filter(row => hasImage(row, listingsByAnnouncement.get(row.announcementId) ?? [])).length;

  return (
    <>
      <PageIntro
        title="공고 관리"
        description={`수집된 공고 ${all.length}건을 관리해요. 한 줄이 공고 하나이고, 오른쪽 버튼으로 필요한 화면에 바로 갈 수 있어요.`}
        actions={<AdminButton label="분석 현황" tone="quiet" icon="insights" onPress={() => router.push('/admin/learning-status' as Href)} />}
      />

      <KpiGrid items={[
        { label: '수집된 공고', value: countLabel(all.length), tone: 'neutral', icon: 'campaign' },
        { label: '분석 가능', value: countLabel(analyzable), hint: '규칙 활성 + 연결 완료', tone: 'green', icon: 'verified' },
        { label: '활성 규칙 없음', value: countLabel(all.filter(row => !row.ruleSetId).length), tone: 'amber', icon: 'rule' },
        { label: '대표 이미지 있음', value: countLabel(withImage), hint: '공식 홈페이지에서 확인된 사진', tone: 'purple', icon: 'image' },
      ]} />

      <SectionCard title={`공고 목록 ${rows.length}건`} description="검색과 필터는 함께 걸려요.">
        <SearchFilterBar
          placeholder="단지명, 지역, 사업주체로 찾기"
          query={query}
          onQuery={setQuery}
          filters={[
            { label: '상태', value: status, choices: STATUS_FILTERS.map(item => ({ key: item.key, label: item.label })), onChange: key => setStatus(key as AnnouncementFilter) },
            {
              label: '지역',
              value: region,
              choices: [{ key: 'ALL', label: '전체' }, ...regionChoices(all).map(name => ({ key: name, label: name }))],
              onChange: setRegion,
            },
          ]}
        />

        <DataList
          rows={rows}
          keyOf={row => row.announcementId}
          empty={{
            title: '조건에 맞는 공고가 없어요',
            body: '검색어나 필터를 바꿔 보세요. 검수 중이거나 비활성인 규칙 세트는 이 목록에서 볼 수 없어요.',
            action: <AdminButton label="필터 초기화" tone="quiet" onPress={() => { setQuery(''); setStatus('ALL'); setRegion('ALL'); }} />,
          }}
          columns={[
            {
              key: 'title', header: '공고', flex: 3,
              render: row => (
                <View style={styles.titleCell}>
                  <CellText strong>{row.title}</CellText>
                  <CellText muted>{row.region} · {row.publisher} · {row.announcementDate}</CellText>
                </View>
              ),
            },
            {
              key: 'analyzable', header: '분석', flex: 1,
              render: row => <StatusBadge status={row.analyzable ? 'ANALYZABLE' : 'NOT_ANALYZABLE'} />,
            },
            {
              key: 'rules', header: '규칙', flex: 1.4,
              render: row => (
                <View style={styles.titleCell}>
                  <CellText>{row.ruleSetId ? `승인 ${row.approvedCount} / ${row.ruleCount}` : '활성 규칙 없음'}</CellText>
                  {row.ruleSetId ? <CellText muted>{row.version}</CellText> : null}
                </View>
              ),
            },
            { key: 'binding', header: '연결', flex: 0.9, render: row => <CellText>{row.bindingLabel}</CellText> },
            {
              key: 'image', header: '대표 이미지', flex: 1.1,
              render: row => (
                <CellText muted>
                  {hasImage(row, listingsByAnnouncement.get(row.announcementId) ?? []) ? '있음' : '없음'}
                </CellText>
              ),
            },
          ]}
          actions={row => (
            <>
              {row.ruleSetId ? (
                <AdminButton label="규칙 검수" tone="quiet" onPress={() => router.push(`/admin/rule-review?ruleSetId=${row.ruleSetId}` as Href)} />
              ) : null}
              <AdminButton label="분석 현황" tone="quiet" onPress={() => router.push('/admin/learning-status' as Href)} />
            </>
          )}
        />

        <Notice icon="visibility-off">{RLS_LIMIT_NOTE}</Notice>
      </SectionCard>
    </>
  );
}

const styles = StyleSheet.create({
  body: { ...type.body, color: colors.textMuted },
  center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  titleCell: { gap: 2 },
});
