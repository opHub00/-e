import type { DiscoveryListing } from '../discovery/types.ts';
import type { LearningRow } from '../adminLearningStatus/domain.ts';
import type { ListingVisualRecord } from '../listingVisual/resolver.ts';
import type { AdminStatusKey } from './status.ts';

/**
 * 운영자가 "지금 손봐야 할 것"을 추리는 규칙.
 *
 * 화면이 아니라 여기에 둔다. 대시보드와 각 목록이 같은 기준을 쓰고, 기준이 바뀌면 한 곳만 고친다.
 * 모든 항목은 관측된 사실에서만 나온다. 확인할 수 없는 것은 세지 않고 "확인 불가"로 남긴다.
 */

/** 이미지 상태를 운영자 말로. confidence 숫자를 먼저 보여주지 않는다. */
export type ImageOperationState = 'AUTO_VERIFIED' | 'NEEDS_HUMAN' | 'UNUSABLE' | 'NONE';

export const IMAGE_STATE_LABEL: Record<ImageOperationState, string> = {
  AUTO_VERIFIED: '자동 확인 완료',
  NEEDS_HUMAN: '직접 확인 필요',
  UNUSABLE: '사용 불가',
  NONE: '후보 없음',
};

export const IMAGE_STATE_BADGE: Record<ImageOperationState, AdminStatusKey> = {
  AUTO_VERIFIED: 'APPROVED',
  NEEDS_HUMAN: 'NEEDS_CHECK',
  UNUSABLE: 'NOT_ANALYZABLE',
  NONE: 'UNKNOWN',
};

/**
 * 한 공고의 이미지 상태.
 *
 * 대표로 쓸 수 있는 그림이 있으면 '자동 확인 완료'.
 * 통과한 그림은 있는데 대표로 세울 만한 게 없으면 사람이 봐야 한다.
 * 후보는 있었지만 전부 막혔으면 지금 쓸 수 없는 상태다.
 */
export function imageStateOf(records: ListingVisualRecord[]): ImageOperationState {
  if (!records.length) return 'NONE';
  if (records.some(record => record.verified && record.primaryEligible)) return 'AUTO_VERIFIED';
  if (records.some(record => record.verified)) return 'NEEDS_HUMAN';
  if (records.some(record => record.imageUrl)) return 'UNUSABLE';
  return 'NONE';
}

/** 운영자가 클릭해서 바로 들어갈 수 있는 할 일 한 줄. */
export type OperationTask = {
  key: string;
  label: string;
  count: number;
  /** 왜 이게 할 일인지. 숫자만 보여주면 무엇을 해야 할지 모른다. */
  detail: string;
  href: string;
  tone: 'amber' | 'neutral';
};

export type TaskInput = {
  rows: LearningRow[];
  /** 공고별 이미지 상태. 못 읽었으면 비워 둔다. */
  imageStates: Map<string, ImageOperationState>;
};

/**
 * 확인이 필요한 일 목록.
 *
 * 0 건인 항목도 남긴다. "지금 할 일이 없다"는 것도 운영자가 알아야 하는 사실이고,
 * 항목이 사라졌다 나타났다 하면 화면을 믿기 어려워진다.
 */
export function operationTasks({ rows, imageStates }: TaskInput): OperationTask[] {
  const noActiveRules = rows.filter(row => !row.ruleSetId);
  const notBound = rows.filter(row => row.ruleSetId && row.listingIds.length === 0);
  const reviewUnknown = rows.filter(row => row.ruleSetId && !row.reviewObservable);
  const pendingReview = rows.filter(row =>
    row.ruleSetId && row.reviewObservable && row.ruleCount !== null && row.approvedCount !== null
    && row.approvedCount < row.ruleCount);
  const draftSource = rows.filter(row => row.officialLabel === '원문 확인 전');
  const missingImage = rows.filter(row => {
    const state = imageStates.get(row.announcementId);
    return state === undefined || state === 'NONE' || state === 'UNUSABLE' || state === 'NEEDS_HUMAN';
  });

  const task = (key: string, label: string, list: unknown[], detail: string, href: string): OperationTask => ({
    key, label, count: list.length, detail, href, tone: list.length ? 'amber' : 'neutral',
  });

  return [
    task('pendingReview', '검수 대기 규칙이 있는 공고', pendingReview,
      '승인되지 않은 규칙이 남아 있어요. 검수를 끝내야 서비스에 쓸 수 있어요.', '/admin/rule-review'),
    task('noActiveRules', '활성 규칙이 없는 공고', noActiveRules,
      '분석에 쓸 규칙이 아직 없어요. 규칙을 만들고 검수해야 해요.', '/admin/learning-status'),
    task('notBound', '공고-규칙이 연결되지 않은 공고', notBound,
      '규칙은 있는데 공고에 이어지지 않았어요. 연결해야 사용자 화면이 열려요.', '/admin/listing-bindings'),
    task('missingImage', '대표 이미지를 확인해야 하는 공고', missingImage,
      '자동으로 찾은 대표 이미지가 없거나 사람이 봐야 해요.', '/admin/images'),
    task('draftSource', '원문 확인 전 공고', draftSource,
      '공식 공고문과 대조하기 전이에요. 기준이 바뀔 수 있어요.', '/admin/announcements'),
    task('reviewUnknown', '검수 상태를 확인할 수 없는 공고', reviewUnknown,
      '검수 정보를 읽지 못했어요. 권한이나 연결을 확인해 주세요.', '/admin/learning-status'),
  ];
}

/** 공고 하나가 지금 어느 단계까지 왔는가. 운영자 말로만 적는다. */
export type LifecycleStep = {
  key: 'collected' | 'rules' | 'reviewed' | 'live';
  label: string;
  state: 'DONE' | 'NEEDS_CHECK' | 'NOT_STARTED' | 'UNKNOWN';
  detail: string;
};

export const LIFECYCLE_STATE_BADGE: Record<LifecycleStep['state'], AdminStatusKey> = {
  DONE: 'APPROVED',
  NEEDS_CHECK: 'NEEDS_CHECK',
  NOT_STARTED: 'INACTIVE',
  UNKNOWN: 'UNKNOWN',
};

export const LIFECYCLE_STATE_LABEL: Record<LifecycleStep['state'], string> = {
  DONE: '완료', NEEDS_CHECK: '확인 필요', NOT_STARTED: '미진행', UNKNOWN: '확인 불가',
};

/**
 * 공고 수집 → 분석 규칙 생성 → 관리자 검수 → 서비스 적용.
 *
 * 네 단계면 운영자가 "지금 어디서 막혔는지"를 한 줄에서 읽는다.
 * 검수 정보를 읽지 못한 것과 검수가 안 끝난 것은 다르다. 둘을 섞지 않는다.
 */
export function lifecycleOf(row: LearningRow): LifecycleStep[] {
  const reviewed = row.reviewObservable && row.ruleCount !== null && row.approvedCount !== null
    ? row.approvedCount >= row.ruleCount
    : null;
  return [
    {
      key: 'collected', label: '공고 수집', state: 'DONE',
      detail: row.officialLabel === '원문 확인 전' ? '공고는 있지만 원문과 대조 전이에요.' : row.officialLabel,
    },
    {
      key: 'rules', label: '분석 규칙 생성',
      state: row.ruleSetId ? 'DONE' : 'NOT_STARTED',
      detail: row.ruleSetId
        ? `규칙 ${row.ruleCount ?? '확인 불가'}개`
        : '활성 규칙이 없어요. 검수 중이거나 비활성인 규칙은 이 화면에서 볼 수 없어요.',
    },
    {
      key: 'reviewed', label: '관리자 검수',
      state: !row.ruleSetId ? 'NOT_STARTED' : reviewed === null ? 'UNKNOWN' : reviewed ? 'DONE' : 'NEEDS_CHECK',
      detail: !row.ruleSetId ? '규칙이 있어야 검수할 수 있어요.'
        : reviewed === null ? '검수 정보를 읽지 못했어요.'
        : `승인 ${row.approvedCount} / ${row.ruleCount}개`,
    },
    {
      key: 'live', label: '서비스 적용',
      state: row.listingIds.length ? 'DONE' : row.ruleSetId ? 'NEEDS_CHECK' : 'NOT_STARTED',
      detail: row.listingIds.length ? `공고 ${row.listingIds.length}건에 연결됨` : '아직 공고에 연결되지 않았어요.',
    },
  ];
}

/** 모집 상태를 관리자 배지로. 공고 데이터가 주는 값만 쓴다. */
export const RECRUITMENT_BADGE: Record<DiscoveryListing['recruitmentStatus'], AdminStatusKey> = {
  open: 'OPEN', upcoming: 'UPCOMING', closed: 'CLOSED', unknown: 'UNKNOWN',
};

export type ScheduleRow = {
  listingId: string;
  complexName: string;
  district: string;
  recruitmentStatus: DiscoveryListing['recruitmentStatus'];
  announcementDate: string | null;
  recruitmentStartDate: string | null;
  recruitmentEndDate: string | null;
  winnerAnnouncementDate: string | null;
  contractStartDate: string | null;
  /** 마감까지 남은 날. 날짜를 모르면 null 이고 화면은 자리를 비운다. */
  daysToClose: number | null;
};

const dayDiff = (from: Date, to: string | null): number | null => {
  if (!to) return null;
  const target = new Date(to);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - from.getTime()) / 86_400_000);
};

/** 접수가 임박한 순서로. 날짜를 모르는 공고는 뒤로 민다. */
export function scheduleRows(listings: DiscoveryListing[], now = new Date()): ScheduleRow[] {
  return listings
    .map(listing => ({
      listingId: listing.id,
      complexName: listing.complexName,
      district: listing.district,
      recruitmentStatus: listing.recruitmentStatus,
      announcementDate: listing.announcementDate,
      recruitmentStartDate: listing.recruitmentStartDate,
      recruitmentEndDate: listing.recruitmentEndDate,
      winnerAnnouncementDate: listing.winnerAnnouncementDate,
      contractStartDate: listing.contractStartDate,
      daysToClose: dayDiff(now, listing.recruitmentEndDate),
    }))
    .sort((left, right) => {
      const rank = (row: ScheduleRow) => (row.daysToClose === null ? 2 : row.daysToClose < 0 ? 1 : 0);
      return rank(left) - rank(right)
        || (left.daysToClose ?? 0) - (right.daysToClose ?? 0)
        || left.complexName.localeCompare(right.complexName);
    });
}
