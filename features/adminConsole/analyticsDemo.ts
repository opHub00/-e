import type { AnalyticsEvent, AnalyticsEnvironment, AnalyticsTrafficType, AnalyticsQuery, AnalyticsSummary, UnresolvedCategory } from '../productV3/analytics/contract.ts';
import { getAnalyticsSummary } from '../productV3/analytics/core.ts';
import type { ConsoleLoadErrorKind } from './consoleState.ts';
import type { ConsoleNotice } from './contract.ts';
import { QA_FILTERS, type AnalyticsFilters } from './analyticsModel.ts';

/**
 * 운영 지표 화면 점검용 예시. Demo 빌드 + ?demo=1&analytics=… 에서만 열린다.
 * 요약 숫자를 손으로 적지 않는다. 계약 모양의 가짜 이벤트를 만들고 Codex 의 getAnalyticsSummary 로 집계한다.
 * 예시 이벤트에는 사람 정보·답변·대화가 없다(계약에 그런 필드가 없다).
 */
export type AnalyticsDemoKey = 'prelaunch' | 'qa0' | 'qa20' | 'qa100' | 'qa500' | 'live' | 'live0' | 'live500' | 'aiwarn' | 'stale'
  | 'error' | 'timeout' | 'forbidden' | 'unauthorized';
export const ANALYTICS_DEMO_KEYS: AnalyticsDemoKey[] = ['prelaunch', 'qa0', 'qa20', 'qa100', 'qa500', 'live', 'live0', 'live500', 'aiwarn', 'stale', 'error', 'timeout', 'forbidden', 'unauthorized'];
export const ANALYTICS_DEMO_LABEL: Record<AnalyticsDemoKey, string> = {
  prelaunch: '운영 개시 전', qa0: 'QA 0세션', qa20: 'QA 20세션', qa100: 'QA 100세션', qa500: 'QA 500세션',
  live: '운영 중', live0: '운영 중 · 0세션', live500: '운영 중 · 500세션', aiwarn: 'AI 경고', stale: '오래된 조회',
  error: '집계 서버 오류', timeout: '집계 지연', forbidden: '관리자 아님', unauthorized: '로그인 필요',
};

export type AnalyticsDemo = {
  now: Date;
  notices: Array<Pick<ConsoleNotice, 'id' | 'status' | 'provenance'>>;
  initialFilters?: Partial<AnalyticsFilters>;
  failure?: { kind: ConsoleLoadErrorKind; status: number | null };
  /** 조회 시각을 이만큼 과거로(오래된 데이터 점검) */
  staleMinutes?: number;
  load: (query: AnalyticsQuery) => AnalyticsSummary;
};

export const parseAnalyticsDemo = (value: string | string[] | undefined): AnalyticsDemoKey => {
  const raw = Array.isArray(value) ? value[0] : value;
  return ANALYTICS_DEMO_KEYS.includes(raw as AnalyticsDemoKey) ? raw as AnalyticsDemoKey : 'prelaunch';
};

const PRE_LAUNCH_NOW = new Date('2026-10-22T10:00:00+09:00');
const LIVE_NOW = new Date('2026-11-12T10:00:00+09:00');
const notices = (official: boolean): AnalyticsDemo['notices'] => ['samdo-1', 'samdo-2'].map(id => ({
  id, status: 'ACTIVE' as const, provenance: { fileName: `(최종1.8) ${id}.hwp`, sha256: '', official },
}));

type Volume = { environment: AnalyticsEnvironment; trafficType: AnalyticsTrafficType; sessions: number; aiStress?: boolean };

export function analyticsDemo(key: AnalyticsDemoKey): AnalyticsDemo {
  // 조회 실패 상황은 운영 개시 후로 둔다(개시 전 real 화면은 요청 자체를 하지 않는다).
  const live = ['live', 'live0', 'live500', 'aiwarn', 'stale', 'error', 'timeout', 'forbidden', 'unauthorized'].includes(key);
  const now = live ? LIVE_NOW : PRE_LAUNCH_NOW;
  const qaSessions = { qa0: 0, qa20: 20, qa100: 100, qa500: 500 }[key as 'qa0'] ?? 40;
  const realSessions = key === 'live0' ? 0 : key === 'live500' ? 500 : live ? 120 : 0;
  const volumes: Volume[] = [
    { environment: 'staging', trafficType: 'qa', sessions: qaSessions },
    { environment: 'staging', trafficType: 'internal', sessions: 6 },
    ...(live ? [{ environment: 'production' as const, trafficType: 'real' as const, sessions: realSessions, aiStress: key === 'aiwarn' }] : []),
  ];
  const events = volumes.flatMap((volume, index) => generateEvents(volume, now, 7 + index * 101 + volume.sessions));
  const failure = ({ error: { kind: 'SERVER', status: 503 }, timeout: { kind: 'TIMEOUT', status: null }, forbidden: { kind: 'FORBIDDEN', status: 403 }, unauthorized: { kind: 'UNAUTHORIZED', status: 401 } } as const)[key as 'error'];
  return {
    now,
    notices: notices(live),
    ...(key.startsWith('qa') ? { initialFilters: QA_FILTERS } : {}),
    ...(failure ? { failure } : {}),
    ...(key === 'stale' ? { staleMinutes: 42 } : {}),
    load: query => getAnalyticsSummary(events, query),
  };
}

/* ── 결정적 가짜 이벤트 ─────────────────────────────────────────────────── */

function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, weighted: ReadonlyArray<readonly [T, number]>): T {
  const total = weighted.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of weighted) { roll -= weight; if (roll <= 0) return value; }
  return weighted[weighted.length - 1][0];
}

const uuid = (random: () => number) => {
  const hex = Array.from({ length: 32 }, () => Math.floor(random() * 16).toString(16)).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

const SUPPLIES = ['YOUTH', 'NEWLYWED', 'NEWBORN', 'FIRST_HOME', 'GENERAL'] as const;
const CATEGORY_WEIGHT: ReadonlyArray<readonly [UnresolvedCategory, number]> = [
  ['rewinning_restriction', 9], ['assets', 7], ['subscription_account', 6], ['income', 5], ['residency', 4],
  ['household', 3], ['marriage_child', 2], ['evidence', 2], ['other', 1],
];

function generateEvents(volume: Volume, now: Date, seed: number): AnalyticsEvent[] {
  const random = rng(seed);
  const events: AnalyticsEvent[] = [];
  const day = 86_400_000;
  // 현재 30일 + 이전 30일(이전 기간 비교용, 조금 적게)
  const sessions = [
    ...Array.from({ length: volume.sessions }, () => now.getTime() - random() * 29.5 * day),
    ...Array.from({ length: Math.round(volume.sessions * 0.8) }, () => now.getTime() - (30 + random() * 30) * day),
  ];
  for (const start of sessions) {
    const sessionId = uuid(random);
    const sessionNotice = random() < 0.55 ? 'samdo-1' : 'samdo-2';
    let clock = start;
    const push = (eventType: AnalyticsEvent['eventType'], extra: Partial<AnalyticsEvent> = {}, noticeId = sessionNotice) => {
      clock += 20_000 + random() * 50_000;
      events.push({ eventId: uuid(random), anonymousSessionId: sessionId, noticeId, noticeVersion: 'VER1.8', eventType,
        occurredAt: new Date(Math.min(clock, now.getTime() - 1000)).toISOString(), environment: volume.environment, trafficType: volume.trafficType, ...extra });
    };
    push('SESSION_STARTED');
    if (random() < 0.86) {
      for (const noticeId of ['samdo-1', 'samdo-2']) push('ASSESSMENT_STARTED', {}, noticeId);
      if (random() < 0.82) {
        for (const noticeId of ['samdo-1', 'samdo-2']) for (const supplyType of SUPPLIES) {
          const status = pick(random, [['COMPLETE', 34], ['NEEDS_USER_INPUT', 28], ['INELIGIBLE', 33], ['UNAVAILABLE', 5]] as const);
          push('ASSESSMENT_COMPLETED', { supplyType, assessmentStatus: status }, noticeId);
          if (status === 'NEEDS_USER_INPUT') for (let count = random() < 0.4 ? 2 : 1; count > 0; count -= 1)
            push('FACT_MARKED_UNKNOWN', { supplyType, unresolvedCategory: pick(random, CATEGORY_WEIGHT) }, noticeId);
        }
        for (let views = 1 + Math.floor(random() * 3); views > 0; views -= 1) push('RESULT_VIEWED');
        if (random() < 0.35) push('RESULT_SAVED');
        if (random() < 0.45) push('QR_CREATED');
        if (random() < 0.3) push('NOTICE_COMPARED');
      }
    }
    if (random() < 0.55) {
      const stress = volume.aiStress;
      for (let turn = 1, turns = 1 + Math.floor(random() * 4); turn <= turns; turn += 1) {
        const aiMode = pick(random, stress ? [['deterministic', 30], ['llm', 30], ['fallback', 40]] as const : [['deterministic', 46], ['llm', 46], ['fallback', 8]] as const);
        const fallbackReason = aiMode === 'fallback' ? pick(random, stress
          ? [['provider_error', 5], ['timeout', 3], ['grounding_rejected', 2], ['parser_failure', 1]] as const
          : [['grounding_rejected', 5], ['missing_key', 1], ['parser_failure', 1], ['unknown', 1]] as const) : undefined;
        push('COPILOT_USED', { conversationTurnCount: turn, aiMode, ...(fallbackReason ? { fallbackReason } : {}) });
      }
    }
    if (random() < 0.8) push('SESSION_COMPLETED', { durationBucket: pick(random, [['under_1m', 2], ['1_to_3m', 5], ['3_to_10m', 6], ['over_10m', 2]] as const) });
  }
  return events;
}
