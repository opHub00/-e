import { useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { ImageStyle, StyleProp } from 'react-native';
import { AdminShell } from '../../features/adminPortal/AdminShell';
import { countLabel, dateLabel } from '../../features/adminPortal/status';
import {
  IMAGE_STATE_BADGE, IMAGE_STATE_LABEL, imageStateOf, type ImageOperationState,
} from '../../features/adminPortal/operations';
import {
  AdminButton, CellText, DataList, Disclosure, KpiGrid, Notice, PageIntro, SearchFilterBar, SectionCard, StatusBadge,
} from '../../features/adminPortal/ui/AdminKit';
import { listingVisualRecords } from '../../features/listingVisual/resolvedRegistry';
import { pickGallery, pickPrimary, type ListingVisualRecord } from '../../features/listingVisual/resolver';
import { colors, radius, spacing, type } from '../../design/tokens';

const SUBJECT_LABEL: Record<string, string> = {
  apartment_exterior: '단지 외관', complex_overview: '단지 전경', building_render: '조감·투시도',
  landscape: '조경', community: '커뮤니티', floor_plan: '평면도', map: '위치도',
  brand: '브랜드 이미지', unknown: '확인 불가',
};

const FILTERS: { key: 'ALL' | ImageOperationState; label: string }[] = [
  { key: 'ALL', label: '전체' },
  { key: 'AUTO_VERIFIED', label: IMAGE_STATE_LABEL.AUTO_VERIFIED },
  { key: 'NEEDS_HUMAN', label: IMAGE_STATE_LABEL.NEEDS_HUMAN },
  { key: 'UNUSABLE', label: IMAGE_STATE_LABEL.UNUSABLE },
];

/**
 * 이미지 관리.
 *
 * 자동으로 찾은 대표 이미지와 갤러리를 공고별로 확인한다.
 * 운영자에게 confidence 숫자를 먼저 보여주지 않는다. 먼저 필요한 판단은 "이대로 써도 되는가"뿐이다.
 * 숫자와 출처 종류는 고급 정보에 둔다.
 */
export default function AdminImagesRoute() {
  return (
    <AdminShell title="이미지 관리" subtitle="공고 대표 이미지와 갤러리를 확인해요.">
      {() => <ImageList />}
    </AdminShell>
  );
}

type Group = {
  announcementNo: string;
  title: string;
  listingId: string;
  records: ListingVisualRecord[];
  state: ImageOperationState;
  primary: ListingVisualRecord | null;
  gallery: ListingVisualRecord[];
  fetchedAt: string;
};

function ImageList() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'ALL' | ImageOperationState>('ALL');

  const groups = useMemo<Group[]>(() => {
    const byListing = new Map<string, ListingVisualRecord[]>();
    for (const record of listingVisualRecords()) {
      if (!byListing.has(record.listingId)) byListing.set(record.listingId, []);
      byListing.get(record.listingId)!.push(record);
    }
    return [...byListing.entries()].map(([listingId, records]) => ({
      announcementNo: records[0].announcementNo,
      title: records[0].announcementTitle,
      listingId,
      records,
      state: imageStateOf(records),
      primary: pickPrimary(records),
      gallery: pickGallery(records),
      fetchedAt: records[0].fetchedAt,
    })).sort((left, right) => left.title.localeCompare(right.title));
  }, []);

  const shown = groups.filter(group => {
    const needle = query.replace(/\s+/g, '').toLowerCase();
    const matches = !needle || `${group.title}${group.announcementNo}`.replace(/\s+/g, '').toLowerCase().includes(needle);
    return matches && (filter === 'ALL' || group.state === filter);
  });

  const count = (state: ImageOperationState) => groups.filter(group => group.state === state).length;

  return (
    <>
      <PageIntro
        title="이미지 관리"
        description="공고의 공식 분양 홈페이지에서 자동으로 찾은 사진이에요. 그대로 써도 되는지 여기서 확인해요."
      />

      <KpiGrid items={[
        { label: '확인한 공고', value: countLabel(groups.length), tone: 'neutral', icon: 'campaign' },
        { label: IMAGE_STATE_LABEL.AUTO_VERIFIED, value: countLabel(count('AUTO_VERIFIED')), hint: '대표 이미지가 바로 쓰여요', tone: 'green', icon: 'verified' },
        { label: IMAGE_STATE_LABEL.NEEDS_HUMAN, value: countLabel(count('NEEDS_HUMAN')), hint: '사람이 골라야 해요', tone: 'amber', icon: 'visibility' },
        { label: IMAGE_STATE_LABEL.UNUSABLE, value: countLabel(count('UNUSABLE')), hint: '후보가 모두 막혔어요', tone: 'pink', icon: 'block' },
      ]} />

      <SectionCard title={`공고별 이미지 ${shown.length}건`}>
        <SearchFilterBar
          placeholder="단지명이나 공고번호로 찾기"
          query={query}
          onQuery={setQuery}
          filters={[{ label: '상태', value: filter, choices: FILTERS.map(item => ({ key: item.key, label: item.label })), onChange: key => setFilter(key as 'ALL' | ImageOperationState) }]}
        />
        {shown.length === 0 ? (
          <Notice icon="search-off">조건에 맞는 공고가 없어요.</Notice>
        ) : (
          shown.map(group => <GroupCard key={group.listingId} group={group} />)
        )}
      </SectionCard>

      <Notice icon="info">
        이미지를 직접 고르거나 바꾸려면 저장할 곳이 필요해요. 지금은 자동으로 찾은 결과를 확인만 할 수 있어요.
      </Notice>
    </>
  );
}

function GroupCard({ group }: { group: Group }) {
  const [advanced, setAdvanced] = useState(false);
  const blocked = group.records.filter(record => !record.verified);

  return (
    <SectionCard
      title={group.title}
      description={`공고번호 ${group.announcementNo} · 확인 시각 ${dateLabel(group.fetchedAt) ?? '—'}`}
      action={<StatusBadge status={IMAGE_STATE_BADGE[group.state]} />}
    >
      {group.primary ? (
        <View style={styles.primaryRow}>
          <Image
            accessibilityIgnoresInvertColors
            source={{ uri: group.primary.imageUrl }}
            style={styles.primaryImage as StyleProp<ImageStyle>}
            resizeMode="cover"
          />
          <View style={styles.primaryCopy}>
            <Text style={styles.primaryLabel}>대표 이미지</Text>
            <Text style={styles.primaryKind}>{SUBJECT_LABEL[group.primary.subjectType] ?? group.primary.subjectType}</Text>
            <Text style={styles.primaryMeta}>{group.primary.width}×{group.primary.height}</Text>
            <Text style={styles.primaryMeta} numberOfLines={2}>출처: {group.primary.sourceUrl}</Text>
          </View>
        </View>
      ) : (
        <Notice tone="amber" icon="image-not-supported">
          대표로 쓸 이미지를 고르지 못했어요. 사용자 화면에는 지도 미리보기가 나와요.
        </Notice>
      )}

      {group.gallery.length > 1 ? (
        <View style={styles.gallery}>
          {group.gallery.map(record => (
            <View key={record.imageUrl} style={styles.thumbBox}>
              <Image
                accessibilityIgnoresInvertColors
                source={{ uri: record.imageUrl }}
                style={styles.thumb as StyleProp<ImageStyle>}
                resizeMode="cover"
              />
              <Text style={styles.thumbLabel} numberOfLines={1}>{SUBJECT_LABEL[record.subjectType] ?? record.subjectType}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {blocked.length ? (
        <DataList
          rows={blocked}
          keyOf={record => record.imageUrl || record.sourceUrl}
          empty={{ title: '', body: '' }}
          columns={[
            {
              key: 'kind', header: '분류', flex: 1.2,
              render: record => <CellText>{SUBJECT_LABEL[record.subjectType] ?? record.subjectType}</CellText>,
            },
            {
              key: 'size', header: '크기', flex: 1,
              render: record => <CellText muted>{record.width ? `${record.width}×${record.height}` : '확인 불가'}</CellText>,
            },
            {
              key: 'reason', header: '쓰지 못한 이유', flex: 4,
              render: record => <CellText>{record.blockedReason ?? '—'}</CellText>,
            },
          ]}
        />
      ) : null}

      <Disclosure label="고급 정보" open={advanced} onToggle={() => setAdvanced(value => !value)}>
        <DataList
          rows={group.records}
          keyOf={record => record.imageUrl || record.sourceUrl}
          empty={{ title: '후보가 없어요', body: '이 공고에서는 이미지 후보를 찾지 못했어요.' }}
          columns={[
            { key: 'subject', header: 'subjectType', flex: 1.4, render: record => <CellText>{record.subjectType}</CellText> },
            { key: 'source', header: 'sourceType', flex: 1.2, render: record => <CellText>{record.sourceType}</CellText> },
            { key: 'confidence', header: 'confidence', flex: 0.8, render: record => <CellText>{record.confidence}</CellText> },
            { key: 'primary', header: 'primaryScore', flex: 0.9, render: record => <CellText>{record.primaryScore}</CellText> },
            { key: 'verified', header: 'verified', flex: 0.8, render: record => <CellText>{record.verified ? 'true' : 'false'}</CellText> },
            { key: 'url', header: '주소', flex: 3, hideOnNarrow: true, render: record => <CellText muted>{record.imageUrl || '(없음)'}</CellText> },
          ]}
        />
      </Disclosure>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  primaryRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', flexWrap: 'wrap' },
  primaryImage: { width: 220, height: 124, borderRadius: radius.cardSm, backgroundColor: colors.lavender },
  primaryCopy: { flex: 1, minWidth: 180, gap: 2 },
  primaryLabel: { ...type.micro, color: colors.textSubtle },
  primaryKind: { ...type.bodyStrong, color: colors.text },
  primaryMeta: { ...type.micro, color: colors.textSubtle },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumbBox: { width: 116, gap: 2 },
  thumb: { width: '100%', height: 72, borderRadius: radius.cardSm, backgroundColor: colors.lavender },
  thumbLabel: { ...type.micro, color: colors.textSubtle },
});
