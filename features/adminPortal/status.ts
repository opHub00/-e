import type { tint } from '../../design/tokens.ts';

/**
 * 관리자 화면이 쓰는 상태 말과 색.
 *
 * 화면마다 같은 뜻을 다른 말로 적으면 운영자가 매번 다시 읽어야 한다.
 * 그래서 상태는 여기 있는 것만 쓴다. 새 상태가 필요하면 여기에 더한다.
 *
 * 색은 세 가지 뜻만 갖는다.
 *  - green: 지금 잘 돌아간다
 *  - amber: 사람이 봐야 한다
 *  - pink: 막혀 있다
 *  - neutral/purple: 판단이 아니라 분류
 */
export type AdminStatusKey =
  | 'ACTIVE' | 'INACTIVE' | 'REVIEWING' | 'APPROVED' | 'NEEDS_CHECK' | 'ERROR'
  | 'OPEN' | 'UPCOMING' | 'CLOSED'
  | 'ANALYZABLE' | 'NOT_ANALYZABLE' | 'UNKNOWN'
  | 'DRAFT' | 'SUSPENDED' | 'PUBLISHED' | 'INTERNAL' | 'NOT_CONNECTED';

export type AdminStatus = { label: string; tone: keyof typeof tint };

export const ADMIN_STATUS: Record<AdminStatusKey, AdminStatus> = {
  ACTIVE: { label: '활성', tone: 'green' },
  INACTIVE: { label: '비활성', tone: 'neutral' },
  REVIEWING: { label: '검토 중', tone: 'amber' },
  APPROVED: { label: '승인 완료', tone: 'green' },
  NEEDS_CHECK: { label: '확인 필요', tone: 'amber' },
  ERROR: { label: '오류', tone: 'pink' },

  OPEN: { label: '모집중', tone: 'green' },
  UPCOMING: { label: '모집예정', tone: 'amber' },
  CLOSED: { label: '모집종료', tone: 'neutral' },

  ANALYZABLE: { label: '분석 가능', tone: 'green' },
  NOT_ANALYZABLE: { label: '분석 불가', tone: 'neutral' },
  /** 값을 못 읽었을 때. 0 이나 '없음'으로 적지 않는다. */
  UNKNOWN: { label: '확인 불가', tone: 'neutral' },

  DRAFT: { label: '초안', tone: 'neutral' },
  SUSPENDED: { label: '중지', tone: 'pink' },
  PUBLISHED: { label: '사용자 공개', tone: 'green' },
  INTERNAL: { label: '내부용', tone: 'neutral' },
  NOT_CONNECTED: { label: '연결 전', tone: 'neutral' },
};

export const statusOf = (key: AdminStatusKey): AdminStatus => ADMIN_STATUS[key];

/** 숫자를 세 자리마다 끊어 읽기 쉽게. 값이 없으면 "확인 불가". */
export const countLabel = (value: number | null, unit = '건'): string =>
  value === null ? '확인 불가' : `${value.toLocaleString('ko-KR')}${unit}`;

/** 날짜를 운영자가 읽는 형태로. 못 읽으면 빈 값 대신 null 을 돌려 화면이 자리를 비우게 한다. */
export function dateLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}
