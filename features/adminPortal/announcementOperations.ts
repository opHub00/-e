import type { DiscoveryListing } from '../discovery/types.ts';
import type { LearningRow } from '../adminLearningStatus/domain.ts';
import type { ListingVisualRecord } from '../listingVisual/resolver.ts';
import { imageStateOf, lifecycleOf, type ImageOperationState, type LifecycleStep } from './operations.ts';
import type { AdminStatusKey } from './status.ts';

/**
 * 공고 한 건을 운영자 눈으로 본 모습.
 *
 * 관리자 화면은 지금까지 두 곳에서 따로 읽고 있었다.
 *  - 분석 쪽(규칙·검수·연결)은 Supabase 의 공고 행
 *  - 모집 일정·공급 유형·대표 이미지는 사용자 앱이 쓰는 공고 데이터
 * 운영자에게는 둘이 한 공고다. 그래서 여기서 한 번만 붙이고, 화면들은 붙은 결과만 쓴다.
 *
 * 붙이는 열쇠는 listing id 다. 분석 쪽 행이 들고 있는 listingIds 가 사용자 앱의 공고 id 와 같다.
 * 못 붙는 경우가 정상이다(규칙이 없거나 연결 전). 그때는 없는 값을 지어내지 않고 null 로 둔다.
 */
export type AnnouncementOperationRow = {
  announcementId: string;
  title: string;
  announcementNo: string | null;
  region: string;
  publisher: string;
  officialLabel: string;
  source: string;

  /** 분석 쪽에서 온 값 */
  ruleSetId: string | null;
  version: string | null;
  ruleCount: number | null;
  approvedCount: number | null;
  reviewObservable: boolean;
  listingIds: string[];
  analyzable: boolean;
  updatedAt: string;
  lifecycle: LifecycleStep[];
  notes: string[];

  /** 사용자 앱 공고에서 온 값. 못 붙으면 전부 null 이다. */
  listing: DiscoveryListing | null;

  /** 이미지 쪽에서 온 값 */
  imageState: ImageOperationState;
  primaryImageUrl: string | null;
  visualRecords: ListingVisualRecord[];
};

export type JoinInput = {
  rows: LearningRow[];
  listings: DiscoveryListing[];
  visuals: ListingVisualRecord[];
};

/** 공고번호는 listing id(`apt-<관리번호>-<공고번호>`)에서 읽는다. 없으면 null. */
export function announcementNoOf(listingIds: string[]): string | null {
  for (const id of listingIds) {
    const match = id.match(/^apt-[^-]+-(\d+)$/);
    if (match) return match[1];
  }
  return null;
}

export function joinAnnouncements({ rows, listings, visuals }: JoinInput): AnnouncementOperationRow[] {
  const listingById = new Map(listings.map(listing => [listing.id, listing]));
  const visualsByListing = new Map<string, ListingVisualRecord[]>();
  for (const record of visuals) {
    if (!visualsByListing.has(record.listingId)) visualsByListing.set(record.listingId, []);
    visualsByListing.get(record.listingId)!.push(record);
  }

  return rows.map(row => {
    const listing = row.listingIds.map(id => listingById.get(id)).find(Boolean) ?? null;
    const records = row.listingIds.flatMap(id => visualsByListing.get(id) ?? []);
    const primary = records.find(record => record.verified && record.primaryEligible) ?? null;
    return {
      announcementId: row.announcementId,
      title: row.title,
      announcementNo: announcementNoOf(row.listingIds),
      region: row.regionName ?? listing?.region ?? '—',
      publisher: row.publisher ?? row.source ?? '—',
      officialLabel: row.officialLabel,
      source: row.source,
      ruleSetId: row.ruleSetId,
      version: row.version,
      ruleCount: row.ruleCount,
      approvedCount: row.approvedCount,
      reviewObservable: row.reviewObservable,
      listingIds: row.listingIds,
      analyzable: Boolean(row.ruleSetId) && row.listingIds.length > 0,
      updatedAt: row.updatedAt,
      lifecycle: lifecycleOf(row),
      notes: row.notes,
      listing,
      imageState: imageStateOf(records),
      primaryImageUrl: primary?.imageUrl ?? null,
      visualRecords: records,
    };
  });
}

/** 공고 목록에서 고를 수 있는 것. 전부 운영자가 쓰는 말이다. */
export type AnnouncementView =
  | 'ALL' | 'OPEN' | 'UPCOMING' | 'CLOSED'
  | 'ANALYZABLE' | 'NEEDS_REVIEW' | 'NEEDS_IMAGE';

export const ANNOUNCEMENT_VIEW_LABEL: Record<AnnouncementView, string> = {
  ALL: '전체',
  OPEN: '모집중',
  UPCOMING: '모집예정',
  CLOSED: '종료',
  ANALYZABLE: '분석 가능',
  NEEDS_REVIEW: '검수 필요',
  NEEDS_IMAGE: '이미지 확인 필요',
};

/** 분석 쪽에서 아직 승인이 남았거나 상태를 읽지 못한 공고. */
export const needsReview = (row: AnnouncementOperationRow): boolean =>
  Boolean(row.ruleSetId) && (!row.reviewObservable
    || (row.ruleCount !== null && row.approvedCount !== null && row.approvedCount < row.ruleCount));

export const needsImage = (row: AnnouncementOperationRow): boolean => row.imageState !== 'AUTO_VERIFIED';

export function filterByView(rows: AnnouncementOperationRow[], view: AnnouncementView): AnnouncementOperationRow[] {
  switch (view) {
    case 'OPEN': return rows.filter(row => row.listing?.recruitmentStatus === 'open');
    case 'UPCOMING': return rows.filter(row => row.listing?.recruitmentStatus === 'upcoming');
    case 'CLOSED': return rows.filter(row => row.listing?.recruitmentStatus === 'closed');
    case 'ANALYZABLE': return rows.filter(row => row.analyzable);
    case 'NEEDS_REVIEW': return rows.filter(needsReview);
    case 'NEEDS_IMAGE': return rows.filter(needsImage);
    default: return rows;
  }
}

/** 제목·지역·공급기관·공고번호를 함께 본다. 띄어쓰기는 무시한다. */
export function searchAnnouncements(rows: AnnouncementOperationRow[], query: string): AnnouncementOperationRow[] {
  const needle = query.replace(/\s+/g, '').toLowerCase();
  if (!needle) return rows;
  return rows.filter(row =>
    `${row.title}${row.region}${row.publisher}${row.announcementNo ?? ''}${row.announcementId}`
      .replace(/\s+/g, '').toLowerCase().includes(needle));
}

/** 손봐야 하는 공고를 위로. 그다음은 최근 갱신 순. */
export function sortAnnouncements(rows: AnnouncementOperationRow[]): AnnouncementOperationRow[] {
  const rank = (row: AnnouncementOperationRow) => {
    if (needsReview(row)) return 0;
    if (!row.ruleSetId) return 1;
    if (needsImage(row)) return 2;
    return 3;
  };
  return [...rows].sort((left, right) =>
    rank(left) - rank(right)
    || right.updatedAt.localeCompare(left.updatedAt)
    || left.title.localeCompare(right.title));
}

export function selectAnnouncements(
  rows: AnnouncementOperationRow[],
  select: { query: string; view: AnnouncementView },
): AnnouncementOperationRow[] {
  return sortAnnouncements(filterByView(searchAnnouncements(rows, select.query), select.view));
}

/** 공급 유형은 사용자 앱 공고에서만 알 수 있다. 못 붙었으면 지어내지 않는다. */
export const supplyLabel = (row: AnnouncementOperationRow): string => row.listing?.supplyType ?? '확인 불가';

/** 모집 일정 한 줄. 날짜가 없으면 빈 자리를 남긴다. */
export function scheduleLine(row: AnnouncementOperationRow): string {
  const listing = row.listing;
  if (!listing) return '확인 불가';
  const start = listing.recruitmentStartDate?.slice(5).replace('-', '.') ?? null;
  const end = listing.recruitmentEndDate?.slice(5).replace('-', '.') ?? null;
  if (!start && !end) return '—';
  return `${start ?? '—'} ~ ${end ?? '—'}`;
}

export const ANALYSIS_BADGE = (row: AnnouncementOperationRow): AdminStatusKey => {
  if (row.analyzable && !needsReview(row)) return 'ANALYZABLE';
  if (needsReview(row)) return 'NEEDS_CHECK';
  if (!row.ruleSetId) return 'NOT_ANALYZABLE';
  return 'NEEDS_CHECK';
};

/**
 * 이미지를 자동으로 쓰지 못한 이유를 운영자 말로.
 *
 * resolver 가 남긴 문장은 사람이 읽을 수 있게 쓰여 있지만, 한 공고에 여러 개가 쌓인다.
 * 운영자는 "왜 이 공고는 사진이 없나"만 알면 되므로, 가장 많이 나온 이유 하나로 줄인다.
 */
export function imageBlockSummary(records: ListingVisualRecord[]): string | null {
  const blocked = records.filter(record => !record.verified && record.blockedReason);
  if (!blocked.length) return null;
  const counts = new Map<string, number>();
  for (const record of blocked) {
    // 같은 이유가 해상도 숫자만 달라 여러 줄로 보이지 않게, 괄호 안 숫자는 지운다.
    const reason = record.blockedReason!.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0][0];
}
