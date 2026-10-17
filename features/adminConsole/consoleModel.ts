import type {
  AiMode, AssessmentStatus, ConsoleAiEvent, ConsoleAuditEntry, ConsoleNotice, ConsoleSnapshot, NoticeLifecycle,
} from './contract.ts';

/**
 * 콘솔 화면 계산. 모두 받은 snapshot 에서 센다(만들어 내는 숫자 없음).
 * 운영자가 10초 안에 볼 것: 시스템 정상 여부 · 활성 공고 · AI 문제 · 사용자가 막히는 곳.
 */
export const LIFECYCLE_LABEL: Record<NoticeLifecycle, { label: string; tone: 'neutral' | 'purple' | 'amber' | 'green' | 'pink' }> = {
  DRAFT: { label: '초안', tone: 'neutral' },
  SOURCE_VERIFIED: { label: '원문 확인', tone: 'purple' },
  REVIEW_REQUIRED: { label: '검토 필요', tone: 'amber' },
  APPROVED: { label: '승인', tone: 'green' },
  ACTIVE: { label: '서비스 중', tone: 'green' },
  ARCHIVED: { label: '보관', tone: 'neutral' },
};

export const ASSESSMENT_LABEL: Record<AssessmentStatus, { label: string; tone: 'green' | 'amber' | 'neutral' | 'pink' }> = {
  COMPLETE: { label: '판정 완료', tone: 'green' },
  NEEDS_USER_INPUT: { label: '추가 입력 필요', tone: 'amber' },
  INELIGIBLE: { label: '신청 어려움', tone: 'neutral' },
  UNAVAILABLE: { label: '판정 불가', tone: 'pink' },
};

export const AI_MODE_LABEL: Record<AiMode, { label: string; tone: 'green' | 'purple' | 'amber' }> = {
  deterministic: { label: '규칙 답변', tone: 'green' },
  llm: { label: 'AI 답변', tone: 'purple' },
  fallback: { label: '대체 답변', tone: 'amber' },
};

export type AiFilter = 'all' | AiMode | 'grounding' | 'provider';

export function filterAi(events: ConsoleAiEvent[], filter: AiFilter): ConsoleAiEvent[] {
  if (filter === 'all') return events;
  if (filter === 'grounding') return events.filter(event => event.groundingRejected);
  if (filter === 'provider') return events.filter(event => event.providerError);
  return events.filter(event => event.mode === filter);
}

const sameDay = (iso: string, day: string) => iso.slice(0, 10) === day;

export type DashboardModel = {
  kpis: {
    activeNotices: number;
    reviewRequired: number;
    assessmentsToday: number;
    aiToday: number;
    fallbackRate: number | null;
    groundingFailures: number;
  };
  /** 시스템 상태 한 줄: 문제 목록이 비면 '정상'. */
  health: { ok: boolean; issues: string[] };
  recentNoticeChanges: Array<{ at: string; title: string; summary: string; actor: string }>;
  recentErrors: ConsoleSnapshot['errors'];
  assessmentDistribution: Array<{ status: AssessmentStatus; count: number; share: number }>;
  aiModes: Array<{ mode: AiMode; count: number; share: number }>;
  blockers: Array<{ label: string; count: number }>;
};

export function buildDashboard(snapshot: ConsoleSnapshot): DashboardModel {
  const day = snapshot.assessments.date;
  const aiToday = snapshot.ai.filter(event => sameDay(event.at, day));
  const fallback = aiToday.filter(event => event.mode === 'fallback').length;
  const grounding = aiToday.filter(event => event.groundingRejected).length;
  const reviewRequired = new Set([
    ...snapshot.notices.filter(notice => notice.status === 'REVIEW_REQUIRED').map(notice => notice.id),
    ...snapshot.rules.filter(rule => rule.status === 'PENDING').map(rule => rule.noticeId),
  ]).size;
  const statusEntries = Object.entries(snapshot.assessments.byStatus) as Array<[AssessmentStatus, number]>;
  const total = statusEntries.reduce((sum, [, count]) => sum + count, 0);
  const modes: AiMode[] = ['deterministic', 'llm', 'fallback'];
  const fallbackRate = aiToday.length ? fallback / aiToday.length : null;
  const issues = [
    ...snapshot.notices.filter(notice => notice.status === 'ACTIVE' && notice.validation.status === 'FAIL').map(notice => `서비스 중 공고 검증 실패: ${notice.title}`),
    ...(fallbackRate !== null && fallbackRate >= 0.3 ? [`AI 대체 답변 비율 ${Math.round(fallbackRate * 100)}%`] : []),
    ...(grounding ? [`근거 검증 실패 ${grounding}건`] : []),
    ...(snapshot.errors.filter(error => sameDay(error.at, day)).length ? [`오늘 오류 ${snapshot.errors.filter(error => sameDay(error.at, day)).length}건`] : []),
  ];
  return {
    kpis: {
      activeNotices: snapshot.notices.filter(notice => notice.status === 'ACTIVE').length,
      reviewRequired,
      assessmentsToday: total,
      aiToday: aiToday.length,
      fallbackRate,
      groundingFailures: grounding,
    },
    health: { ok: issues.length === 0, issues },
    recentNoticeChanges: snapshot.notices
      .flatMap(notice => notice.history.map(item => ({ ...item, title: notice.title })))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 5),
    recentErrors: [...snapshot.errors].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5),
    assessmentDistribution: statusEntries.map(([status, count]) => ({ status, count, share: total ? count / total : 0 })),
    aiModes: modes.map(mode => {
      const count = aiToday.filter(event => event.mode === mode).length;
      return { mode, count, share: aiToday.length ? count / aiToday.length : 0 };
    }),
    blockers: [...snapshot.assessments.blockers].sort((a, b) => b.count - a.count).slice(0, 6),
  };
}

export const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`);

/** '2026-10-16T09:12:00+09:00' → '10.16 09:12' */
export function shortTime(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  return match ? `${Number(match[2])}.${Number(match[3])} ${match[4]}:${match[5]}` : iso;
}

export const shortHash = (sha: string) => (sha.length > 12 ? `${sha.slice(0, 8)}…${sha.slice(-4)}` : sha);

export type DiffLine = { key: string; before: string; after: string; kind: 'added' | 'removed' | 'changed' };

/** 감사 기록 전후 비교를 사람이 읽는 줄로. 바뀐 필드만. */
export function auditDiff(entry: ConsoleAuditEntry): DiffLine[] {
  const before = entry.before ?? {};
  const after = entry.after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const show = (value: unknown) => (value === undefined || value === null ? '—' : String(value));
  return keys.flatMap(key => {
    const a = before[key];
    const b = after[key];
    if (a === b) return [];
    const kind: DiffLine['kind'] = a === undefined || a === null ? 'added' : b === undefined || b === null ? 'removed' : 'changed';
    return [{ key, before: show(a), after: show(b), kind }];
  });
}

export function noticeById(snapshot: ConsoleSnapshot, id: string | undefined): ConsoleNotice | null {
  return snapshot.notices.find(notice => notice.id === id) ?? null;
}
