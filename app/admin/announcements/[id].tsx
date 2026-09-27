import { useMemo } from 'react';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import type { ImageStyle, StyleProp } from 'react-native';
import { useState } from 'react';
import { colors, radius, spacing, type } from '../../../design/tokens';
import { AdminShell } from '../../../features/adminPortal/AdminShell';
import { useAttached } from '../../../features/adminPortal/useIsWide';
import { useLearningRows } from '../../../features/adminPortal/useLearningRows';
import { adminAccessMessage } from '../../../features/adminPortal/access';
import { dateLabel } from '../../../features/adminPortal/status';
import {
  IMAGE_STATE_BADGE, IMAGE_STATE_LABEL, LIFECYCLE_STATE_BADGE, LIFECYCLE_STATE_LABEL, RECRUITMENT_BADGE,
} from '../../../features/adminPortal/operations';
import {
  imageBlockSummary, joinAnnouncements, supplyLabel, type AnnouncementOperationRow,
} from '../../../features/adminPortal/announcementOperations';
import {
  AdminButton, CellText, DataList, Disclosure, LabeledValue, Notice, PageIntro, SectionCard, StatusBadge,
} from '../../../features/adminPortal/ui/AdminKit';
import { listingVisualRecords } from '../../../features/listingVisual/resolvedRegistry';
import { pickGallery } from '../../../features/listingVisual/resolver';
import { useListingDataset } from '../../../features/discovery/data/useListingDataset';

const SUBJECT_LABEL: Record<string, string> = {
  apartment_exterior: '단지 외관', complex_overview: '단지 전경', building_render: '조감·투시도',
  landscape: '조경', community: '커뮤니티', floor_plan: '평면도', map: '위치도',
  brand: '브랜드 이미지', unknown: '확인 불가',
};

/**
 * 공고 운영 상세.
 *
 * 한 공고에 대해 운영자가 확인하는 것을 한 화면에 모은다: 어떤 공고인지, 언제 접수하는지,
 * 사진이 쓸 만한지, 분석이 어디까지 왔는지, 그리고 다음에 무엇을 누르면 되는지.
 *
 * 고칠 수 있는 것은 아직 없다. 저장할 곳이 없어서다. 그래서 저장 버튼을 만들지 않는다.
 */
export default function AnnouncementDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const attached = useAttached();
  return (
    <AdminShell title="공고 운영" subtitle="이 공고의 상태와 다음에 할 일을 모아 봤어요.">
      {/* 이어받기 전에는 움직이는 요소를 두지 않는다. 미리 그린 화면과 어긋나 통째로 다시 그리게 된다. */}
      {() => (attached && typeof id === 'string'
        ? <Detail announcementId={id} />
        : <SectionCard title="불러오는 중이에요" description="공고를 여는 중이에요.">{null}</SectionCard>)}
    </AdminShell>
  );
}

const Loading = () => (
  <View style={styles.center}><ActivityIndicator color={colors.primary} /><Text style={styles.body}>공고를 불러오는 중이에요</Text></View>
);

function Detail({ announcementId }: { announcementId: string }) {
  const router = useRouter();
  const state = useLearningRows(true);
  const dataset = useListingDataset();

  const row = useMemo(() => {
    if (state.phase !== 'READY') return null;
    return joinAnnouncements({ rows: state.rows, listings: dataset.listings, visuals: listingVisualRecords() })
      .find(item => item.announcementId === announcementId) ?? null;
  }, [state.phase, state.phase === 'READY' ? state.rows : null, dataset.listings, announcementId]);

  if (state.phase === 'LOADING') return <Loading />;
  if (state.phase === 'FAILED') {
    return (
      <SectionCard title="공고를 불러오지 못했어요" description={adminAccessMessage(state.code)}>
        <AdminButton label="다시 불러오기" icon="refresh" onPress={state.refresh} />
      </SectionCard>
    );
  }
  if (!row) {
    return (
      <SectionCard title="이 공고를 찾지 못했어요" description="목록에서 다시 골라 주세요. 권한에 따라 보이지 않는 공고일 수도 있어요.">
        <AdminButton label="공고 목록으로" icon="arrow-back" onPress={() => router.push('/admin/announcements' as Href)} />
      </SectionCard>
    );
  }

  return (
    <>
      <PageIntro
        title={row.title}
        description={`${row.region} · ${row.publisher}${row.announcementNo ? ` · 공고번호 ${row.announcementNo}` : ''}`}
        actions={<AdminButton label="공고 목록" tone="quiet" icon="arrow-back" onPress={() => router.push('/admin/announcements' as Href)} />}
      />

      <Lifecycle row={row} />
      <QuickActions row={row} />
      <Basics row={row} />
      <Schedule row={row} />
      <Images row={row} />
    </>
  );
}

function Lifecycle({ row }: { row: AnnouncementOperationRow }) {
  return (
    <SectionCard
      title="분석 상태"
      description="공고를 모은 뒤 사용자 화면에서 판정이 열리기까지 네 단계예요."
    >
      <View style={styles.lifecycle}>
        {row.lifecycle.map((step, index) => (
          <View key={step.key} style={styles.step}>
            <View style={styles.stepHead}>
              <Text style={styles.stepIndex}>{index + 1}</Text>
              <Text style={styles.stepLabel}>{step.label}</Text>
            </View>
            <StatusBadge status={LIFECYCLE_STATE_BADGE[step.state]} />
            <Text style={styles.stepDetail}>{step.detail}</Text>
          </View>
        ))}
      </View>
      {row.notes.length ? (
        <Notice tone="amber" icon="info">{row.notes.join(' ')}</Notice>
      ) : null}
    </SectionCard>
  );
}

function QuickActions({ row }: { row: AnnouncementOperationRow }) {
  const router = useRouter();
  const listingId = row.listingIds[0] ?? null;
  return (
    <SectionCard title="빠른 작업" description="이 공고에서 자주 하는 일이에요.">
      <View style={styles.actions}>
        <AdminButton
          label="규칙 검수"
          icon="fact-check"
          onPress={() => router.push((row.ruleSetId ? `/admin/rule-review?ruleSetId=${row.ruleSetId}` : '/admin/rule-review') as Href)}
        />
        <AdminButton label="공고-규칙 연결" tone="quiet" icon="link" onPress={() => router.push('/admin/listing-bindings' as Href)} />
        <AdminButton label="이미지 관리" tone="quiet" icon="image" onPress={() => router.push('/admin/images' as Href)} />
        {listingId ? (
          <AdminButton
            label="사용자 화면에서 보기"
            tone="quiet"
            icon="open-in-new"
            onPress={() => router.push(`/discovery/${listingId}` as Href)}
          />
        ) : null}
      </View>
      {!row.ruleSetId ? (
        <Notice tone="amber" icon="rule">
          아직 이 공고에 쓸 활성 규칙이 없어요. 검수 화면에서 규칙을 확인하고 승인해야 사용자 판정이 열려요.
        </Notice>
      ) : null}
    </SectionCard>
  );
}

function Basics({ row }: { row: AnnouncementOperationRow }) {
  const [advanced, setAdvanced] = useState(false);
  return (
    <SectionCard title="기본 정보">
      <View style={styles.valueRow}>
        <LabeledValue label="공고명" value={row.title} />
        <LabeledValue label="공고번호" value={row.announcementNo ?? '확인 불가'} />
        <LabeledValue label="지역" value={row.region} />
        <LabeledValue label="공급기관" value={row.publisher} />
        <LabeledValue label="공급 유형" value={supplyLabel(row)} hint={row.listing ? undefined : '공고 데이터와 아직 이어지지 않았어요'} />
        <LabeledValue label="기준" value={row.officialLabel} />
      </View>
      {row.listing?.address ? <LabeledValue label="주소" value={row.listing.address} /> : null}
      <Disclosure label="고급 정보" open={advanced} onToggle={() => setAdvanced(value => !value)}>
        <View style={styles.valueRow}>
          <LabeledValue label="공고 id" value={row.announcementId} />
          <LabeledValue label="규칙 버전" value={row.version ?? '없음'} />
          <LabeledValue label="연결된 공고 id" value={row.listingIds.join(', ') || '없음'} />
          <LabeledValue label="수집 경로" value={row.source} />
        </View>
      </Disclosure>
    </SectionCard>
  );
}

function Schedule({ row }: { row: AnnouncementOperationRow }) {
  const listing = row.listing;
  if (!listing) {
    return (
      <SectionCard title="모집 일정" description="사용자 화면이 쓰는 공고 데이터에서 읽어요.">
        <Notice icon="help-outline">
          이 공고는 아직 사용자 화면의 공고와 이어지지 않아 일정을 읽을 수 없어요. 공고-규칙 연결을 마치면 보여요.
        </Notice>
      </SectionCard>
    );
  }
  const special = listing.officialSchedule?.specialSupply;
  const priorities = listing.officialSchedule?.priorityApplications ?? [];
  const range = (start: string | null | undefined, end: string | null | undefined) =>
    !start && !end ? '—' : `${dateLabel(start ?? null) ?? '—'} ~ ${dateLabel(end ?? null) ?? '—'}`;

  return (
    <SectionCard
      title="모집 일정"
      description="사용자 화면과 같은 데이터예요. 두 화면의 일정이 어긋나지 않아요."
      action={<StatusBadge status={RECRUITMENT_BADGE[listing.recruitmentStatus]} />}
    >
      <View style={styles.valueRow}>
        <LabeledValue label="공고일" value={dateLabel(listing.announcementDate) ?? '—'} />
        <LabeledValue label="특별공급" value={range(special?.startDate, special?.endDate)} />
        {priorities.map((item, index) => (
          <LabeledValue
            key={`${item.startDate ?? index}`}
            label={index === 0 ? '1순위' : index === 1 ? '2순위' : `${index + 1}순위`}
            value={range(item.startDate, item.endDate)}
          />
        ))}
        {priorities.length === 0 ? (
          <LabeledValue label="접수" value={range(listing.recruitmentStartDate, listing.recruitmentEndDate)} />
        ) : null}
        <LabeledValue label="당첨자 발표" value={dateLabel(listing.winnerAnnouncementDate) ?? '—'} />
        <LabeledValue label="계약" value={range(listing.contractStartDate, listing.contractEndDate)} />
      </View>
      {listing.householdCount !== null ? (
        <LabeledValue label="공급 세대수" value={`${listing.householdCount.toLocaleString('ko-KR')}세대`} />
      ) : null}
    </SectionCard>
  );
}

function Images({ row }: { row: AnnouncementOperationRow }) {
  const [advanced, setAdvanced] = useState(false);
  const gallery = pickGallery(row.visualRecords);
  const primary = gallery[0] ?? null;
  const blockSummary = imageBlockSummary(row.visualRecords);

  return (
    <SectionCard
      title="이미지"
      description="공고의 공식 분양 홈페이지에서 자동으로 찾은 사진이에요."
      action={<StatusBadge status={IMAGE_STATE_BADGE[row.imageState]} />}
    >
      {primary ? (
        <>
          <Image
            accessibilityIgnoresInvertColors
            accessibilityLabel="대표 이미지"
            source={{ uri: primary.imageUrl }}
            style={styles.hero as StyleProp<ImageStyle>}
            resizeMode="cover"
          />
          <Text style={styles.caption}>
            {SUBJECT_LABEL[primary.subjectType] ?? primary.subjectType} · {primary.width}×{primary.height}
          </Text>
          <Text style={styles.caption} numberOfLines={2}>출처: {primary.sourceUrl}</Text>
          <Text style={styles.why}>
            이 사진을 고른 이유: 공식 홈페이지 안에 있고, {SUBJECT_LABEL[primary.subjectType] ?? primary.subjectType}으로 보이며,
            화면에 쓸 만한 크기예요.
          </Text>
        </>
      ) : (
        <Notice tone="amber" icon="image-not-supported">
          {row.imageState === 'NONE'
            ? '이 공고의 공식 홈페이지에서 쓸 만한 사진을 찾지 못했어요.'
            : blockSummary && /블록/.test(blockSummary)
              ? '다른 단지·블록과 구분할 수 없어 자동으로 쓰지 않았어요. 사람이 확인해야 해요.'
              : `자동으로 쓰지 못했어요: ${blockSummary ?? '확인 필요'}`}
          {' '}사용자 화면에는 지도 미리보기가 나와요.
        </Notice>
      )}

      {gallery.length > 1 ? (
        <View style={styles.gallery}>
          {gallery.slice(1).map(record => (
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

      <Notice icon="info">
        사진을 직접 고르거나 바꾸려면 저장할 곳이 필요해요. 지금은 확인만 할 수 있어요.
      </Notice>

      <Disclosure label="고급 정보" open={advanced} onToggle={() => setAdvanced(value => !value)}>
        <DataList
          rows={row.visualRecords}
          keyOf={record => record.imageUrl || record.sourceUrl}
          empty={{ title: '후보가 없어요', body: '이 공고에서는 이미지 후보를 찾지 못했어요.' }}
          columns={[
            { key: 'subject', header: 'subjectType', flex: 1.3, render: record => <CellText>{record.subjectType}</CellText> },
            { key: 'source', header: 'sourceType', flex: 1.1, render: record => <CellText>{record.sourceType}</CellText> },
            { key: 'confidence', header: 'confidence', flex: 0.8, render: record => <CellText>{record.confidence}</CellText> },
            { key: 'primary', header: 'primaryScore', flex: 0.9, render: record => <CellText>{record.primaryScore}</CellText> },
            { key: 'blocked', header: 'blocked reason', flex: 3, render: record => <CellText muted>{record.blockedReason ?? '—'}</CellText> },
          ]}
        />
      </Disclosure>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  body: { ...type.body, color: colors.textMuted },
  center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  valueRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  lifecycle: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  step: { minWidth: 160, flex: 1, gap: 4 },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepIndex: { ...type.micro, color: colors.onPrimary, backgroundColor: colors.primary, width: 18, height: 18, borderRadius: 999, textAlign: 'center', lineHeight: 18 },
  stepLabel: { ...type.bodySmStrong, color: colors.text },
  stepDetail: { ...type.micro, color: colors.textSubtle, lineHeight: 16 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  hero: { width: '100%', height: 220, borderRadius: radius.cardSm, backgroundColor: colors.lavender },
  caption: { ...type.micro, color: colors.textSubtle },
  why: { ...type.bodySm, color: colors.textMuted, lineHeight: 20 },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumbBox: { width: 116, gap: 2 },
  thumb: { width: '100%', height: 72, borderRadius: radius.cardSm, backgroundColor: colors.lavender },
  thumbLabel: { ...type.micro, color: colors.textSubtle },
});
