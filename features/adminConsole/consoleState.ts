import type { ConsoleCoverage, ConsoleSection, ConsoleSnapshot } from './contract.ts';

/**
 * 콘솔 화면 상태. "에러가 발생했습니다" 한 문장으로 뭉치지 않고, 운영자가 다음 행동을 고를 수 있게 나눈다.
 * - 로그인 필요(401) · 권한 없음(403) · 권한 확인 서버 불가(503 ADMIN_AUTH_UNAVAILABLE)
 * - 서버 오류(5xx) · 네트워크 끊김 · 응답 지연(시간 초과)
 */
export type ConsoleLoadErrorKind = 'UNAUTHORIZED' | 'FORBIDDEN' | 'AUTH_UNAVAILABLE' | 'SERVER' | 'NETWORK' | 'TIMEOUT';

export class ConsoleLoadError extends Error {
  readonly kind: ConsoleLoadErrorKind;
  readonly status: number | null;
  constructor(kind: ConsoleLoadErrorKind, status: number | null = null) {
    super(kind);
    this.kind = kind;
    this.status = status;
  }
}

/** HTTP 응답 → 상태. body 의 error 코드는 503 을 나눌 때만 본다. */
export function classifyResponse(status: number, errorCode?: string | null): ConsoleLoadErrorKind {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 503 && errorCode === 'ADMIN_AUTH_UNAVAILABLE') return 'AUTH_UNAVAILABLE';
  if (status === 408 || status === 504) return 'TIMEOUT';
  return 'SERVER';
}

export type ConsoleStateCopy = { title: string; body: string; action: 'LOGIN' | 'RETRY' | 'NONE'; icon: string };

export const LOAD_ERROR_COPY: Record<ConsoleLoadErrorKind, ConsoleStateCopy> = {
  UNAUTHORIZED: {
    title: '로그인이 필요해요',
    body: '운영 콘솔은 관리자·검수자 계정으로 로그인한 뒤 볼 수 있어요. 로그인 시간이 지나면 다시 로그인해 주세요.',
    action: 'LOGIN', icon: 'login',
  },
  FORBIDDEN: {
    title: '권한이 없습니다',
    body: '이 계정에는 운영 콘솔 권한(관리자·검수자)이 없어요. 권한이 필요하면 관리자에게 요청해 주세요.',
    action: 'NONE', icon: 'block',
  },
  AUTH_UNAVAILABLE: {
    title: '권한 확인 서버가 응답하지 않아요',
    body: '로그인은 되어 있지만 권한을 확인하지 못했어요. 권한이 없다는 뜻은 아니에요. 잠시 후 다시 시도해 주세요.',
    action: 'RETRY', icon: 'gpp-maybe',
  },
  SERVER: {
    title: '운영 데이터 서버에 문제가 있어요',
    body: '서버가 데이터를 돌려주지 못했어요. 잠시 후 다시 시도하고, 계속되면 서버 상태를 확인해 주세요.',
    action: 'RETRY', icon: 'cloud-off',
  },
  NETWORK: {
    title: '네트워크에 연결되어 있지 않아요',
    body: '이 기기의 인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
    action: 'RETRY', icon: 'wifi-off',
  },
  TIMEOUT: {
    title: '운영 데이터 연결이 지연되고 있어요',
    body: '정해진 시간 안에 응답이 오지 않았어요. 잠시 후 다시 시도해 주세요.',
    action: 'RETRY', icon: 'hourglass-empty',
  },
};

/** 이 시간보다 오래된 데이터는 '오래된 데이터'로 표시한다. */
export const STALE_AFTER_MINUTES = 15;

export function dataAgeMinutes(generatedAt: string, now: Date): number | null {
  const time = Date.parse(generatedAt);
  if (Number.isNaN(time)) return null;
  return Math.max(0, Math.floor((now.getTime() - time) / 60000));
}

export function isStale(generatedAt: string, now: Date): boolean {
  const age = dataAgeMinutes(generatedAt, now);
  return age !== null && age >= STALE_AFTER_MINUTES;
}

export function ageLabel(minutes: number): string {
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}시간 전` : `${Math.floor(hours / 24)}일 전`;
}

/** 영역 수집 여부. coverage 가 없으면 연결된 것으로 본다. */
export const collected = (coverage: ConsoleCoverage | undefined, section: ConsoleSection) => coverage?.[section] !== 'NOT_COLLECTED';

export const missingSections = (snapshot: ConsoleSnapshot): ConsoleSection[] =>
  (['notices', 'rules', 'assessments', 'ai', 'audit'] as ConsoleSection[]).filter(section => !collected(snapshot.coverage, section));

export const SECTION_LABEL: Record<ConsoleSection, string> = {
  notices: '공고', rules: '규칙 패키지', assessments: '판정 집계', ai: 'AI 상담 로그', audit: '감사 로그',
};

/** 영역이 비었을 때 문구: 수집 전과 실제 0건을 구분한다. */
export function emptyCopy(section: ConsoleSection, isCollected: boolean): { title: string; body: string } {
  if (!isCollected) {
    return {
      title: `${SECTION_LABEL[section]} 수집이 아직 연결되지 않았어요`,
      body: '0건이 아니라 아직 모으지 않은 상태예요. 운영 모니터링이 연결되면 여기에 보여요.',
    };
  }
  const copy: Record<ConsoleSection, { title: string; body: string }> = {
    notices: { title: '등록된 공고가 없어요', body: '공고 원문을 등록하면 여기에 보여요.' },
    rules: { title: '검토할 규칙이 없어요', body: '새 공고의 규칙이 추출되면 여기에 보여요.' },
    assessments: { title: '아직 집계된 판정이 없어요', body: '사용자가 판정을 받으면 상태별로 모여요.' },
    ai: { title: '아직 수집된 상담 로그가 없습니다', body: 'AI 상담 질문이 들어오면 답변 방식과 함께 쌓여요.' },
    audit: { title: '기록된 변경이 없어요', body: '공고·규칙을 바꾸면 누가 무엇을 바꿨는지 남아요.' },
  };
  return copy[section];
}
