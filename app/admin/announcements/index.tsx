import { useMemo, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import type { ImageStyle, StyleProp } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, radius, spacing, type } from '../../../design/tokens';
import { AdminShell } from '../../../features/adminPortal/AdminShell';
import { useLearningRows } from '../../../features/adminPortal/useLearningRows';
import { adminAccessMessage } from '../../../features/adminPortal/access';
import { RLS_LIMIT_NOTE } from '../../../features/adminPortal/dashboard';
import { countLabel, dateLabel } from '../../../features/adminPortal/status';
import { IMAGE_STATE_BADGE, IMAGE_STATE_LABEL, RECRUITMENT_BADGE } from '../../../features/adminPortal/operations';
import {
  ANALYSIS_BADGE, ANNOUNCEMENT_VIEW_LABEL, joinAnnouncements, needsImage, needsReview, scheduleLine,
  selectAnnouncements, supplyLabel, type AnnouncementOperationRow, type AnnouncementView,
} from '../../../features/adminPortal/announcementOperations';
import {
  AdminButton, CellText, DataList, KpiGrid, Notice, PageIntro, SearchFilterBar, SectionCard, StatusBadge,
} from '../../../features/adminPortal/ui/AdminKit';
import { listingVisualRecords } from '../../../features/listingVisual/resolvedRegistry';
import { useListingDataset } from '../../../features/discovery/data/useListingDataset';

const VIEWS: AnnouncementView[] = ['ALL', 'OPEN', 'UPCOMING', 'CLOSED', 'ANALYZABLE', 'NEEDS_REVIEW', 'NEEDS_IMAGE'];

/**
 * 공고 관리.
 *
 * 한 줄이 공고 하나다. 운영자가 한 줄에서 "이 공고가 지금 어떤 상태이고 내가 뭘 해야 하는지"를 읽고,
 * 더 들어갈 일은 오른쪽 관리 버튼으로 넘긴다. 이 화면은 읽기만 한다.
 */
export default function AdminAnnouncementsRoute() {
  return (
    <AdminShell title="공고 관리" subtitle="지금 관리자 권한으로 조회할 수 있는 공고예요.">
      {() => <AnnouncementList />}
    </AdminShell>
  );
}

function AnnouncementList() {
  const router = useRouter();
  const state = useLearningRows(true);
  const dataset = useListingDataset();
  const [query, setQuery] = useState('');
  const [view, setView] = useState<AnnouncementView>('ALL');

  const rows = useMemo(
    () => state.phase === 'READY'
      ? joinAnnouncements({ rows: state.rows, listings: dataset.listings, visuals: listingVisualRecords() })
      : [],
    [state.phase, state.phase === 'READY' ? state.rows : null, dataset.listings],
  );

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

  const shown = selectAnnouncements(rows, { query, view });

  return (
    <>
      <PageIntro
        title="공고 관리"
        description={`수집된 공고 ${rows.length}건이에요. 손봐야 하는 공고가 위로 와요.`}
        actions={<AdminButton label="모집 일정" tone="quiet" icon="event" onPress={() => router.push('/admin/schedule' as Href)} />}
      />

      {dataset.isFallback ? (
        <Notice tone="amber" icon="cloud-off">
          모집 일정과 공급 유형은 지금 예비 데이터를 보고 있어요. 분석 상태와 규칙 수는 영향이 없어요.
        </Notice>
      ) : null}

      <KpiGrid items={[
        { label: '전체 공고', value: countLabel(rows.length), tone: 'neutral', icon: 'campaign' },
        { label: '분석 가능', value: countLabel(rows.filter(row => row.analyzable && !needsReview(row)).length), hint: '사용자 화면에서 판정이 열려요', tone: 'green', icon: 'verified' },
        { label: '검수 필요', value: countLabel(rows.filter(needsReview).length), tone: 'amber', icon: 'fact-check' },
        { label: '이미지 확인 필요', value: countLabel(rows.filter(needsImage).length), tone: 'amber', icon: 'image' },
      ]} />

      <SectionCard title={`공고 목록 ${shown.length}건`} description="검색과 보기는 함께 걸려요.">
        <SearchFilterBar
          placeholder="단지명, 지역, 공급기관, 공고번호로 찾기"
          query={query}
          onQuery={setQuery}
          filters={[{
            label: '보기',
            value: view,
            choices: VIEWS.map(key => ({ key, label: ANNOUNCEMENT_VIEW_LABEL[key] })),
            onChange: key => setView(key as AnnouncementView),
          }]}
        />

        <DataList
          rows={shown}
          keyOf={row => row.announcementId}
          empty={{
            title: '조건에 맞는 공고가 없어요',
            body: '검색어나 보기를 바꿔 보세요. 검수 중이거나 비활성인 규칙은 이 목록에서 볼 수 없어요.',
            action: <AdminButton label="전체 보기" tone="quiet" onPress={() => { setQuery(''); setView('ALL'); }} />,
          }}
          columns={[
            {
              key: 'image', header: '이미지', flex: 0.8,
              render: row => <Thumb url={row.primaryImageUrl} />,
            },
            {
              key: 'title', header: '공고', flex: 3,
              render: row => (
                <View style={styles.cell}>
                  <CellText strong>{row.title}</CellText>
                  <CellText muted>{row.region} · {row.publisher}{row.announcementNo ? ` · ${row.announcementNo}` : ''}</CellText>
                </View>
              ),
            },
            { key: 'supply', header: '공급 유형', flex: 1, render: row => <CellText>{supplyLabel(row)}</CellText> },
            {
              key: 'recruit', header: '모집', flex: 1.6,
              render: row => (
                <View style={styles.cell}>
                  {row.listing ? <StatusBadge status={RECRUITMENT_BADGE[row.listing.recruitmentStatus]} /> : <CellText muted>확인 불가</CellText>}
                  <CellText muted>{scheduleLine(row)}</CellText>
                </View>
              ),
            },
            {
              key: 'analysis', header: '분석', flex: 1.4,
              render: row => (
                <View style={styles.cell}>
                  <StatusBadge status={ANALYSIS_BADGE(row)} />
                  <CellText muted>
                    {row.ruleSetId
                      ? row.approvedCount === null || row.ruleCount === null
                        ? '승인 확인 불가'
                        : `규칙 ${row.ruleCount}개 · 승인 ${row.approvedCount}`
                      : '규칙 없음'}
                  </CellText>
                </View>
              ),
            },
            {
              key: 'imageState', header: '이미지 상태', flex: 1.2,
              render: row => <StatusBadge status={IMAGE_STATE_BADGE[row.imageState]} />,
            },
            { key: 'updated', header: '최근 갱신', flex: 1, hideOnNarrow: true, render: row => <CellText muted>{dateLabel(row.updatedAt) ?? '—'}</CellText> },
          ]}
          actions={row => (
            <AdminButton label="관리" onPress={() => router.push(`/admin/announcements/${row.announcementId}` as Href)} />
          )}
        />

        <Notice icon="visibility-off">{RLS_LIMIT_NOTE}</Notice>
      </SectionCard>
    </>
  );
}

/** 목록의 작은 그림. 없으면 빈 상자 대신 무엇이 없는지 아이콘으로 알린다. */
function Thumb({ url }: { url: string | null }) {
  if (!url) {
    return (
      <View style={[styles.thumb, styles.thumbEmpty]}>
        <MaterialIcons name="image-not-supported" size={16} color={colors.textSubtle} />
      </View>
    );
  }
  return (
    <Image
      accessibilityIgnoresInvertColors
      accessibilityLabel={`${IMAGE_STATE_LABEL.AUTO_VERIFIED} 대표 이미지`}
      source={{ uri: url }}
      style={styles.thumb as StyleProp<ImageStyle>}
      resizeMode="cover"
    />
  );
}

const styles = StyleSheet.create({
  body: { ...type.body, color: colors.textMuted },
  center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  cell: { gap: 3, alignItems: 'flex-start' },
  thumb: { width: 56, height: 40, borderRadius: 8, backgroundColor: colors.lavender },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceContainer, borderRadius: radius.button },
});
