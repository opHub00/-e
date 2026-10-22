import type {
  AnalyticsAiMode, AnalyticsAssessmentStatus, AnalyticsCollectionState, AnalyticsCollectionStatus, AnalyticsEnvironment,
  AnalyticsFallbackReason, AnalyticsQuery, AnalyticsSummary, AnalyticsTrafficType, DurationBucket, UnresolvedCategory,
} from '../productV3/analytics/contract.ts';
import { ALERT_THRESHOLDS, FALLBACK_REASON_LABEL, type AlertLevel } from './consoleModel.ts';

/**
 * 운영 지표(Product V3 Analytics, 계약 v2) 화면 모델. Codex 의 AnalyticsSummary 를 읽기 좋은 모양으로만 바꾼다.
 * 새 집계를 만들거나 수치를 추정하지 않는다. 계약에 없는 값은 '제공 안 됨'으로 남긴다.
 * 운영 개시 여부·공식 데이터 준비는 서버의 collection 값만 따른다(브라우저가 공고 상태를 추측하지 않는다).
 *
 * 단위 원칙: 익명 세션은 사람이 아니다. 세션 지표는 '세션', 이벤트 횟수는 '회', 공급유형 판정 결과는 '건'.
 */

/* ── 이름표 ─────────────────────────────────────────────────────────────── */

/** 원시 enum 은 보조로만 보인다. 색만으로 구분하지 않도록 아이콘 + 글자를 함께 쓴다. */
export const STATUS_META: Record<AnalyticsAssessmentStatus, { label: string; hint: string; icon: 'check-circle' | 'help-outline' | 'remove-circle-outline' | 'block'; tone: 'green' | 'amber' | 'neutral' | 'pink' }> = {
  COMPLETE: { label: '판정 완료', hint: '조건 확인이 끝난 결과', icon: 'check-circle', tone: 'green' },
  NEEDS_USER_INPUT: { label: '추가 확인 필요', hint: '답이 더 있어야 판정되는 결과', icon: 'help-outline', tone: 'amber' },
  INELIGIBLE: { label: '신청 어려움', hint: '자격 조건을 충족하지 않는 결과', icon: 'remove-circle-outline', tone: 'neutral' },
  UNAVAILABLE: { label: '판정 불가', hint: '규칙·원문이 없어 판정하지 못한 결과', icon: 'block', tone: 'pink' },
};
export const STATUS_ORDER: AnalyticsAssessmentStatus[] = ['COMPLETE', 'NEEDS_USER_INPUT', 'INELIGIBLE', 'UNAVAILABLE'];

export const CATEGORY_LABEL: Record<UnresolvedCategory, string> = {
  residency: '거주', subscription_account: '청약통장', income: '소득', assets: '자산',
  rewinning_restriction: '재당첨 제한', household: '세대·주택소유', marriage_child: '혼인·자녀',
  evidence: '증빙 확인', other: '기타 확인',
};

/** 공급유형 순서는 운영 보고 순서(청년 → 신혼부부 → 신생아 → 생애최초 → 일반). */
export const SUPPLY_LABEL: Record<string, string> = {
  YOUTH: '청년', NEWLYWED: '신혼부부', NEWBORN: '신생아', FIRST_HOME: '생애최초', GENERAL: '일반',
};
const SUPPLY_ORDER = Object.keys(SUPPLY_LABEL);

export const AI_MODE_META: Record<AnalyticsAiMode, { label: string; hint: string; icon: 'rule' | 'auto-awesome' | 'swap-horiz' }> = {
  deterministic: { label: '규칙 기반 답변', hint: 'AI 호출 없이 공고 규칙으로 답함', icon: 'rule' },
  llm: { label: 'AI 생성 답변', hint: '근거 검증을 통과한 AI 답변', icon: 'auto-awesome' },
  fallback: { label: '대체 답변', hint: 'AI 답변을 쓰지 못해 안내문으로 대신함', icon: 'swap-horiz' },
};
export const DURATION_LABEL: Record<DurationBucket, string> = {
  under_1m: '1분 미만', '1_to_3m': '1~3분', '3_to_10m': '3~10분', over_10m: '10분 이상',
};
const DURATION_ORDER: DurationBucket[] = ['under_1m', '1_to_3m', '3_to_10m', 'over_10m'];

export const ENVIRONMENT_LABEL: Record<AnalyticsEnvironment, string> = { production: 'Production', staging: 'Staging', preview: 'Preview' };
export const TRAFFIC_LABEL: Record<AnalyticsTrafficType, string> = { real: '실제 운영', beta: '베타', internal: '내부 확인', qa: 'QA' };

export const NOTICE_FILTERS = [
  { key: 'all', label: '전체 공고' },
  { key: 'samdo-1', label: '삼도 1지구' },
  { key: 'samdo-2', label: '삼도 2지구' },
] as const;
export type NoticeFilter = typeof NOTICE_FILTERS[number]['key'];

/** 운영 화면에 쓰면 안 되는 말. 익명 세션을 사람 수로, 자격 판정을 당첨 예측으로 읽히게 한다. */
export const BANNED_TERMS = ['사용자 수', '방문자 수', '신청자 수', '이용자 수', '명이 ', '당첨 가능성', '당첨 확률'];

/* ── KST 날짜 · 시각 ────────────────────────────────────────────────────── */

const DAY = 86_400_000;
const KST = 9 * 3_600_000;
/** 한국 날짜(YYYY-MM-DD). 서버 계약 v2 도 Asia/Seoul 달력 날짜로 집계한다. */
export const kstDate = (time: number) => new Date(time + KST).toISOString().slice(0, 10);
const validDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
/** '2026-10-23' → '10.23' */
export const shortDay = (day: string) => `${Number(day.slice(5, 7))}.${Number(day.slice(8, 10))}`;
/** ISO → '10.23 09:41 KST' */
export function kstTime(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return '—';
  const local = new Date(time + KST).toISOString();
  return `${Number(local.slice(5, 7))}.${Number(local.slice(8, 10))} ${local.slice(11, 16)} KST`;
}
/** '2026-10-27T00:00:00+09:00' → '10월 27일 00:00 (KST)' */
export function kstStamp(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return iso;
  const local = new Date(time + KST).toISOString();
  return `${Number(local.slice(5, 7))}월 ${Number(local.slice(8, 10))}일 ${local.slice(11, 16)} (KST)`;
}
export function ago(iso: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}시간 전` : `${Math.floor(hours / 24)}일 전`;
}

/* ── 기간 · 필터 ────────────────────────────────────────────────────────── */

export type PeriodKey = 'today' | '7d' | '30d' | 'custom';
export const PERIOD_LABEL: Record<PeriodKey, string> = { today: '오늘', '7d': '최근 7일', '30d': '최근 30일', custom: '직접 선택' };

export type AnalyticsFilters = {
  period: PeriodKey;
  /** period 가 custom 일 때만 쓴다. YYYY-MM-DD (KST 날짜) */
  customFrom: string;
  customTo: string;
  environment: AnalyticsEnvironment;
  trafficType: AnalyticsTrafficType;
  notice: NoticeFilter;
};

/** 운영 기본값: Production + 실제 운영(real) + 최근 7일. 서버가 개시 전이라고 하면 화면이 '집계 시작 전'을 안내한다. */
export const DEFAULT_FILTERS: AnalyticsFilters = { period: '7d', customFrom: '', customTo: '', environment: 'production', trafficType: 'real', notice: 'all' };
/** 개시 전에 숫자를 확인하는 경로. 반드시 'QA 데이터'로 표시된다. */
export const QA_FILTERS: Pick<AnalyticsFilters, 'environment' | 'trafficType'> = { environment: 'staging', trafficType: 'qa' };

export type RangeResult = { ok: true; from: string; to: string; days: number } | { ok: false; error: string };

/** 서버 계약(parseAnalyticsQuery)과 같은 제한: 날짜 형식, from ≤ to, 최대 367일. 서버가 다시 검사한다. */
export function resolveRange(filters: AnalyticsFilters, now: Date): RangeResult {
  const today = kstDate(now.getTime());
  if (filters.period !== 'custom') {
    const days = filters.period === 'today' ? 1 : filters.period === '7d' ? 7 : 30;
    return { ok: true, from: new Date(Date.parse(`${today}T00:00:00Z`) - (days - 1) * DAY).toISOString().slice(0, 10), to: today, days };
  }
  const from = filters.customFrom.trim(), to = filters.customTo.trim();
  if (!validDay(from) || !validDay(to)) return { ok: false, error: '날짜를 2026-10-27 형식으로 입력해 주세요.' };
  if (from > to) return { ok: false, error: '시작일이 종료일보다 늦어요.' };
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 1;
  if (days > 367) return { ok: false, error: '한 번에 최대 1년까지 볼 수 있어요.' };
  return { ok: true, from, to, days };
}

export function toQuery(filters: AnalyticsFilters, now: Date): AnalyticsQuery | null {
  const range = resolveRange(filters, now);
  if (!range.ok) return null;
  return { from: range.from, to: range.to, environment: filters.environment, trafficType: filters.trafficType,
    ...(filters.notice !== 'all' ? { noticeId: filters.notice } : {}), previousPeriod: true };
}

/** 계약의 쿼리 문자열. /admin-api/product-v3?analytics=summary&… */
export function queryString(query: AnalyticsQuery): string {
  const params = new URLSearchParams({ analytics: 'summary', from: query.from, to: query.to, environment: query.environment,
    trafficType: query.trafficType, previousPeriod: String(query.previousPeriod ?? false) });
  if (query.noticeId) params.set('noticeId', query.noticeId);
  return params.toString();
}

export const isOperationalView = (filters: Pick<AnalyticsFilters, 'environment' | 'trafficType'>) =>
  filters.environment === 'production' && filters.trafficType === 'real';

/** '최근 7일 (10.17~10.23 KST)' */
export function periodLabel(filters: AnalyticsFilters, now: Date): string {
  const range = resolveRange(filters, now);
  if (!range.ok) return '기간 입력 필요';
  const span = range.from === range.to ? `${shortDay(range.from)} KST` : `${shortDay(range.from)}~${shortDay(range.to)} KST`;
  return filters.period === 'custom' ? `${range.from} ~ ${range.to} (KST)` : `${PERIOD_LABEL[filters.period]} (${span})`;
}

export function scopeLabel(filters: AnalyticsFilters, now: Date): string {
  const notice = NOTICE_FILTERS.find(item => item.key === filters.notice)?.label ?? '전체 공고';
  return `${ENVIRONMENT_LABEL[filters.environment]} · ${TRAFFIC_LABEL[filters.trafficType]}(${filters.trafficType}) · ${periodLabel(filters, now)} · ${notice}`;
}

/* ── 서버 집계 상태(collectionState) ────────────────────────────────────── */

/** 서버가 collection 을 주지 않으면(계약 v1 서버) 개시 여부를 추측하지 않고 '알 수 없음'으로 둔다. */
export type CollectionStateView = AnalyticsCollectionState | 'UNKNOWN';

export const COLLECTION_META: Record<CollectionStateView, { label: string; title: string; body: string; icon: string; level: AlertLevel | null; showNumbers: boolean }> = {
  PRE_LAUNCH: { label: '집계 시작 전', title: '아직 운영 집계가 시작되지 않았어요', icon: 'hourglass-top', level: 'INFO', showNumbers: false,
    body: '공식 공고 데이터가 준비되고 집계 시작 시각이 지나야 실제 운영(real) 상담 세션이 여기에 집계돼요. 지금은 0건이 아니라 집계 전이에요.' },
  READY_NOT_STARTED: { label: '준비 완료 · 시작 전', title: '운영 데이터 수집 준비가 완료됐지만 아직 시작되지 않았어요', icon: 'event-available', level: 'INFO', showNumbers: false,
    body: '공식 데이터와 수집 설정은 준비됐어요. 아직 실제 운영(real) 이벤트가 하나도 들어오지 않았어요. 첫 상담이 시작되면 자동으로 집계돼요.' },
  COLLECTING: { label: '집계 중', title: '운영 집계 중', icon: 'sensors', level: null, showNumbers: true, body: '' },
  PAUSED: { label: '일시 중지', title: '운영 집계가 일시 중지돼 있어요', icon: 'pause-circle-outline', level: 'ACTION_REQUIRED', showNumbers: true,
    body: '수집이 꺼져 있거나 실제 운영(real) 허용이 해제돼 있어요. 아래 숫자는 중지 전까지 기록된 값이고, 지금 들어오는 상담은 집계되지 않아요. 운영 담당자가 수집 설정을 확인해야 해요.' },
  MISCONFIGURED: { label: '설정 오류', title: '운영 조치 필요 · 집계 설정이 올바르지 않아요', icon: 'report-gmailerrorred', level: 'ERROR', showNumbers: false,
    body: '필수 공고 버전이나 집계 시작 시각 설정이 잘못돼 있어요. 설정을 고치기 전에는 운영 숫자를 믿을 수 없어 보여 주지 않아요. 서버 환경 설정을 확인해 주세요.' },
  UNKNOWN: { label: '상태 미제공', title: '운영 조치 필요 · 서버가 집계 상태를 보내지 않았어요', icon: 'help-center', level: 'ACTION_REQUIRED', showNumbers: false,
    body: '집계 상태(collectionState)가 응답에 없어요. 서버 버전이 맞는지 확인해 주세요. 개시 여부를 화면에서 추측하지 않아요.' },
};

export const collectionOf = (summary: AnalyticsSummary | null): AnalyticsCollectionStatus | null => summary?.collection ?? null;
export const collectionStateOf = (summary: AnalyticsSummary): CollectionStateView => summary.collection?.collectionState ?? 'UNKNOWN';

export type LaunchCheck = { key: 'official' | 'start' | 'events'; label: string; done: boolean; detail: string };

/** 서버 값을 그대로 체크리스트로 보인다. 시작 시각 도래 여부는 서버 집계 시각(generatedAt) 기준. */
export function launchChecks(summary: AnalyticsSummary): LaunchCheck[] {
  const collection = summary.collection;
  if (!collection) return [];
  const reference = summary.generatedAt ?? null;
  const started = reference !== null && Date.parse(reference) >= Date.parse(collection.collectionStartAt);
  return [
    { key: 'official', label: `공식 ${collection.requiredNoticeVersion} 데이터 준비`, done: collection.officialDataReady,
      detail: collection.officialDataReady ? '공식 원문·ACTIVE 확인됨' : '공식 게시·검증 전' },
    { key: 'start', label: '집계 시작 시각', done: started, detail: `${kstStamp(collection.collectionStartAt)}${started ? ' 이후' : ' 전'}` },
    { key: 'events', label: '실제 운영 이벤트 수집', done: collection.collectionState === 'COLLECTING',
      detail: collection.collectionState === 'COLLECTING' ? '수집 중' : COLLECTION_META[collection.collectionState].label },
  ];
}

/* ── 화면 상태 ──────────────────────────────────────────────────────────── */

export type AnalyticsViewState =
  | { kind: 'INVALID_RANGE'; error: string }
  | { kind: 'WAITING' }
  /** 실제 운영 화면인데 서버가 숫자를 보일 상태가 아니라고 함 */
  | { kind: 'COLLECTION_GATE'; state: CollectionStateView }
  | { kind: 'EMPTY'; operational: boolean; state: CollectionStateView }
  | { kind: 'READY'; operational: boolean; state: CollectionStateView };

/**
 * 실제 운영(Production · real) 화면: 서버 collectionState 가 숫자를 보일 수 있을 때만 숫자.
 * QA·검증 화면: 언제나 숫자를 보이되 'QA 데이터' 표시를 붙인다(운영 실적으로 읽히지 않게).
 */
export function viewState(filters: AnalyticsFilters, now: Date, summary: AnalyticsSummary | null): AnalyticsViewState {
  const range = resolveRange(filters, now);
  if (!range.ok) return { kind: 'INVALID_RANGE', error: range.error };
  if (!summary) return { kind: 'WAITING' };
  const operational = isOperationalView(filters);
  const state = collectionStateOf(summary);
  if (filters.trafficType === 'real' && !COLLECTION_META[state].showNumbers) return { kind: 'COLLECTION_GATE', state };
  if (isEmptySummary(summary)) return { kind: 'EMPTY', operational, state };
  return { kind: 'READY', operational, state };
}

export const isEmptySummary = (summary: AnalyticsSummary) =>
  !summary.sessionsStarted && !summary.assessmentsStarted && !summary.assessmentsCompleted && !summary.resultViews
  && !summary.resultSaves && !summary.qrCreates && !summary.copilotUsage;

/* ── 신선도(generatedAt · lastEventAt) ──────────────────────────────────── */

/** 실제 운영 중인데 마지막 이벤트가 이보다 오래되면 '수집이 멈췄는지' 확인을 권한다. */
export const LAST_EVENT_STALE_HOURS = 6;

export type Freshness = {
  generated: string | null;
  lastEvent: { text: string; stale: boolean } | null;
  /** lastEventAt === null */
  noEvents: boolean;
  /** 서버가 v2 신선도 필드를 주지 않음 */
  missing: boolean;
};

/**
 * 오래된 데이터 경고는 마지막 이벤트(lastEventAt) 기준이다. 새로고침·집계 시각과 섞지 않는다.
 * 기간이 오늘을 포함하고, 실제 운영이 집계 중일 때만 경고한다(과거 기간·QA 는 이벤트가 멈춰 있는 게 정상).
 */
export function freshness(summary: AnalyticsSummary, filters: AnalyticsFilters, now: Date): Freshness {
  const generated = summary.generatedAt ? `${kstTime(summary.generatedAt)} (${ago(summary.generatedAt, now)})` : null;
  if (summary.lastEventAt === undefined) return { generated, lastEvent: null, noEvents: false, missing: !summary.generatedAt };
  if (summary.lastEventAt === null) return { generated, lastEvent: null, noEvents: true, missing: !summary.generatedAt };
  const range = resolveRange(filters, now);
  const includesToday = range.ok && range.to === kstDate(now.getTime());
  const reference = summary.generatedAt ? Date.parse(summary.generatedAt) : now.getTime();
  const stale = includesToday && isOperationalView(filters) && collectionStateOf(summary) === 'COLLECTING'
    && reference - Date.parse(summary.lastEventAt) >= LAST_EVENT_STALE_HOURS * 3_600_000;
  return { generated, lastEvent: { text: `${kstTime(summary.lastEventAt)} (${ago(summary.lastEventAt, now)})`, stale }, noEvents: false, missing: !summary.generatedAt };
}

/* ── 오류(안정 코드) ────────────────────────────────────────────────────── */

export type AnalyticsErrorCode = 'ANALYTICS_SCHEMA_NOT_READY' | 'ANALYTICS_READ_FAILED' | 'ANALYTICS_AUTH_UNAVAILABLE' | 'ANALYTICS_TIMEOUT'
  | 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NETWORK';
export const ANALYTICS_ERROR_CODES: AnalyticsErrorCode[] = ['ANALYTICS_SCHEMA_NOT_READY', 'ANALYTICS_READ_FAILED', 'ANALYTICS_AUTH_UNAVAILABLE', 'ANALYTICS_TIMEOUT', 'AUTH_REQUIRED', 'FORBIDDEN', 'NETWORK'];

export const ANALYTICS_ERROR_COPY: Record<AnalyticsErrorCode, { title: string; body: string; icon: string; action: 'RETRY' | 'LOGIN' | 'NONE' }> = {
  ANALYTICS_SCHEMA_NOT_READY: { title: '운영 지표 저장소가 아직 준비되지 않았어요', icon: 'storage', action: 'RETRY',
    body: '운영 지표 테이블이 아직 만들어지지 않았어요(migration 적용 전). 0건이 아니라 저장소가 없는 상태예요. 운영 담당자가 Staging migration 적용 여부를 확인해야 해요.' },
  ANALYTICS_READ_FAILED: { title: '운영 데이터를 읽는 중 문제가 발생했어요', icon: 'cloud-off', action: 'RETRY',
    body: '저장소는 있지만 데이터를 읽지 못했어요. 0건으로 추정해 보이지 않아요. 잠시 후 다시 시도하고, 계속되면 서버 상태를 확인해 주세요.' },
  ANALYTICS_AUTH_UNAVAILABLE: { title: '관리자 권한 확인 경로가 응답하지 않아요', icon: 'gpp-maybe', action: 'RETRY',
    body: '권한이 없다는 뜻은 아니에요. 권한 확인 또는 데이터 접근 설정이 응답하지 않았어요. 잠시 후 다시 시도해 주세요.' },
  ANALYTICS_TIMEOUT: { title: '운영 데이터 조회가 지연되고 있어요', icon: 'hourglass-empty', action: 'RETRY',
    body: '정해진 시간 안에 집계가 끝나지 않았어요. 기간을 줄이거나 잠시 후 다시 시도해 주세요.' },
  AUTH_REQUIRED: { title: '로그인이 필요해요', icon: 'login', action: 'LOGIN',
    body: '운영 지표는 관리자 계정으로 로그인한 뒤 볼 수 있어요. 로그인 시간이 지났다면 다시 로그인해 주세요.' },
  FORBIDDEN: { title: '운영 지표는 관리자만 볼 수 있어요', icon: 'admin-panel-settings', action: 'NONE',
    body: '이 계정(검수자)에는 집계 조회 권한이 없어요. 다른 운영 콘솔 화면은 그대로 쓸 수 있어요. 필요하면 관리자에게 요청해 주세요.' },
  NETWORK: { title: '네트워크에 연결되어 있지 않아요', icon: 'wifi-off', action: 'RETRY',
    body: '이 기기의 인터넷 연결을 확인한 뒤 다시 시도해 주세요.' },
};

/** HTTP 상태 + 서버 error 코드 → 화면 코드. 모르는 503 은 '읽기 실패'로 보인다(일반 503 문구는 쓰지 않는다). */
export function analyticsErrorCode(status: number | null, code: string | null, transport?: 'TIMEOUT' | 'NETWORK'): AnalyticsErrorCode {
  if (transport === 'TIMEOUT') return 'ANALYTICS_TIMEOUT';
  if (transport === 'NETWORK') return 'NETWORK';
  if (code && (ANALYTICS_ERROR_CODES as string[]).includes(code)) return code as AnalyticsErrorCode;
  if (status === 401) return 'AUTH_REQUIRED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 408 || status === 504) return 'ANALYTICS_TIMEOUT';
  return 'ANALYTICS_READ_FAILED';
}

/* ── 숫자 표기 ──────────────────────────────────────────────────────────── */

export const num = (value: number) => value.toLocaleString('ko-KR');
export const pct = (value: number | null, digits = 0) => (value === null ? '—' : `${(value * 100).toFixed(digits)}%`);

export type Delta = { text: string; direction: 'up' | 'down' | 'flat' | 'none' };

/** 증감은 색을 쓰지 않고 화살표 아이콘 + 글자로만. 오르면 좋은지 나쁜지는 지표마다 달라 판단하지 않는다. */
export function countDelta(current: number, previous: number | undefined, unit: string): Delta {
  if (previous === undefined) return { text: '이전 기간 비교 없음', direction: 'none' };
  if (current === previous) return { text: '이전 기간과 같음', direction: 'flat' };
  if (previous === 0) return { text: `이전 기간 0${unit} → ${num(current)}${unit}`, direction: 'up' };
  const diff = current - previous;
  return { text: `이전 기간 대비 ${diff > 0 ? '+' : '−'}${num(Math.abs(diff))}${unit} (${diff > 0 ? '+' : '−'}${Math.round(Math.abs(diff) / previous * 100)}%)`, direction: diff > 0 ? 'up' : 'down' };
}

export function rateDelta(current: number | null, previous: number | null | undefined): Delta {
  if (previous === undefined) return { text: '이전 기간 비교 없음', direction: 'none' };
  if (current === null || previous === null) return { text: '이전 기간 비교 불가(판정 시작 0세션)', direction: 'none' };
  const points = Math.round((current - previous) * 1000) / 10;
  if (points === 0) return { text: '이전 기간과 같음', direction: 'flat' };
  return { text: `이전 기간 대비 ${points > 0 ? '+' : '−'}${Math.abs(points)}%p`, direction: points > 0 ? 'up' : 'down' };
}

/* ── KPI(대표 요약 4개) ─────────────────────────────────────────────────── */

export type KpiTile = { key: string; label: string; value: string; unit: string; basis: string; delta: Delta; icon: string };

export function buildKpis(summary: AnalyticsSummary): KpiTile[] {
  const prev = summary.previousPeriodComparison;
  const statusTotal = STATUS_ORDER.reduce((sum, key) => sum + summary.assessmentStatusDistribution[key], 0);
  const needs = summary.assessmentStatusDistribution.NEEDS_USER_INPUT;
  return [
    { key: 'sessions', label: '상담 시작 세션', value: num(summary.sessionsStarted), unit: '세션', basis: '익명 세션 · 사람 수 아님', icon: 'forum',
      delta: countDelta(summary.sessionsStarted, prev?.sessionsStarted, '세션') },
    { key: 'completed', label: '판정 완료 세션', value: num(summary.assessmentsCompleted), unit: '세션', basis: '판정 결과를 받은 세션', icon: 'task-alt',
      delta: countDelta(summary.assessmentsCompleted, prev?.assessmentsCompleted, '세션') },
    { key: 'rate', label: '완료율', value: pct(summary.completionRate), unit: '', basis: '판정 시작 세션 중 완료 세션', icon: 'donut-large',
      delta: rateDelta(summary.completionRate, prev ? prev.completionRate : undefined) },
    { key: 'needs', label: '추가 확인 필요', value: num(needs), unit: '건', basis: statusTotal ? `공급유형 판정 결과 ${num(statusTotal)}건 중 ${pct(needs / statusTotal)}` : '공급유형 판정 결과 기준', icon: 'help-outline',
      delta: countDelta(needs, prev?.needsUserInput, '건') },
  ];
}

/* ── 퍼널(세션만) ───────────────────────────────────────────────────────── */

export type FunnelStep = {
  key: string; label: string;
  /** 계약에 값이 없으면 null(추정하지 않는다) */
  count: number | null;
  /** 첫 단계 대비 */
  ofTotal: number | null;
  /** 기준 단계 대비(저장·QR 은 결과 조회 세션 대비) */
  base: { label: string; rate: number | null } | null;
  /** 직전 단계에서 빠진 세션. 갈래 단계(저장·QR)는 이탈이 아니라 비율만 */
  dropFromPrevious: { count: number; rate: number } | null;
  anomaly: boolean;
  delta: Delta;
  branch: boolean;
};

/**
 * 세션 퍼널: 상담 시작 → 판정 시작 → 판정 완료 → 결과 조회 → (결과 저장 · QR 생성).
 * 모든 단계가 '고유 익명 세션 수'다. 이벤트 횟수(회)는 actions 로 따로.
 */
export function buildFunnel(summary: AnalyticsSummary): { steps: FunnelStep[]; actions: ActionRow[] } {
  const prev = summary.previousPeriodComparison;
  const first = summary.sessionsStarted;
  const views = summary.resultViewSessions ?? null;
  const linear: Array<{ key: string; label: string; count: number | null; previous: number | undefined }> = [
    { key: 'session', label: '상담 시작', count: summary.sessionsStarted, previous: prev?.sessionsStarted },
    { key: 'started', label: '판정 시작', count: summary.assessmentsStarted, previous: prev?.assessmentsStarted },
    { key: 'completed', label: '판정 완료', count: summary.assessmentsCompleted, previous: prev?.assessmentsCompleted },
    { key: 'viewed', label: '결과 조회', count: views, previous: prev?.resultViewSessions },
  ];
  const steps: FunnelStep[] = linear.map((step, index) => {
    const before = index ? linear[index - 1].count : null;
    const anomaly = before !== null && step.count !== null && step.count > before;
    return {
      key: step.key, label: step.label, count: step.count,
      ofTotal: first && step.count !== null ? step.count / first : null,
      base: null,
      dropFromPrevious: before === null || step.count === null || anomaly ? null : { count: before - step.count, rate: before ? (before - step.count) / before : 0 },
      anomaly, branch: false,
      delta: step.count === null ? countDelta(0, undefined, '세션') : countDelta(step.count, step.previous, '세션'),
    };
  });
  for (const branch of [
    { key: 'saved', label: '결과 저장', count: summary.resultSaveSessions ?? null, previous: prev?.resultSaveSessions },
    { key: 'qr', label: 'QR 생성', count: summary.qrCreateSessions ?? null, previous: prev?.qrCreateSessions },
  ]) {
    steps.push({ key: branch.key, label: branch.label, count: branch.count,
      ofTotal: first && branch.count !== null ? branch.count / first : null,
      base: { label: '결과 조회 세션', rate: views && branch.count !== null ? branch.count / views : null },
      dropFromPrevious: null, anomaly: views !== null && branch.count !== null && branch.count > views, branch: true,
      delta: branch.count === null ? countDelta(0, undefined, '세션') : countDelta(branch.count, branch.previous, '세션') });
  }
  return { steps, actions: buildActions(summary) };
}

/** 행동 횟수(회). 같은 세션이 여러 번 할 수 있다. 세션당 평균은 같은 이벤트의 세션 수로 나눈다. */
export type ActionRow = { key: string; label: string; count: number; sessions: number | null; perSession: number | null };
export function buildActions(summary: AnalyticsSummary): ActionRow[] {
  const row = (key: string, label: string, count: number, sessions: number | undefined): ActionRow =>
    ({ key, label, count, sessions: sessions ?? null, perSession: sessions ? count / sessions : null });
  return [
    row('views', '결과 조회', summary.resultViews, summary.resultViewSessions),
    row('saves', '결과 저장', summary.resultSaves, summary.resultSaveSessions),
    row('qr', 'QR 생성', summary.qrCreates, summary.qrCreateSessions),
  ];
}

/* ── 분포 ───────────────────────────────────────────────────────────────── */

export type ShareRow = { key: string; label: string; raw: string; count: number; share: number };

export function statusRows(summary: AnalyticsSummary): ShareRow[] {
  const total = STATUS_ORDER.reduce((sum, key) => sum + summary.assessmentStatusDistribution[key], 0);
  return STATUS_ORDER.map(key => ({ key, label: STATUS_META[key].label, raw: key, count: summary.assessmentStatusDistribution[key], share: total ? summary.assessmentStatusDistribution[key] / total : 0 }));
}

/** 많이 막히는 조건: 같은 세션·범주는 서버가 한 번만 센다. 0건 범주는 빼고 많은 순. */
export function unresolvedRows(summary: AnalyticsSummary): ShareRow[] {
  const entries = Object.entries(summary.unresolvedCategoryDistribution).filter(([, count]) => (count ?? 0) > 0) as Array<[UnresolvedCategory, number]>;
  const top = Math.max(0, ...entries.map(([, count]) => count));
  return entries
    .sort((a, b) => b[1] - a[1] || CATEGORY_LABEL[a[0]].localeCompare(CATEGORY_LABEL[b[0]], 'ko'))
    .map(([key, count]) => ({ key, label: CATEGORY_LABEL[key] ?? '기타 확인', raw: key, count, share: top ? count / top : 0 }));
}

/** 공급유형 × 판정 상태(계약 v2 supplyTypeAssessmentDistribution). 자격 판정 결과이며 당첨과 무관. */
export type SupplyStatusRow = { key: string; label: string; raw: string; total: number; share: number; cells: Array<ShareRow & { status: AnalyticsAssessmentStatus }> };
export function supplyStatusRows(summary: AnalyticsSummary): SupplyStatusRow[] | null {
  const matrix = summary.supplyTypeAssessmentDistribution;
  if (!matrix) return null;
  const totals = Object.fromEntries(Object.entries(matrix).map(([key, cell]) => [key, STATUS_ORDER.reduce((sum, status) => sum + (cell[status] ?? 0), 0)]));
  const all = Object.values(totals).reduce((sum, value) => sum + value, 0);
  const keys = [...SUPPLY_ORDER, ...Object.keys(matrix).filter(key => !SUPPLY_ORDER.includes(key)).sort()];
  return keys.map(key => {
    const cell = matrix[key] ?? { COMPLETE: 0, NEEDS_USER_INPUT: 0, INELIGIBLE: 0, UNAVAILABLE: 0 };
    const total = totals[key] ?? 0;
    return { key, label: SUPPLY_LABEL[key] ?? '기타 공급유형', raw: key, total, share: all ? total / all : 0,
      cells: STATUS_ORDER.map(status => ({ key: `${key}:${status}`, status, label: STATUS_META[status].label, raw: status, count: cell[status] ?? 0, share: total ? (cell[status] ?? 0) / total : 0 })) };
  });
}

/* ── AI 상담 품질 ───────────────────────────────────────────────────────── */

export type AiWarning = { level: AlertLevel; title: string; body: string };
export type AiQuality = {
  total: number;
  modes: ShareRow[];
  reasons: Array<ShareRow & { icon: string }>;
  fallbackRate: number | null;
  fallbackDelta: Delta;
  averageTurns: number | null;
  durations: ShareRow[];
  warnings: AiWarning[];
};

export function buildAiQuality(summary: AnalyticsSummary): AiQuality {
  const modesTotal = (['deterministic', 'llm', 'fallback'] as AnalyticsAiMode[]).reduce((sum, key) => sum + (summary.aiModeDistribution[key] ?? 0), 0);
  const total = Math.max(summary.copilotUsage, modesTotal);
  const modes = (['deterministic', 'llm', 'fallback'] as AnalyticsAiMode[]).map(key => ({ key, label: AI_MODE_META[key].label, raw: key, count: summary.aiModeDistribution[key] ?? 0, share: total ? (summary.aiModeDistribution[key] ?? 0) / total : 0 }));
  const reasonEntries = Object.entries(summary.fallbackDistribution).filter(([, count]) => (count ?? 0) > 0) as Array<[AnalyticsFallbackReason, number]>;
  const reasons = reasonEntries.sort((a, b) => b[1] - a[1]).map(([key, count]) => ({
    key, label: FALLBACK_REASON_LABEL[key]?.label ?? '원인 미상', raw: key, count, share: total ? count / total : 0, icon: FALLBACK_REASON_LABEL[key]?.icon ?? 'help-outline',
  }));
  const fallback = summary.aiModeDistribution.fallback ?? 0;
  const fallbackRate = total ? fallback / total : null;
  const durationTotal = DURATION_ORDER.reduce((sum, key) => sum + (summary.durationBuckets[key] ?? 0), 0);
  const durations = DURATION_ORDER.map(key => ({ key, label: DURATION_LABEL[key], raw: key, count: summary.durationBuckets[key] ?? 0, share: durationTotal ? (summary.durationBuckets[key] ?? 0) / durationTotal : 0 }));
  const providerErrors = (summary.fallbackDistribution.provider_error ?? 0) + (summary.fallbackDistribution.timeout ?? 0);
  const warnings: AiWarning[] = [];
  if (providerErrors > 0) warnings.push({ level: providerErrors >= ALERT_THRESHOLDS.outageCount ? 'ERROR' : 'ACTION_REQUIRED', title: `AI 제공자 오류·시간 초과 ${num(providerErrors)}회`,
    body: 'AI 응답을 받지 못해 대체 답변으로 바뀐 상담이에요. 제공자 상태와 키·한도를 확인해 주세요.' });
  if (fallbackRate !== null && total >= ALERT_THRESHOLDS.minAiSample && fallbackRate >= ALERT_THRESHOLDS.fallbackRate) warnings.push({ level: 'WARNING',
    title: `대체 답변 비율 ${pct(fallbackRate)}`, body: `기준 ${pct(ALERT_THRESHOLDS.fallbackRate)} 이상이에요. 대체 사유를 먼저 확인해 주세요.` });
  if ((summary.fallbackDistribution.grounding_rejected ?? 0) > 0) warnings.push({ level: 'INFO', title: `근거 검증 실패 ${num(summary.fallbackDistribution.grounding_rejected ?? 0)}회`,
    body: '공고 근거와 맞지 않아 폐기된 AI 답변이에요. 반복되면 원문·RAG 범위를 확인해 주세요.' });
  return { total, modes, reasons, fallbackRate, fallbackDelta: countDelta(fallback, summary.previousPeriodComparison?.fallback, '회'),
    averageTurns: summary.averageTurns, durations, warnings };
}
