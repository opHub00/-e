import type {
  AnalyticsAiMode, AnalyticsAssessmentStatus, AnalyticsEnvironment, AnalyticsFallbackReason, AnalyticsQuery,
  AnalyticsSummary, AnalyticsTrafficType, DurationBucket, UnresolvedCategory,
} from '../productV3/analytics/contract.ts';
import { analyticsGateFromEnv } from '../productV3/analytics/core.ts';
import { ALERT_THRESHOLDS, FALLBACK_REASON_LABEL, type AlertLevel } from './consoleModel.ts';
import type { ConsoleNotice } from './contract.ts';

/**
 * 운영 지표(Product V3 Analytics) 화면 모델. Codex 가 만든 AnalyticsSummary 를 읽기 좋은 모양으로만 바꾼다.
 * 여기서 새 집계를 만들거나 수치를 추정하지 않는다. 계약에 없는 값은 '제공 안 됨'으로 남긴다.
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

/** 운영 화면에 쓰면 안 되는 말. 익명 세션을 사람 수로 읽히게 한다. */
export const BANNED_TERMS = ['사용자 수', '방문자 수', '신청자 수', '이용자 수', '명이 ', '당첨 가능성', '당첨 확률'];

/* ── 기간 · 필터 ────────────────────────────────────────────────────────── */

export type PeriodKey = 'today' | '7d' | '30d' | 'custom';
export const PERIOD_LABEL: Record<PeriodKey, string> = { today: '오늘', '7d': '최근 7일', '30d': '최근 30일', custom: '직접 선택' };

export type AnalyticsFilters = {
  period: PeriodKey;
  /** period 가 custom 일 때만 쓴다. YYYY-MM-DD */
  customFrom: string;
  customTo: string;
  environment: AnalyticsEnvironment;
  trafficType: AnalyticsTrafficType;
  notice: NoticeFilter;
};

/** 운영 기본값: Production + 실제 운영(real) + 최근 7일. 개시 전이면 화면이 '집계 시작 전'을 안내한다. */
export const DEFAULT_FILTERS: AnalyticsFilters = { period: '7d', customFrom: '', customTo: '', environment: 'production', trafficType: 'real', notice: 'all' };
/** 개시 전에 숫자를 확인하는 경로. 반드시 'QA 데이터'로 표시된다. */
export const QA_FILTERS: Pick<AnalyticsFilters, 'environment' | 'trafficType'> = { environment: 'staging', trafficType: 'qa' };

const DAY = 86_400_000;
/** 한국 날짜(YYYY-MM-DD). 운영자는 KST 로 '오늘'을 읽는다. */
export const kstDate = (time: number) => new Date(time + 9 * 3_600_000).toISOString().slice(0, 10);
const validDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

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

export function scopeLabel(filters: AnalyticsFilters, now: Date): string {
  const range = resolveRange(filters, now);
  const period = filters.period === 'custom' ? (range.ok ? `${range.from} ~ ${range.to}` : '기간 입력 필요') : PERIOD_LABEL[filters.period];
  const notice = NOTICE_FILTERS.find(item => item.key === filters.notice)?.label ?? '전체 공고';
  return `${ENVIRONMENT_LABEL[filters.environment]} · ${TRAFFIC_LABEL[filters.trafficType]}(${filters.trafficType}) · ${period} · ${notice}`;
}

/* ── 공식 운영 개시 상태 ─────────────────────────────────────────────────── */

export const OFFICIAL_NOTICE_IDS = ['samdo-1', 'samdo-2'] as const;

export type LaunchCheck = { key: 'official' | 'active' | 'start'; label: string; done: boolean; detail: string };
export type LaunchState = {
  /** real 집계 조건이 모두 갖춰졌는지. 서버 gate 와 같은 조건을 화면에서 다시 읽는다. */
  launched: boolean;
  checks: LaunchCheck[];
  collectionStartAt: string;
  requiredNoticeVersion: string;
};

/**
 * 서버 gate(shouldCollect)는 real 을 공식 원문 + ACTIVE + Production + 시작 시각 이후일 때만 받는다.
 * 화면은 그 조건을 공고 상태와 시각으로 다시 보여 줄 뿐이다. 시작 시각·버전은 gate 기본값(서버 env 값이 아님).
 */
export function launchState(notices: readonly Pick<ConsoleNotice, 'id' | 'status' | 'provenance'>[], now: Date,
  gate = analyticsGateFromEnv({})): LaunchState {
  const targets = OFFICIAL_NOTICE_IDS.map(id => notices.find(notice => notice.id === id));
  const official = targets.filter(notice => notice?.provenance.official).length;
  const active = targets.filter(notice => notice?.status === 'ACTIVE').length;
  const start = Date.parse(gate.collectionStartAt);
  const started = Number.isFinite(start) && now.getTime() >= start;
  const checks: LaunchCheck[] = [
    { key: 'official', label: `공식 ${gate.requiredNoticeVersion} 원문 확인`, done: official === targets.length, detail: `삼도 1·2지구 중 ${official}/${targets.length}개 공식 원문` },
    { key: 'active', label: '공고 운영 중(ACTIVE)', done: active === targets.length, detail: `${active}/${targets.length}개 ACTIVE` },
    { key: 'start', label: '운영 집계 시작 시각', done: started, detail: `${kstStamp(gate.collectionStartAt)}${started ? ' 이후' : ' 전'}` },
  ];
  return { launched: checks.every(check => check.done), checks, collectionStartAt: gate.collectionStartAt, requiredNoticeVersion: gate.requiredNoticeVersion };
}

/** '2026-10-27T00:00:00+09:00' → '10월 27일 00:00 (KST)' */
export function kstStamp(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return iso;
  const local = new Date(time + 9 * 3_600_000).toISOString();
  return `${Number(local.slice(5, 7))}월 ${Number(local.slice(8, 10))}일 ${local.slice(11, 16)} (KST)`;
}

/* ── 화면 상태 ──────────────────────────────────────────────────────────── */

export type AnalyticsViewState =
  | { kind: 'PRE_LAUNCH' }
  | { kind: 'INVALID_RANGE'; error: string }
  | { kind: 'EMPTY'; operational: boolean }
  | { kind: 'READY'; operational: boolean };

/** real 운영 화면은 개시 전이면 숫자 대신 안내. 0건은 '실제로 0건'일 때만 0으로 보인다. */
export function viewState(filters: AnalyticsFilters, launch: LaunchState, now: Date, summary: AnalyticsSummary | null): AnalyticsViewState {
  const range = resolveRange(filters, now);
  if (!range.ok) return { kind: 'INVALID_RANGE', error: range.error };
  const operational = isOperationalView(filters);
  if (filters.trafficType === 'real' && !launch.launched) return { kind: 'PRE_LAUNCH' };
  if (summary && isEmptySummary(summary)) return { kind: 'EMPTY', operational };
  return { kind: 'READY', operational };
}

export const isEmptySummary = (summary: AnalyticsSummary) =>
  !summary.sessionsStarted && !summary.assessmentsStarted && !summary.assessmentsCompleted && !summary.resultViews
  && !summary.resultSaves && !summary.qrCreates && !summary.copilotUsage;

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

/* ── KPI ────────────────────────────────────────────────────────────────── */

export type KpiTile = { key: string; label: string; value: string; unit: string; basis: string; delta: Delta; icon: string };

export function buildKpis(summary: AnalyticsSummary): { primary: KpiTile[]; secondary: KpiTile[] } {
  const prev = summary.previousPeriodComparison;
  const statusTotal = STATUS_ORDER.reduce((sum, key) => sum + summary.assessmentStatusDistribution[key], 0);
  const needs = summary.assessmentStatusDistribution.NEEDS_USER_INPUT;
  return {
    primary: [
      { key: 'sessions', label: '상담 시작 세션', value: num(summary.sessionsStarted), unit: '세션', basis: '익명 세션 · 사람 수 아님', icon: 'forum',
        delta: countDelta(summary.sessionsStarted, prev?.sessionsStarted, '세션') },
      { key: 'completed', label: '판정 완료 세션', value: num(summary.assessmentsCompleted), unit: '세션', basis: '판정 결과를 받은 세션', icon: 'task-alt',
        delta: countDelta(summary.assessmentsCompleted, prev?.assessmentsCompleted, '세션') },
      { key: 'rate', label: '완료율', value: pct(summary.completionRate), unit: '', basis: '판정 시작 세션 중 완료 세션', icon: 'donut-large',
        delta: rateDelta(summary.completionRate, prev ? prev.completionRate : undefined) },
      { key: 'needs', label: '추가 확인 필요', value: num(needs), unit: '건', basis: statusTotal ? `공급유형 판정 결과 ${num(statusTotal)}건 중 ${pct(needs / statusTotal)}` : '공급유형 판정 결과 기준', icon: 'help-outline',
        delta: countDelta(needs, undefined, '건') },
    ],
    secondary: [
      { key: 'started', label: '판정 시작 세션', value: num(summary.assessmentsStarted), unit: '세션', basis: '분석을 시작한 세션', icon: 'play-circle-outline', delta: countDelta(0, undefined, '') },
      { key: 'views', label: '결과 조회', value: num(summary.resultViews), unit: '회', basis: '조회 횟수 · 세션 아님', icon: 'visibility', delta: countDelta(0, undefined, '') },
      { key: 'saves', label: '결과 저장', value: num(summary.resultSaves), unit: '회', basis: '저장 횟수', icon: 'bookmark-border', delta: countDelta(0, undefined, '') },
      { key: 'qr', label: 'QR 생성', value: num(summary.qrCreates), unit: '회', basis: '생성 횟수 · 토큰 저장 안 함', icon: 'qr-code-2', delta: countDelta(0, undefined, '') },
    ],
  };
}

/* ── 퍼널 ───────────────────────────────────────────────────────────────── */

export type FunnelStep = {
  key: string; label: string; count: number;
  /** 첫 단계 대비. 첫 단계가 0이면 null */
  ofTotal: number | null;
  /** 이전 단계에서 빠진 세션. 첫 단계는 null. 다음 단계가 더 크면 음수 대신 anomaly */
  dropFromPrevious: { count: number; rate: number } | null;
  anomaly: boolean;
};

/**
 * 세션 단위 퍼널: 상담 시작 → 판정 시작 → 판정 완료. 세 단계 모두 '고유 익명 세션 수'다.
 * 결과 조회·저장·QR 은 이벤트 횟수라 같은 막대에 섞지 않는다(afterActions).
 */
export function buildFunnel(summary: AnalyticsSummary): { steps: FunnelStep[]; afterActions: Array<{ key: string; label: string; count: number; perCompleted: number | null }> } {
  const raw = [
    { key: 'session', label: '상담 시작', count: summary.sessionsStarted },
    { key: 'started', label: '판정 시작', count: summary.assessmentsStarted },
    { key: 'completed', label: '판정 완료', count: summary.assessmentsCompleted },
  ];
  const first = raw[0].count;
  const steps = raw.map((step, index): FunnelStep => {
    const previous = index ? raw[index - 1].count : null;
    const anomaly = previous !== null && step.count > previous;
    return {
      ...step,
      ofTotal: first ? step.count / first : null,
      dropFromPrevious: previous === null || anomaly ? null : { count: previous - step.count, rate: previous ? (previous - step.count) / previous : 0 },
      anomaly,
    };
  });
  const per = (count: number) => (summary.assessmentsCompleted ? count / summary.assessmentsCompleted : null);
  return {
    steps,
    afterActions: [
      { key: 'views', label: '결과 조회', count: summary.resultViews, perCompleted: per(summary.resultViews) },
      { key: 'saves', label: '결과 저장', count: summary.resultSaves, perCompleted: per(summary.resultSaves) },
      { key: 'qr', label: 'QR 생성', count: summary.qrCreates, perCompleted: per(summary.qrCreates) },
    ],
  };
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

/** 공급유형별 판정 결과 건수. 상태별 분리는 계약에 아직 없다(supplyTypeDistribution 은 건수만). */
export function supplyRows(summary: AnalyticsSummary): ShareRow[] {
  const entries = Object.entries(summary.supplyTypeDistribution);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  const known = SUPPLY_ORDER.map(key => ({ key, label: SUPPLY_LABEL[key], raw: key, count: summary.supplyTypeDistribution[key] ?? 0, share: total ? (summary.supplyTypeDistribution[key] ?? 0) / total : 0 }));
  const other = entries.filter(([key]) => !SUPPLY_ORDER.includes(key))
    .map(([key, count]) => ({ key, label: `기타 공급유형`, raw: key, count, share: total ? count / total : 0 }));
  return [...known, ...other];
}

/* ── AI 상담 품질 ───────────────────────────────────────────────────────── */

export type AiWarning = { level: AlertLevel; title: string; body: string };
export type AiQuality = {
  total: number;
  modes: ShareRow[];
  reasons: Array<ShareRow & { icon: string }>;
  fallbackRate: number | null;
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
  return { total, modes, reasons, fallbackRate, averageTurns: summary.averageTurns, durations, warnings };
}

/* ── 데이터 기준 ────────────────────────────────────────────────────────── */

/** 서버 요약에는 생성 시각이 없다. 화면은 '조회한 시각'을 기준 시각으로 보인다. */
export const ANALYTICS_STALE_MINUTES = 15;
export const isFetchStale = (fetchedAt: number, now: Date) => now.getTime() - fetchedAt >= ANALYTICS_STALE_MINUTES * 60_000;
