import type { LearningRow } from '../adminLearningStatus/domain.ts';

/**
 * 공고 관리 목록의 한 행.
 *
 * 상태 문구는 관측한 사실에만 붙인다. 활성 규칙이 보이지 않는 것은 "규칙 없음"이 아니라
 * "활성 규칙 없음"이고, 그 옆에 RLS 때문에 검수 중·비활성은 조회할 수 없다는 사실을 함께 둔다.
 */
export type AnnouncementStatusKey = 'ANALYZABLE' | 'NO_ACTIVE_RULES' | 'REVIEW_UNKNOWN' | 'NOT_BOUND' | 'ATTENTION';

export type AnnouncementStatus = { key: AnnouncementStatusKey; label: string; tone: 'green' | 'amber' | 'neutral' };

export type AdminAnnouncementRow = {
  announcementId: string;
  title: string;
  region: string;
  publisher: string;
  announcementDate: string;
  /** 모집 상태는 공고 데이터로 알 수 없다. 지금 관리자 API 가 주는 것은 공고일까지다. */
  analyzable: boolean;
  officialLabel: string;
  version: string;
  ruleCount: string;
  approvedCount: string;
  bindingLabel: string;
  updatedAt: string;
  statuses: AnnouncementStatus[];
  ruleSetId: string | null;
  notes: string[];
};

const dash = (value: string | null | undefined) => (value && value.length ? value : '—');
const unknown = (value: number | null) => (value === null ? '확인 불가' : `${value}개`);

export function buildAnnouncementRows(rows: LearningRow[]): AdminAnnouncementRow[] {
  return rows.map(row => {
    const analyzable = Boolean(row.ruleSetId) && row.listingIds.length > 0;
    const statuses: AnnouncementStatus[] = [];
    if (analyzable) statuses.push({ key: 'ANALYZABLE', label: '분석 가능', tone: 'green' });
    if (!row.ruleSetId) statuses.push({ key: 'NO_ACTIVE_RULES', label: '활성 규칙 없음', tone: 'amber' });
    if (row.ruleSetId && !row.reviewObservable) statuses.push({ key: 'REVIEW_UNKNOWN', label: '검수 확인 필요', tone: 'amber' });
    if (row.ruleSetId && row.listingIds.length === 0) statuses.push({ key: 'NOT_BOUND', label: 'listing 연결 없음', tone: 'amber' });
    if (analyzable && row.listingIds.length > 0) statuses.push({ key: 'ATTENTION', label: '연결 완료', tone: 'green' });
    return {
      announcementId: row.announcementId,
      title: row.title,
      region: dash(row.regionName),
      publisher: dash(row.publisher ?? row.source),
      announcementDate: dash(row.announcementDate),
      analyzable,
      officialLabel: row.officialLabel,
      version: dash(row.version),
      ruleCount: unknown(row.ruleCount),
      approvedCount: unknown(row.approvedCount),
      bindingLabel: row.listingIds.length ? `${row.listingIds.length}건` : '없음',
      updatedAt: row.updatedAt ? row.updatedAt.slice(0, 10) : '—',
      statuses,
      ruleSetId: row.ruleSetId,
      notes: row.notes,
    };
  });
}

/** 운영자가 먼저 볼 것: 분석 가능 → 활성 규칙 있음 → 나머지. 같은 그룹은 최근 갱신 순. */
export function sortAnnouncementRows(rows: AdminAnnouncementRow[]): AdminAnnouncementRow[] {
  const rank = (row: AdminAnnouncementRow) => (row.analyzable ? 0 : row.ruleSetId ? 1 : 2);
  return [...rows].sort((left, right) => rank(left) - rank(right) || right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title));
}

export type AnnouncementFilter = 'ALL' | 'ANALYZABLE' | 'NO_ACTIVE_RULES';

export function filterAnnouncementRows(rows: AdminAnnouncementRow[], filter: AnnouncementFilter): AdminAnnouncementRow[] {
  if (filter === 'ANALYZABLE') return rows.filter(row => row.analyzable);
  if (filter === 'NO_ACTIVE_RULES') return rows.filter(row => !row.ruleSetId);
  return rows;
}
