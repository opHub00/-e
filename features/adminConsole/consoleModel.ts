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

/* ── 알림 위계 ─────────────────────────────────────────────────────────────
 * 색만으로 나누지 않는다: 수준마다 글자 라벨 + 아이콘이 따로 있다.
 * 정렬: 수준(오류 → 조치 필요 → 주의 → 안내) → 영역(장애 → 검토 → 대체 답변 → 근거 → 미해결 → 공고 → 데이터).
 */
export type AlertLevel = 'ERROR' | 'ACTION_REQUIRED' | 'WARNING' | 'INFO';
export type AlertCategory = 'outage' | 'review' | 'fallback' | 'grounding' | 'unresolved' | 'assessment' | 'notice' | 'data';
export type ConsoleTarget = 'dashboard' | 'notices' | 'rules' | 'assessments' | 'ai' | 'audit';
export type ConsoleAlert = {
  id: string;
  level: AlertLevel;
  category: AlertCategory;
  title: string;
  detail: string;
  /** 눌렀을 때 갈 콘솔 화면(menu key) */
  target: ConsoleTarget;
};

export const ALERT_LEVEL_META: Record<AlertLevel, { label: string; icon: 'error' | 'assignment-late' | 'warning-amber' | 'info'; tone: 'pink' | 'amber' | 'purple' | 'neutral'; rank: number }> = {
  ERROR: { label: '오류', icon: 'error', tone: 'pink', rank: 0 },
  ACTION_REQUIRED: { label: '조치 필요', icon: 'assignment-late', tone: 'amber', rank: 1 },
  WARNING: { label: '주의', icon: 'warning-amber', tone: 'purple', rank: 2 },
  INFO: { label: '안내', icon: 'info', tone: 'neutral', rank: 3 },
};
const CATEGORY_RANK: Record<AlertCategory, number> = { outage: 0, review: 1, fallback: 2, grounding: 3, unresolved: 4, assessment: 5, notice: 6, data: 7 };

export const ALERT_THRESHOLDS = {
  /** 오늘 AI 질문 중 대체 답변 비율이 이 이상이면 주의(표본 5건 이상일 때) */
  fallbackRate: 0.3,
  minAiSample: 5,
  /** 제공자 오류·시간 초과가 이 건수 이상이고 AI 호출의 이 비율 이상이면 장애 의심 */
  outageCount: 3,
  outageRate: 0.3,
  /** 추가 입력 필요 판정이 이 비율 이상이면 주의 */
  needsInputRate: 0.3,
  /** 데이터가 이 분 이상 지났으면 오래된 데이터 */
  staleMinutes: 15,
} as const;

type ReasonIcon = 'vpn-key' | 'cloud-off' | 'timer-off' | 'gpp-bad' | 'code-off' | 'help-outline';
export const FALLBACK_REASON_LABEL: Record<string, { label: string; icon: ReasonIcon }> = {
  missing_key: { label: 'API 키 미설정', icon: 'vpn-key' },
  provider_error: { label: '제공자 오류', icon: 'cloud-off' },
  timeout: { label: '응답 시간 초과', icon: 'timer-off' },
  grounding_rejected: { label: '근거 검증 실패', icon: 'gpp-bad' },
  parser_failure: { label: '응답 해석 실패', icon: 'code-off' },
  unknown: { label: '원인 미상', icon: 'help-outline' },
};
/** 대체 사유 코드 → 읽는 말과 아이콘. 모르는 값은 서버가 준 설명문 그대로. */
export const fallbackReasonMeta = (reason: string | null): { label: string; icon: ReasonIcon } | null =>
  (reason ? FALLBACK_REASON_LABEL[reason] ?? { label: reason, icon: 'help-outline' } : null);

const isTimeout = (event: ConsoleAiEvent) => event.fallbackReason === 'timeout';
const isProviderError = (event: ConsoleAiEvent) => event.fallbackReason === 'provider_error' || (event.providerError && !isTimeout(event));

export function buildAlerts(snapshot: ConsoleSnapshot, now: Date): ConsoleAlert[] {
  const alerts: ConsoleAlert[] = [];
  const day = snapshot.assessments.date;
  const aiToday = snapshot.ai.filter(event => sameDay(event.at, day));
  const aiCalls = aiToday.filter(event => event.mode !== 'deterministic').length;

  // 1. 장애·오류
  const providerFailures = aiToday.filter(event => isProviderError(event) || isTimeout(event));
  if (providerFailures.length >= ALERT_THRESHOLDS.outageCount && aiCalls && providerFailures.length / aiCalls >= ALERT_THRESHOLDS.outageRate) {
    alerts.push({ id: 'ai-outage', level: 'ERROR', category: 'outage', target: 'ai', title: 'AI 제공자 장애 의심', detail: `오늘 AI 호출 ${aiCalls}건 중 ${providerFailures.length}건이 제공자 오류·시간 초과예요. 사용자는 대체 답변을 받고 있어요.` });
  } else if (providerFailures.length) {
    alerts.push({ id: 'ai-provider', level: 'WARNING', category: 'outage', target: 'ai', title: `AI 제공자 오류·지연 ${providerFailures.length}건`, detail: '대체 답변으로 전환됐어요. 늘어나면 장애로 올라가요.' });
  }
  const byLevel = (level: 'ERROR' | 'WARNING' | 'INFO') => snapshot.errors.filter(error => (error.level ?? 'ERROR') === level);
  const errors = byLevel('ERROR');
  if (errors.length) alerts.push({ id: 'errors', level: 'ERROR', category: 'outage', target: 'dashboard', title: `운영 오류 ${errors.length}건`, detail: errors.slice(0, 2).map(error => `${error.source}: ${error.message}`).join(' · ') });
  byLevel('WARNING').forEach((error, index) => alerts.push({ id: `warn-${index}`, level: 'WARNING', category: 'outage', target: 'dashboard', title: error.source, detail: error.message }));

  // 2. 검토·조치
  const activeFail = snapshot.notices.filter(notice => notice.status === 'ACTIVE' && notice.validation.status === 'FAIL');
  if (activeFail.length) alerts.push({ id: 'active-fail', level: 'ACTION_REQUIRED', category: 'review', target: 'notices', title: `서비스 중 공고의 규칙 검증 실패 ${activeFail.length}건`, detail: activeFail.slice(0, 2).map(notice => notice.title).join(' · ') });
  const failRules = snapshot.rules.filter(rule => rule.status === 'PENDING' && rule.validation.status === 'FAIL');
  if (failRules.length) alerts.push({ id: 'rule-fail', level: 'ACTION_REQUIRED', category: 'review', target: 'rules', title: `검증 실패 규칙 ${failRules.length}건`, detail: '원문을 다시 확인해 수정해야 승인할 수 있어요.' });
  const reviewNotices = new Set([
    ...snapshot.notices.filter(notice => notice.status === 'REVIEW_REQUIRED').map(notice => notice.id),
    ...snapshot.rules.filter(rule => rule.status === 'PENDING').map(rule => rule.noticeId),
  ]);
  if (reviewNotices.size) {
    const pending = snapshot.rules.filter(rule => rule.status === 'PENDING').length;
    alerts.push({ id: 'review', level: 'ACTION_REQUIRED', category: 'review', target: 'rules', title: `검토 대기 공고 ${reviewNotices.size}건`, detail: `승인 전 규칙 ${pending}건이 남아 있어요. 승인 전에는 사용자 판정에 쓰이지 않아요.` });
  }

  // 3·4. AI 품질
  const fallback = aiToday.filter(event => event.mode === 'fallback').length;
  if (aiToday.length >= ALERT_THRESHOLDS.minAiSample && fallback / aiToday.length >= ALERT_THRESHOLDS.fallbackRate) {
    alerts.push({ id: 'fallback', level: 'WARNING', category: 'fallback', target: 'ai', title: `대체 답변 비율 ${percent(fallback / aiToday.length)}`, detail: `오늘 ${aiToday.length}건 중 ${fallback}건 · 주의 기준 ${percent(ALERT_THRESHOLDS.fallbackRate)} 이상` });
  }
  const grounding = aiToday.filter(event => event.groundingRejected).length;
  if (grounding) alerts.push({ id: 'grounding', level: 'WARNING', category: 'grounding', target: 'ai', title: `근거 검증 실패 ${grounding}건`, detail: '답변이 공고 근거와 맞지 않아 폐기됐어요. 해당 질문과 근거를 확인해 주세요.' });

  // 5. 판정이 멈추는 곳
  const stats = snapshot.assessments.byStatus;
  const total = Object.values(stats).reduce((sum, count) => sum + count, 0);
  const top = [...snapshot.assessments.blockers].sort((a, b) => b.count - a.count)[0];
  if (total && stats.NEEDS_USER_INPUT / total >= ALERT_THRESHOLDS.needsInputRate) {
    alerts.push({ id: 'needs-input', level: 'WARNING', category: 'unresolved', target: 'assessments', title: `추가 입력 필요 판정 ${percent(stats.NEEDS_USER_INPUT / total)}`, detail: top ? `가장 많이 막히는 항목: ${top.label} (${top.count.toLocaleString('ko-KR')}건)` : '막힌 항목 집계가 아직 없어요.' });
  }
  if (stats.UNAVAILABLE) alerts.push({ id: 'unavailable', level: 'ACTION_REQUIRED', category: 'assessment', target: 'assessments', title: `판정 불가 ${stats.UNAVAILABLE.toLocaleString('ko-KR')}건`, detail: '규칙 패키지가 없거나 공고 상태 때문에 판정하지 못했어요. 공고·규칙 상태를 확인해 주세요.' });

  // 데이터 상태
  const time = Date.parse(snapshot.generatedAt);
  const age = Number.isNaN(time) ? null : Math.floor((now.getTime() - time) / 60000);
  if (age !== null && age >= ALERT_THRESHOLDS.staleMinutes) {
    alerts.push({ id: 'stale', level: 'WARNING', category: 'data', target: 'dashboard', title: '운영 데이터가 오래됐어요', detail: `${age >= 60 ? `${Math.floor(age / 60)}시간` : `${age}분`} 전 기준이에요. 새로고침해도 그대로면 집계 작업을 확인해 주세요.` });
  }
  byLevel('INFO').forEach((error, index) => alerts.push({ id: `info-${index}`, level: 'INFO', category: 'data', target: 'dashboard', title: error.source, detail: error.message }));

  return alerts.sort((a, b) => ALERT_LEVEL_META[a.level].rank - ALERT_LEVEL_META[b.level].rank || CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category]);
}

/* ── AI 모니터링 ─────────────────────────────────────────────────────────── */

export type AiLogFilter = AiFilter | 'timeout';

export function filterAiLog(events: ConsoleAiEvent[], filter: AiLogFilter, query = ''): ConsoleAiEvent[] {
  const byFilter = filter === 'timeout' ? events.filter(isTimeout)
    : filter === 'provider' ? events.filter(isProviderError)
      : filterAi(events, filter);
  const sorted = [...byFilter].sort((a, b) => b.at.localeCompare(a.at));
  return query.trim() ? sorted.filter(event => matches(`${event.question} ${fallbackReasonMeta(event.fallbackReason)?.label ?? ''}`, query)) : sorted;
}

export function aiSummary(events: ConsoleAiEvent[]) {
  const latencies = events.map(event => event.latencyMs).sort((a, b) => a - b);
  const p95 = latencies.length ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)] : null;
  const average = latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : null;
  const fallback = events.filter(event => event.mode === 'fallback').length;
  return { total: events.length, fallbackRate: events.length ? fallback / events.length : null, averageMs: average, p95Ms: p95 };
}

/**
 * 화면에 내보내기 전에 한 번 더 가린다. 서버가 이미 정리한 질문이지만 운영 화면에 개인정보가 보이면 안 되므로 이중으로 막는다.
 * 이메일 · 주민등록번호 · 전화번호 · 10자리 이상 숫자(계좌·카드)를 가린다.
 */
export function maskPii(text: string): { text: string; masked: boolean } {
  let masked = false;
  const swap = (value: string, pattern: RegExp, label: string) => value.replace(pattern, () => { masked = true; return label; });
  let result = swap(text, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[이메일]');
  result = swap(result, /\d{6}\s?-\s?[1-4]\d{6}|\b\d{6}[1-4]\d{6}\b/g, '[주민번호]');
  result = swap(result, /01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/g, '[전화번호]');
  result = swap(result, /\b0\d{1,2}[-.\s]\d{3,4}[-.\s]\d{4}\b/g, '[전화번호]');
  result = swap(result, /\d[\d-]{9,}\d/g, '[숫자 가림]');
  return { text: result, masked };
}

/* ── 규칙 검토 ───────────────────────────────────────────────────────────── */

type Rule = ConsoleSnapshot['rules'][number];

export const evidenceMissing = (rule: Rule) =>
  rule.evidenceMissing ?? (!rule.evidence.excerpt.trim() || /근거 문장 확인 필요/.test(rule.evidence.excerpt) || /locator 없음/.test(rule.evidence.locator));

export type RuleFilters = {
  query: string;
  validation: 'ALL' | 'PASS' | 'WARN' | 'FAIL';
  evidence: 'ALL' | 'HAS' | 'MISSING';
  supply: string;
  status: 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';
  changedOnly: boolean;
};
export const DEFAULT_RULE_FILTERS: RuleFilters = { query: '', validation: 'ALL', evidence: 'ALL', supply: 'ALL', status: 'ALL', changedOnly: false };

export function filterRules<R extends Rule>(rules: R[], filters: RuleFilters): R[] {
  return rules.filter(rule =>
    (filters.validation === 'ALL' || rule.validation.status === filters.validation)
    && (filters.evidence === 'ALL' || (filters.evidence === 'MISSING') === evidenceMissing(rule))
    && (filters.supply === 'ALL' || rule.supplyType === filters.supply)
    && (filters.status === 'ALL' || rule.status === filters.status)
    && (!filters.changedOnly || rule.changed === true)
    && (!filters.query.trim() || matches(`${rule.ruleType} ${rule.supplyType} ${rule.condition} ${rule.value} ${rule.evidence.section} ${rule.evidence.excerpt}`, filters.query)));
}

/** 직전 버전과의 비교 데이터가 하나라도 있어야 '바뀐 것만' 필터를 켤 수 있다. */
export const changeDataAvailable = (rules: Rule[]) => rules.some(rule => rule.changed !== undefined);

const LOCATOR_LABEL: Record<string, string> = {
  page: '쪽', pageNumber: '쪽', section: '절', sectionId: '절', paragraph: '문단', line: '줄', lineStart: '시작 줄', lineEnd: '끝 줄',
  table: '표', tableIndex: '표', row: '행', column: '열', cell: '칸', chunk: '청크', chunkId: '청크', documentId: '문서', start: '시작', end: '끝', heading: '제목',
};

/** locator 를 사람이 읽는 줄로. JSON 이면 '쪽 5 · 표 2 · 행 3', 아니면 그대로. */
export function formatLocator(locator: string): string {
  const raw = locator.trim();
  if (!raw.startsWith('{') && !raw.startsWith('[')) return raw;
  try {
    const value: unknown = JSON.parse(raw);
    const flat = (input: unknown, prefix = ''): string[] => {
      if (input === null || input === undefined) return [];
      if (Array.isArray(input)) return [`${prefix}${input.map(item => (item !== null && typeof item === 'object' ? flat(item).join(' ') : String(item))).join(', ')}`];
      if (typeof input === 'object') {
        return Object.entries(input as Record<string, unknown>).flatMap(([key, item]) => {
          const label = LOCATOR_LABEL[key] ?? key;
          if (item !== null && typeof item === 'object' && !Array.isArray(item)) return flat(item, `${label} `);
          return [`${prefix}${label} ${Array.isArray(item) ? item.join(', ') : String(item)}`];
        });
      }
      return [`${prefix}${String(input)}`];
    };
    const parts = flat(value).filter(Boolean);
    return parts.length ? parts.join(' · ') : '위치 정보 없음';
  } catch {
    return raw;
  }
}

/* ── 감사 로그 ───────────────────────────────────────────────────────────── */

export const AUDIT_FIELD_LABEL: Record<string, string> = {
  id: 'ID', status: '상태', version: '버전', sourceHash: '원문 해시', sha256: '원문 해시', updatedAt: '수정 시각', createdAt: '생성 시각',
  activatedAt: '서비스 시작', ragVersion: 'RAG 버전', ruleVersion: '규칙 버전', chunks: 'RAG 청크 수', reason: '사유', title: '제목', value: '값',
};

const STATUS_WORD: Record<string, string> = {
  ...Object.fromEntries(Object.entries(LIFECYCLE_LABEL).map(([key, item]) => [key, item.label])),
  PENDING: '검토 대기', REJECTED: '반려', DEPRECATED: '사용 중지',
};

export function formatAuditValue(key: string, value: string): string {
  if (value === '—') return '없음';
  if (value === 'true' || value === 'false') return value === 'true' ? '예' : '아니요';
  if (/status/i.test(key) && STATUS_WORD[value]) return STATUS_WORD[value];
  if (/hash|sha/i.test(key)) return shortHash(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return shortTime(value);
  return value.length > 80 ? `${value.slice(0, 77)}…` : value;
}

export type ReadableDiff = { key: string; field: string; before: string; after: string; kind: DiffLine['kind'] };

/** 바뀐 필드만, 필드 이름과 값을 사람이 읽는 말로. JSON 덩어리를 그대로 보이지 않는다. */
export function readableAuditDiff(entry: ConsoleAuditEntry): ReadableDiff[] {
  return auditDiff(entry).map(line => ({
    key: line.key,
    field: AUDIT_FIELD_LABEL[line.key] ?? line.key,
    before: formatAuditValue(line.key, line.before),
    after: formatAuditValue(line.key, line.after),
    kind: line.kind,
  }));
}

export const AUDIT_ENTITY_LABEL: Record<ConsoleAuditEntry['entity']['type'], string> = {
  NOTICE: '공고', RULE: '규칙', RULE_PACKAGE: '규칙 패키지', RAG: 'RAG', SETTING: '설정',
};

export function filterAudit(entries: ConsoleAuditEntry[], entity: 'ALL' | ConsoleAuditEntry['entity']['type'], query: string): ConsoleAuditEntry[] {
  return entries
    .filter(entry => entity === 'ALL' || entry.entity.type === entity)
    .filter(entry => !query.trim() || matches(`${entry.actor} ${entry.action} ${entry.entity.label} ${entry.entity.id}`, query))
    .sort((a, b) => b.at.localeCompare(a.at));
}

/* ── 공고 · 판정 ─────────────────────────────────────────────────────────── */

export function filterNotices(notices: ConsoleNotice[], status: 'ALL' | NoticeLifecycle, query: string): ConsoleNotice[] {
  return notices
    .filter(notice => status === 'ALL' || notice.status === status)
    .filter(notice => !query.trim() || matches(`${notice.title} ${notice.region} ${notice.id}`, query))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export type AssessmentInsight = {
  status: AssessmentStatus;
  count: number;
  share: number;
  level: AlertLevel | null;
  /** 운영자가 할 일 한 줄 */
  action: string;
  target: ConsoleTarget | null;
};

/** 판정 분포를 '그래서 무엇을 할지'로 바꾼다. 급한 상태가 위로. */
export function assessmentInsights(stats: ConsoleSnapshot['assessments']): AssessmentInsight[] {
  const total = Object.values(stats.byStatus).reduce((sum, count) => sum + count, 0);
  const top = [...stats.blockers].sort((a, b) => b.count - a.count)[0];
  const share = (status: AssessmentStatus) => (total ? stats.byStatus[status] / total : 0);
  const needs = share('NEEDS_USER_INPUT');
  return (['NEEDS_USER_INPUT', 'UNAVAILABLE', 'INELIGIBLE', 'COMPLETE'] as AssessmentStatus[]).map((status): AssessmentInsight => {
    const count = stats.byStatus[status];
    if (status === 'NEEDS_USER_INPUT') {
      return {
        status, count, share: needs, target: 'assessments',
        level: needs >= ALERT_THRESHOLDS.needsInputRate ? 'WARNING' : null,
        action: !count ? '추가 입력 때문에 멈춘 판정이 없어요.'
          : top ? `가장 많이 막히는 항목 '${top.label}'(${top.count.toLocaleString('ko-KR')}건)의 질문 문구·확인 방법부터 점검해요.`
            : '막힌 항목 집계가 들어오면 우선순위를 보여 드려요.',
      };
    }
    if (status === 'UNAVAILABLE') {
      return { status, count, share: share(status), target: 'rules', level: count ? 'ACTION_REQUIRED' : null, action: count ? '규칙 패키지가 없거나 서비스 전 공고예요. 공고·규칙 상태를 확인해요.' : '판정 불가가 없어요.' };
    }
    if (status === 'INELIGIBLE') {
      return { status, count, share: share(status), target: null, level: null, action: '대상이 아닌 사용자가 많이 들어오면 안내 문구·노출 공고를 점검해요.' };
    }
    return { status, count, share: share(status), target: null, level: null, action: '정상적으로 판정이 끝났어요.' };
  });
}

/* ── 공통 ────────────────────────────────────────────────────────────────── */

/** 띄어쓰기·대소문자 무시 포함 검색 */
export function matches(text: string, query: string): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, '');
  return normalize(text).includes(normalize(query));
}

/** 한 번에 그리는 줄 수. 서버 페이지네이션 계약은 Codex 영역이라 화면 안에서만 나눠 그린다. */
export const PAGE_SIZE = 25;
