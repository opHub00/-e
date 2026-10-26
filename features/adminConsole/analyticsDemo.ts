import type { AnalyticsEnvironment, AnalyticsEvent, AnalyticsQuery, AnalyticsSummaryV2, AnalyticsTrafficType, UnresolvedCategory } from '../productV3/analytics/contract.ts';
import { analyticsGateFromEnv, analyticsWindow, getAnalyticsSummary, globalAnalyticsCollectionStatus } from '../productV3/analytics/core.ts';
import { QA_FILTERS, type AnalyticsFilters, type NoticeOption } from './analyticsModel.ts';

/**
 * 운영 지표 화면 점검용 예시. Demo 빌드 + ?demo=1&analytics=… 에서만 열린다.
 * 요약 숫자를 손으로 적지 않는다. 계약 모양의 가짜 이벤트를 만들고 Codex 의 getAnalyticsSummary(계약 v2)로 집계한다.
 * 전역 집계 상태도 Codex 의 globalAnalyticsCollectionStatus 로 만든다(gate 설정만 상황마다 다르게).
 * 개시 전 상황은 실제 서버와 같다: Production 저장소 미연결 → production 조회는 STORE_UNAVAILABLE.
 * 개시 후 상황은 저장소가 연결된 미래를 가정한 예시다.
 * 예시 이벤트에는 사람 정보·답변·대화가 없다(계약에 그런 필드가 없다).
 */
export type AnalyticsDemoKey = 'prelaunch' | 'ready' | 'live' | 'live0' | 'live500' | 'paused' | 'misconfigured' | 'stale' | 'aiwarn'
  | 'qa0' | 'qa20' | 'qa100' | 'qa500'
  | 'schema' | 'readfail' | 'authunavail' | 'timeout' | 'network' | 'forbidden' | 'unauthorized';
export const ANALYTICS_DEMO_KEYS: AnalyticsDemoKey[] = ['prelaunch', 'ready', 'live', 'live0', 'live500', 'paused', 'misconfigured', 'stale', 'aiwarn',
  'qa0', 'qa20', 'qa100', 'qa500', 'schema', 'readfail', 'authunavail', 'timeout', 'network', 'forbidden', 'unauthorized'];
export const ANALYTICS_DEMO_LABEL: Record<AnalyticsDemoKey, string> = {
  prelaunch: '운영 개시 전(PRE_LAUNCH)', ready: '준비 완료·시작 전(READY_NOT_STARTED)', live: '운영 집계 중(COLLECTING)',
  live0: '집계 중 · 기간 내 0세션', live500: '집계 중 · 500세션', paused: '일시 중지(PAUSED)', misconfigured: '설정 오류(MISCONFIGURED)',
  stale: '마지막 이벤트 오래됨', aiwarn: 'AI 경고', qa0: 'QA 0세션', qa20: 'QA 20세션', qa100: 'QA 100세션', qa500: 'QA 500세션',
  schema: '저장소 준비 전', readfail: '읽기 실패', authunavail: '권한 확인 불가', timeout: '조회 지연', network: '네트워크 끊김',
  forbidden: '관리자 아님', unauthorized: '로그인 필요',
};

export type AnalyticsDemoFailure = { status: number | null; code: string | null; transport?: 'TIMEOUT' | 'NETWORK' };
/** 예시 화면의 공고 목록(실제 화면은 서버 스냅샷의 공고 목록을 쓴다). */
export const ANALYTICS_DEMO_NOTICES: NoticeOption[] = [
  { id: 'demo-notice-a', title: '[예시] 공고 A' },
  { id: 'demo-notice-b', title: '[예시] 공고 B' },
];
const NOTICE_IDS = ANALYTICS_DEMO_NOTICES.map(notice => notice.id);

export type AnalyticsDemo = {
  now: Date;
  initialFilters?: Partial<AnalyticsFilters>;
  failure?: AnalyticsDemoFailure;
  load: (query: AnalyticsQuery) => AnalyticsSummaryV2;
};

export const parseAnalyticsDemo = (value: string | string[] | undefined): AnalyticsDemoKey => {
  const raw = Array.isArray(value) ? value[0] : value;
  return ANALYTICS_DEMO_KEYS.includes(raw as AnalyticsDemoKey) ? raw as AnalyticsDemoKey : 'prelaunch';
};

const PRE_LAUNCH_NOW = new Date('2026-10-22T10:00:00+09:00');
const LIVE_NOW = new Date('2026-11-12T10:00:00+09:00');

type Volume = { environment: AnalyticsEnvironment; trafficType: AnalyticsTrafficType; sessions: number; aiStress?: boolean; quietDays?: number };

const FAILURES: Partial<Record<AnalyticsDemoKey, AnalyticsDemoFailure>> = {
  schema: { status: 503, code: 'ANALYTICS_SCHEMA_NOT_READY' }, readfail: { status: 503, code: 'ANALYTICS_READ_FAILED' },
  authunavail: { status: 503, code: 'ANALYTICS_AUTH_UNAVAILABLE' }, timeout: { status: 503, code: 'ANALYTICS_TIMEOUT' },
  network: { status: null, code: null, transport: 'NETWORK' }, forbidden: { status: 403, code: 'FORBIDDEN' }, unauthorized: { status: 401, code: 'AUTH_REQUIRED' },
};

export function analyticsDemo(key: AnalyticsDemoKey): AnalyticsDemo {
  const launched = !['prelaunch', 'qa0', 'qa20', 'qa100', 'qa500'].includes(key);
  const now = launched ? LIVE_NOW : PRE_LAUNCH_NOW;
  const qaSessions = ({ qa0: 0, qa20: 20, qa100: 100, qa500: 500 } as Partial<Record<AnalyticsDemoKey, number>>)[key] ?? 40;
  const realSessions = !launched || key === 'ready' || key === 'misconfigured' ? 0 : key === 'live500' ? 500 : 120;
  const volumes: Volume[] = [
    { environment: 'staging', trafficType: 'qa', sessions: qaSessions },
    { environment: 'staging', trafficType: 'internal', sessions: 6 },
    { environment: 'production', trafficType: 'real', sessions: realSessions, aiStress: key === 'aiwarn',
      quietDays: key === 'live0' ? 8 : key === 'stale' ? 0.45 : 0 },
  ];
  const events = volumes.flatMap((volume, index) => generateEvents(volume, now, 7 + index * 101 + volume.sessions));
  // 서버와 같은 gate 해석. 상황마다 env 설정만 다르다.
  const gate = analyticsGateFromEnv({
    EVENT_ANALYTICS_ENABLED: key === 'paused' ? 'false' : 'true',
    EVENT_ANALYTICS_ALLOWED_TRAFFIC_TYPES: 'qa,internal,beta,real',
    ...(key === 'misconfigured' ? { EVENT_ANALYTICS_REQUIRED_NOTICE_VERSION: 'VER 1.8 (draft)' } : {}),
  });
  const officialDataReady = launched;
  const failure = FAILURES[key];
  return {
    now,
    ...(key.startsWith('qa') ? { initialFilters: QA_FILTERS } : {}),
    ...(failure ? { failure } : {}),
    load: query => {
      // 전역 상태는 필터와 무관하다(서버 loadAnalyticsGlobalStatus 와 같은 원칙).
      const productionStoreReady = launched;
      const hasRealEvents = events.some(event => event.environment === 'production' && event.trafficType === 'real');
      const global = globalAnalyticsCollectionStatus(gate, officialDataReady, productionStoreReady, hasRealEvents, now);
      if (query.environment === 'production' && !productionStoreReady) return getAnalyticsSummary([], query, now, global, 'STORE_UNAVAILABLE');
      const window = analyticsWindow(query);
      const loaded = events.filter(event => event.environment === query.environment && event.trafficType === query.trafficType
        && (!query.noticeId || event.noticeId === query.noticeId)
        && Date.parse(event.occurredAt) >= window.previousFrom && Date.parse(event.occurredAt) < window.to);
      return getAnalyticsSummary(loaded, query, now, global);
    },
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
  const quiet = volume.quietDays ?? 0;
  const sessions = [
    ...Array.from({ length: volume.sessions }, () => now.getTime() - (quiet + random() * (29.5 - quiet)) * day),
    ...Array.from({ length: Math.round(volume.sessions * 0.8) }, () => now.getTime() - (30 + random() * 30) * day),
  ];
  for (const start of sessions) {
    const sessionId = uuid(random);
    const sessionNotice = random() < 0.55 ? NOTICE_IDS[0] : NOTICE_IDS[1];
    let clock = start;
    const push = (eventType: AnalyticsEvent['eventType'], extra: Partial<AnalyticsEvent> = {}, noticeId = sessionNotice) => {
      clock += 20_000 + random() * 50_000;
      events.push({ eventId: uuid(random), anonymousSessionId: sessionId, noticeId, noticeVersion: 'VER1.8', eventType,
        occurredAt: new Date(Math.min(clock, now.getTime() - quiet * day - 1000)).toISOString(), environment: volume.environment, trafficType: volume.trafficType, ...extra });
    };
    push('SESSION_STARTED');
    if (random() < 0.86) {
      for (const noticeId of NOTICE_IDS) push('ASSESSMENT_STARTED', {}, noticeId);
      if (random() < 0.82) {
        for (const noticeId of NOTICE_IDS) for (const supplyType of SUPPLIES) {
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
