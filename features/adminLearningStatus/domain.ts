/**
 * 공고 학습 현황을 "지금 클라이언트가 실제로 관측할 수 있는 사실"로만 구성한다.
 *
 * RLS 때문에 활성·공개·승인된 rule set 만 보인다. 그래서 규칙이 안 보이는 것은
 * "규칙이 없다"가 아니라 "활성화된 규칙이 없다(비활성·검수 중은 이 화면에서 볼 수 없다)"이다.
 * 이 구분을 지키지 않으면 관리자가 아직 검수 중인 공고를 없는 것으로 오해한다.
 *
 * 추출·수집 job 진행 상태는 source of truth 가 없으므로 아예 다루지 않는다.
 */

export type ObservedState = 'OBSERVED' | 'NOT_OBSERVED' | 'NOT_OBSERVABLE';

export type StageKey = 'collected' | 'ruleSet' | 'review' | 'active' | 'binding';

export type Stage = { key: StageKey; label: string; state: ObservedState; detail: string };

export type AnnouncementRecord = {
  id: string;
  title: string;
  source: string;
  publisher: string | null;
  announcementDate: string | null;
  regionName: string | null;
  updatedAt: string;
  createdAt: string;
};

/** RLS 가 보여주는 rule set(활성·공개·승인된 것)만 들어온다. */
export type VisibleRuleSet = {
  id: string;
  announcementId: string;
  version: string;
  sourceStatus: 'REFERENCE' | 'DRAFT_SOURCE_VERIFIED' | 'OFFICIAL_VERIFIED';
  approvedAt: string | null;
  effectiveDate: string | null;
  isActive: boolean;
};

export type VisibleBinding = { listingId: string; announcementId: string; boundRuleSetId: string | null; updatedAt: string };

/** 검수 상태는 reviewer/admin 전용 RPC 로만 온다. 실패하면 "확인 불가"로 남긴다. */
export type ReviewObservation =
  | { ruleSetId: string; observable: true; totalRules: number; approved: number; edited: number; pending: number; held: number; rejected: number; lifecycleStatus: string; documentChanged: boolean }
  | { ruleSetId: string; observable: false; reason: string };

export type LearningStatusInput = {
  announcements: AnnouncementRecord[];
  ruleSets: VisibleRuleSet[];
  bindings: VisibleBinding[];
  reviews: ReviewObservation[];
};

export type LearningRow = {
  announcementId: string;
  title: string;
  source: string;
  publisher: string | null;
  regionName: string | null;
  announcementDate: string | null;
  updatedAt: string;
  officialLabel: string;
  ruleSetId: string | null;
  version: string | null;
  /** 검수 RPC 로 확인한 값. 확인 불가면 null 이고, 0 과 구분된다. */
  ruleCount: number | null;
  approvedCount: number | null;
  reviewObservable: boolean;
  lifecycleStatus: string | null;
  listingIds: string[];
  stages: Stage[];
  /** 관측된 제약·주의. 추정하지 않고 확인된 것만 적는다. */
  notes: string[];
};

export const SOURCE_STATUS_LABEL: Record<VisibleRuleSet['sourceStatus'], string> = {
  REFERENCE: '원문 확인 전',
  DRAFT_SOURCE_VERIFIED: '검토본 기준',
  OFFICIAL_VERIFIED: '공식 공고 기준',
};

/** 활성 rule set 이 보이지 않을 때 쓰는 문구. "규칙 없음"으로 단정하지 않는다. */
export const NOT_OBSERVABLE_RULE_NOTE = '검수 중이거나 비활성인 규칙은 이 화면에서 확인할 수 없어요.';
export const NOT_OBSERVABLE_REVIEW_NOTE = '검수 상태는 활성화된 규칙에 대해서만 확인할 수 있어요.';

const LIFECYCLE_LABEL: Record<string, string> = {
  PENDING_REVIEW: '검수 시작 전',
  IN_REVIEW: '검수 진행 중',
  REVALIDATION_REQUIRED: '원문이 바뀌어 재검수 필요',
};

export const lifecycleLabel = (status: string | null) => (status ? LIFECYCLE_LABEL[status] ?? status : '확인 불가');

/**
 * 공고 한 건의 단계 표시.
 * 관측된 사실(OBSERVED), 관측했으나 없음(NOT_OBSERVED), 애초에 관측 불가(NOT_OBSERVABLE)를 구분한다.
 */
function buildStages(ruleSet: VisibleRuleSet | undefined, review: ReviewObservation | undefined, listingIds: string[]): Stage[] {
  const collected: Stage = { key: 'collected', label: '수집', state: 'OBSERVED', detail: '공고 등록됨' };
  if (!ruleSet) {
    return [
      collected,
      { key: 'ruleSet', label: '규칙', state: 'NOT_OBSERVABLE', detail: '활성화된 규칙 없음' },
      { key: 'review', label: '검수', state: 'NOT_OBSERVABLE', detail: '검수 상태 확인 불가' },
      { key: 'active', label: '활성화', state: 'NOT_OBSERVED', detail: '활성화된 규칙 없음' },
      { key: 'binding', label: '연결', state: listingIds.length ? 'OBSERVED' : 'NOT_OBSERVED', detail: listingIds.length ? `listing ${listingIds.length}건 연결됨` : '연결된 listing 없음' },
    ];
  }
  const reviewStage: Stage = review?.observable
    ? {
      key: 'review',
      label: '검수',
      state: 'OBSERVED',
      detail: `검수 상태 확인 가능 · 승인 ${review.approved + review.edited}/${review.totalRules}`,
    }
    : { key: 'review', label: '검수', state: 'NOT_OBSERVABLE', detail: '검수 상태 확인 불가' };
  return [
    collected,
    { key: 'ruleSet', label: '규칙', state: 'OBSERVED', detail: review?.observable ? `규칙 ${review.totalRules}개` : '활성화된 규칙 있음' },
    reviewStage,
    { key: 'active', label: '활성화', state: 'OBSERVED', detail: `활성 · ${ruleSet.version}` },
    { key: 'binding', label: '연결', state: listingIds.length ? 'OBSERVED' : 'NOT_OBSERVED', detail: listingIds.length ? `listing ${listingIds.length}건 연결됨` : '연결된 listing 없음' },
  ];
}

function buildNotes(ruleSet: VisibleRuleSet | undefined, review: ReviewObservation | undefined, listingIds: string[]): string[] {
  const notes: string[] = [];
  if (!ruleSet) { notes.push(NOT_OBSERVABLE_RULE_NOTE); return notes; }
  if (!review) notes.push(NOT_OBSERVABLE_REVIEW_NOTE);
  else if (!review.observable) notes.push(`검수 상태 확인 불가 (${review.reason})`);
  else {
    if (review.documentChanged) notes.push('검수한 원문과 현재 원문의 해시가 달라요. 재검수가 필요해요.');
    const remaining = review.pending + review.held;
    if (remaining > 0) notes.push(`아직 승인되지 않은 규칙 ${remaining}개가 있어요.`);
    if (review.rejected > 0) notes.push(`반려된 규칙 ${review.rejected}개가 있어요.`);
  }
  if (!listingIds.length) notes.push('이 공고에 연결된 listing 이 없어 사용자 판정에 쓰이지 않아요.');
  return notes;
}

/** 공고별 한 줄. 최근에 바뀐 공고를 위로 올린다. */
export function buildLearningRows(input: LearningStatusInput): LearningRow[] {
  const ruleSetByAnnouncement = new Map(input.ruleSets.filter(set => set.isActive).map(set => [set.announcementId, set]));
  const reviewByRuleSet = new Map(input.reviews.map(review => [review.ruleSetId, review]));
  const listingsByAnnouncement = new Map<string, string[]>();
  for (const binding of input.bindings) {
    if (!listingsByAnnouncement.has(binding.announcementId)) listingsByAnnouncement.set(binding.announcementId, []);
    listingsByAnnouncement.get(binding.announcementId)!.push(binding.listingId);
  }
  return input.announcements
    .map(announcement => {
      const ruleSet = ruleSetByAnnouncement.get(announcement.id);
      const review = ruleSet ? reviewByRuleSet.get(ruleSet.id) : undefined;
      const listingIds = (listingsByAnnouncement.get(announcement.id) ?? []).slice().sort();
      const observed = review?.observable ? review : undefined;
      return {
        announcementId: announcement.id,
        title: announcement.title,
        source: announcement.source,
        publisher: announcement.publisher,
        regionName: announcement.regionName,
        announcementDate: announcement.announcementDate,
        updatedAt: announcement.updatedAt,
        officialLabel: ruleSet ? SOURCE_STATUS_LABEL[ruleSet.sourceStatus] : '확인 불가',
        ruleSetId: ruleSet?.id ?? null,
        version: ruleSet?.version ?? null,
        ruleCount: observed ? observed.totalRules : null,
        approvedCount: observed ? observed.approved + observed.edited : null,
        reviewObservable: Boolean(observed),
        lifecycleStatus: observed ? observed.lifecycleStatus : null,
        listingIds,
        stages: buildStages(ruleSet, review, listingIds),
        notes: buildNotes(ruleSet, review, listingIds),
      };
    })
    .sort((left, right) => (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '') || left.title.localeCompare(right.title));
}

/** 화면 상단 요약. 역시 관측된 것만 센다. */
export function summarizeLearningRows(rows: LearningRow[]) {
  return {
    announcements: rows.length,
    withActiveRules: rows.filter(row => row.ruleSetId).length,
    reviewObservable: rows.filter(row => row.reviewObservable).length,
    bound: rows.filter(row => row.listingIds.length > 0).length,
    needsAttention: rows.filter(row => row.notes.length > 0).length,
  };
}
