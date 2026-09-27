import type { ScoringFormula, ScoringStatus } from './domain.ts';

/**
 * 산식 저장소.
 *
 * 화면은 이 인터페이스만 본다. 지금 들어 있는 구현은 파일과 브라우저 초안을 쓰는 것이고,
 * `supabase/migrations/20260927120000_scoring_formulas.sql` 을 실행하면 Supabase 구현으로 갈아끼운다.
 * 화면은 그대로 둔 채 바꿀 수 있게, 읽기·상태 변경·저장을 여기서 한 번에 정의해 둔다.
 */
export type ScoringRepository = {
  /** 관리자 화면이 보는 전체 목록(초안 포함). */
  list: () => Promise<ScoringFormula[]>;
  /** 초안 저장. 발행된 버전은 저장소가 거절한다. */
  save: (formula: ScoringFormula) => Promise<void>;
  /** 상태 변경. 왜 바꿨는지 함께 남긴다. */
  setStatus: (id: string, status: ScoringStatus, summary: string) => Promise<void>;
};

export type ScoringRepositoryError =
  /** 발행된 버전의 배점을 고치려 했다. 새 버전을 만들어야 한다. */
  | 'SCORING_VERSION_PUBLISHED'
  /** 같은 적용 대상에 이미 활성 버전이 있다. */
  | 'SCORING_TARGET_ALREADY_ACTIVE'
  | 'SCORING_FORMULA_NOT_FOUND'
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN';

/** 운영자가 바로 이해할 말로 옮긴다. 코드값을 그대로 보여주지 않는다. */
export const SCORING_ERROR_MESSAGE: Record<ScoringRepositoryError, string> = {
  SCORING_VERSION_PUBLISHED: '이미 서비스에 쓰인 버전이라 배점을 바꿀 수 없어요. 새 버전을 만들어 주세요.',
  SCORING_TARGET_ALREADY_ACTIVE: '같은 적용 대상에 이미 활성 산식이 있어요. 먼저 그 산식을 중지해 주세요.',
  SCORING_FORMULA_NOT_FOUND: '산식을 찾지 못했어요. 목록을 새로 불러와 주세요.',
  AUTH_REQUIRED: '관리자 계정으로 로그인해 주세요.',
  FORBIDDEN: '이 작업은 관리자만 할 수 있어요.',
};

export const scoringErrorMessage = (code: string): string =>
  SCORING_ERROR_MESSAGE[code as ScoringRepositoryError] ?? `처리하지 못했어요 (${code}).`;

/** Supabase RPC 이름. migration 과 여기가 같은 이름을 쓰는지 테스트가 지킨다. */
export const SCORING_RPC = {
  list: 'list_scoring_formulas',
  setStatus: 'set_scoring_formula_status',
} as const;
