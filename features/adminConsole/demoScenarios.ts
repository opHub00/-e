import type { ConsoleAiEvent, ConsoleAuditEntry, ConsoleNotice, ConsoleRule, ConsoleSnapshot, NoticeLifecycle } from './contract.ts';
import type { ConsoleLoadErrorKind } from './consoleState.ts';
import { CONSOLE_DEMO_SNAPSHOT } from './demoData.ts';

/**
 * 화면 상태 점검용 예시 시나리오. Demo 빌드 + ?demo=1&state=… 에서만 열린다(운영 빌드에서는 consoleSource 가 막는다).
 * 숫자는 레이아웃·성능 점검용이고 실제 운영 값이 아니다. 제목·질문에 '[예시]'를 붙인다.
 */
export type DemoState = 'populated' | 'loading' | 'empty' | 'partial' | 'stale' | 'large'
  | 'error' | 'timeout' | 'network' | 'auth' | 'unauthorized' | 'forbidden';

export const DEMO_STATES: DemoState[] = ['populated', 'loading', 'empty', 'partial', 'stale', 'large', 'error', 'timeout', 'network', 'auth', 'unauthorized', 'forbidden'];

export type DemoResult =
  | { kind: 'READY'; snapshot: ConsoleSnapshot }
  | { kind: 'LOADING' }
  | { kind: 'ERROR'; error: ConsoleLoadErrorKind; status: number | null };

const ERROR_STATES: Partial<Record<DemoState, { error: ConsoleLoadErrorKind; status: number | null }>> = {
  error: { error: 'SERVER', status: 500 },
  timeout: { error: 'TIMEOUT', status: null },
  network: { error: 'NETWORK', status: null },
  auth: { error: 'AUTH_UNAVAILABLE', status: 503 },
  unauthorized: { error: 'UNAUTHORIZED', status: 401 },
  forbidden: { error: 'FORBIDDEN', status: 403 },
};

/** 예시 화면의 '지금'. 실제 시계를 쓰면 예시 데이터가 늘 '오래된 데이터'로 보인다. */
export const demoClock = (snapshot: ConsoleSnapshot = CONSOLE_DEMO_SNAPSHOT) => new Date(Date.parse(snapshot.generatedAt) + 5 * 60000);

export function parseDemoState(value: string | string[] | undefined): DemoState {
  const raw = Array.isArray(value) ? value[0] : value;
  return DEMO_STATES.includes(raw as DemoState) ? raw as DemoState : 'populated';
}

export function demoScenario(state: DemoState): DemoResult {
  const failure = ERROR_STATES[state];
  if (failure) return { kind: 'ERROR', ...failure };
  if (state === 'loading') return { kind: 'LOADING' };
  if (state === 'empty') return { kind: 'READY', snapshot: emptySnapshot() };
  if (state === 'partial') return { kind: 'READY', snapshot: partialSnapshot() };
  if (state === 'stale') return { kind: 'READY', snapshot: { ...CONSOLE_DEMO_SNAPSHOT, generatedAt: shiftMinutes(CONSOLE_DEMO_SNAPSHOT.generatedAt, -180) } };
  if (state === 'large') return { kind: 'READY', snapshot: largeSnapshot() };
  return { kind: 'READY', snapshot: CONSOLE_DEMO_SNAPSHOT };
}

function shiftMinutes(iso: string, minutes: number): string {
  const date = new Date(Date.parse(iso) + minutes * 60000);
  // +09:00 표기를 유지한다(화면이 앞 16자를 시각으로 읽는다).
  const local = new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 19);
  return `${local}+09:00`;
}

function emptySnapshot(): ConsoleSnapshot {
  return {
    generatedAt: CONSOLE_DEMO_SNAPSHOT.generatedAt,
    notices: [], rules: [], ai: [], audit: [], errors: [],
    assessments: { date: CONSOLE_DEMO_SNAPSHOT.assessments.date, byStatus: { COMPLETE: 0, NEEDS_USER_INPUT: 0, INELIGIBLE: 0, UNAVAILABLE: 0 }, blockers: [] },
    coverage: { notices: 'CONNECTED', rules: 'CONNECTED', assessments: 'CONNECTED', ai: 'CONNECTED', audit: 'CONNECTED' },
  };
}

/** 공고·규칙·감사는 연결됐지만 운영 모니터링(AI 로그·판정 집계)은 아직 수집 전. */
function partialSnapshot(): ConsoleSnapshot {
  return {
    ...CONSOLE_DEMO_SNAPSHOT,
    ai: [],
    assessments: { date: CONSOLE_DEMO_SNAPSHOT.assessments.date, byStatus: { COMPLETE: 0, NEEDS_USER_INPUT: 0, INELIGIBLE: 0, UNAVAILABLE: 0 }, blockers: [] },
    errors: [{ at: CONSOLE_DEMO_SNAPSHOT.generatedAt, source: '운영 모니터링', message: '[예시] 운영 DB 연결 대기 · AI 상담 로그와 판정 집계는 아직 수집되지 않았어요.', level: 'INFO' }],
    coverage: { notices: 'CONNECTED', rules: 'CONNECTED', audit: 'CONNECTED', ai: 'NOT_COLLECTED', assessments: 'NOT_COLLECTED' },
  };
}

/* ── 많은 데이터(100건대) ─────────────────────────────────────────────────── */

const PLACES = ['가람', '나래', '다솜', '라온', '마루', '바다', '사랑', '아라', '자람', '하늘'];
const KINDS = ['국민임대', '행복주택', '영구임대', '매입임대', '토지임대부 분양주택', '공공분양'];
const STATUSES: NoticeLifecycle[] = ['ACTIVE', 'ACTIVE', 'REVIEW_REQUIRED', 'SOURCE_VERIFIED', 'APPROVED', 'DRAFT', 'ARCHIVED', 'ACTIVE'];
const RULE_TYPES = ['소득', '자산', '자동차', '무주택', '거주', '청약통장', '혼인', '자녀'];
const SUPPLIES = ['일반', '우선', '신혼부부', '생애최초', '다자녀', '노부모'];
const REASONS = ['timeout', 'provider_error', 'grounding_rejected', 'parser_failure', 'missing_key', 'unknown'];
const DAY = CONSOLE_DEMO_SNAPSHOT.assessments.date;
const two = (value: number) => String(value).padStart(2, '0');
/** 기준 시각에서 6분 간격으로 거슬러 올라간 시각(100건이 같은 날 안에 든다). */
const timeOf = (index: number) => shiftMinutes(CONSOLE_DEMO_SNAPSHOT.generatedAt, -(index * 6 + 1));

function largeSnapshot(): ConsoleSnapshot {
  const notices: ConsoleNotice[] = Array.from({ length: 100 }, (_, index) => {
    const place = PLACES[index % PLACES.length];
    const kind = KINDS[index % KINDS.length];
    const status = STATUSES[index % STATUSES.length];
    const long = index % 9 === 0;
    const title = long
      ? `[예시] ${place}지구 ${index + 1}블록 ${kind} 예비입주자 및 추가 모집 공고 (정정 공고 반영 · 소득·자산 기준 변경분 포함)`
      : `[예시] ${place}지구 ${index + 1}블록 ${kind}`;
    return {
      id: `demo-large-${index + 1}`, title, region: `예시시 ${place}구`, announcementDate: `2026-${two(9 + (index % 3))}-${two(1 + (index % 28))}`, status,
      ruleVersion: status === 'DRAFT' ? null : `rules-1.${index % 9}.0`, ragVersion: status === 'DRAFT' || status === 'SOURCE_VERIFIED' ? null : `rag-2026.10.${two(1 + (index % 15))}`,
      provenance: { fileName: `(예시) ${place}지구 ${index + 1}블록 모집공고.pdf`, sha256: `demo${String(index).padStart(4, '0')}aaaabbbbccccddddeeeeffff${String(index).padStart(4, '0')}`, official: index % 5 !== 0 },
      updatedAt: timeOf(index), supplyTypes: SUPPLIES.slice(0, 2 + (index % 4)), ruleCount: 10 + (index % 30), ragChunkCount: 40 + index,
      validation: index % 11 === 0 ? { status: 'FAIL', messages: ['소득 기준 표 1개 미추출'] } : index % 7 === 0 ? { status: 'WARN', messages: ['연도 기준 표기 확인 필요'] } : { status: 'PASS', messages: [] },
      history: [{ at: timeOf(index), actor: `운영자 ${String.fromCharCode(65 + (index % 4))}`, summary: index % 2 ? '규칙 패키지 갱신' : 'RAG 색인 갱신' }],
    };
  });
  const rules: ConsoleRule[] = notices.slice(0, 8).flatMap((notice, noticeIndex) => Array.from({ length: 30 }, (_, index) => {
    const n = noticeIndex * 30 + index;
    const missing = n % 13 === 0;
    return {
      id: `lr${n + 1}`, noticeId: notice.id, ruleType: RULE_TYPES[n % RULE_TYPES.length], supplyType: SUPPLIES[n % SUPPLIES.length],
      condition: `${RULE_TYPES[n % RULE_TYPES.length]} 기준 ${index + 1}`, value: n % 5 === 0 ? '도시근로자 월평균소득 100% 이하(맞벌이 120%)' : `${(index + 1) * 10}`,
      evidence: missing
        ? { section: '확인 필요', excerpt: '근거 문장 확인 필요', locator: 'locator 없음' }
        : { section: `${1 + (index % 6)}. 신청자격`, excerpt: `(예시) ${RULE_TYPES[n % RULE_TYPES.length]} 기준 문장 ${index + 1}`, locator: JSON.stringify({ page: 3 + (index % 9), table: 1 + (index % 3), row: 1 + (index % 7) }) },
      validation: n % 17 === 0 ? { status: 'FAIL', messages: ['값과 원문 숫자가 달라요'] } : n % 6 === 0 ? { status: 'WARN', messages: ['단위 확인 필요'] } : { status: 'PASS', messages: [] },
      status: n % 4 === 0 ? 'APPROVED' : 'PENDING',
      evidenceMissing: missing,
      changed: n % 5 === 0,
    };
  }));
  const ai: ConsoleAiEvent[] = Array.from({ length: 100 }, (_, index) => {
    // 최근 20건: 제공자 오류·시간 초과가 몰린 장애 구간. 그 이전: 여러 사유가 섞인 평소 모습.
    const burst = index < 20;
    const mode = burst || index % 4 === 0 ? 'fallback' : index % 3 === 0 ? 'deterministic' : 'llm';
    const reason = burst ? (index % 2 ? 'provider_error' : 'timeout') : mode === 'fallback' ? REASONS[Math.floor(index / 4) % REASONS.length] : null;
    const longQuestion = index % 10 === 0;
    return {
      id: `la${index + 1}`, at: timeOf(index),
      question: longQuestion
        ? `[예시] 저는 지금 무주택이고 청약통장을 오래 넣었는데요, 두 지구 중에 어디가 더 유리한지 그리고 소득 기준은 맞벌이면 어떻게 계산하는지와 자산 기준에 자동차가 들어가는지도 같이 알려 주세요 (${index + 1})`
        : `[예시] 공고 ${1 + (index % 20)} 신청 자격 질문 ${index + 1}`,
      mode, provider: mode === 'deterministic' ? null : 'google-gemini', fallbackReason: reason,
      groundingRejected: reason === 'grounding_rejected', providerError: reason === 'provider_error' || reason === 'timeout',
      evidenceCount: index % 5, latencyMs: mode === 'deterministic' ? 30 + index : 1200 + index * 37,
      evidence: [{ section: '3. 신청자격', excerpt: `(예시) 근거 문장 ${index + 1}`, locator: JSON.stringify({ page: 2 + (index % 8), paragraph: 1 + (index % 4) }) }],
    };
  });
  type Values = ConsoleAuditEntry['before'];
  const audit: ConsoleAuditEntry[] = Array.from({ length: 100 }, (_, index): ConsoleAuditEntry => {
    const kind = index % 4;
    const target = notices[index % notices.length];
    const values = (value: Values) => value;
    return {
      id: `lu${index + 1}`, at: timeOf(index), actor: `운영자 ${String.fromCharCode(65 + (index % 4))}`,
      action: ['규칙 패키지 승인', 'RAG 색인 갱신', '공고 상태 변경', '공고 원문 등록'][kind],
      entity: { type: (['RULE_PACKAGE', 'RAG', 'NOTICE', 'NOTICE'] as const)[kind], id: target.id, label: target.title },
      before: values(kind === 3 ? null : kind === 0 ? { status: 'REVIEW_REQUIRED', version: `1.${index % 9}.0` } : kind === 1 ? { ragVersion: `rag-2026.10.${two(1 + (index % 14))}`, chunks: 200 + index } : { status: 'APPROVED', updatedAt: timeOf(index + 1) }),
      after: values(kind === 3 ? { status: 'SOURCE_VERIFIED', sourceHash: target.provenance.sha256 } : kind === 0 ? { status: 'ACTIVE', version: `1.${(index % 9) + 1}.0` } : kind === 1 ? { ragVersion: `rag-2026.10.${two(2 + (index % 14))}`, chunks: 210 + index } : { status: 'ACTIVE', updatedAt: timeOf(index) }),
    };
  });
  return {
    generatedAt: CONSOLE_DEMO_SNAPSHOT.generatedAt,
    notices, rules, ai, audit,
    assessments: {
      date: DAY,
      byStatus: { COMPLETE: 4120, NEEDS_USER_INPUT: 2380, INELIGIBLE: 910, UNAVAILABLE: 74 },
      blockers: [...CONSOLE_DEMO_SNAPSHOT.assessments.blockers.map(item => ({ ...item, count: item.count * 23 })), { label: '세대 구성원 중 해외 장기 체류 기간(최근 3년 기준, 출입국 사실증명으로 확인)', count: 120 }],
    },
    errors: [
      { at: timeOf(2), source: 'AI 상담', message: '[예시] 제공자 응답 시간 초과(8초)가 10분 동안 7건 이어져 대체 답변으로 전환했어요. 요청 ID demo-req-0000-aaaa-bbbb-cccc-dddd-eeee-ffff-0000', level: 'ERROR' },
      { at: timeOf(9), source: '규칙 추출', message: '[예시] 가람지구 1블록 소득 기준 표 1개 미추출', level: 'WARNING' },
    ],
  };
}
