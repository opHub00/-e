/**
 * Presentation contract for announcement-grounded consultation.
 *
 * The engine lives on another branch. This file is the boundary the UI is built
 * against: only types and pure helpers, no engine, no provider, no DB. Everything
 * the screen renders comes from a `ConsultationTurn`, so swapping the mock for the
 * real engine is one function signature.
 */
import type { Evidence, RuleSourceStatus, Stage, Status, SupplyType } from '../applicationAssessment/types.ts';

export type ConsultationRole = 'user' | 'assistant';

/** What the engine may ask the UI to offer next. `kind` decides how it is rendered. */
export type ConsultationAction =
  | { kind: 'ANSWER'; label: string; questionKey: string; value: string }
  | { kind: 'OPEN_ASSESSMENT'; label: string }
  | { kind: 'OPEN_PROFILE'; label: string }
  | { kind: 'OPEN_PREPARATION'; label: string };

/**
 * A slot the engine still needs. `options` turn a question into chips instead of
 * free text, which is the difference between "답을 입력하세요" and one tap.
 */
export type ConsultationQuestion = {
  key: string;
  prompt: string;
  /** Where the answer would normally live, so the UI can say it already knows. */
  source: 'ANSWER' | 'PROFILE';
  options?: { label: string; value: string }[];
};

/** Compact, deterministic assessment summary. Never a re-implementation of AssessmentResult. */
export type ConsultationAssessment = {
  status: Status;
  supplyType: SupplyType;
  stage: Stage | null;
  scoring: 'AVAILABLE' | 'NOT_APPLICABLE' | 'PENDING';
  score: { total: number; max: number } | null;
  /** Short, already-humanised reasons. The full breakdown stays on the result screen. */
  blocking: string[];
  pending: string[];
};

export type ConsultationTurn = {
  id: string;
  role: ConsultationRole;
  message: string;
  /** Present once the engine has enough to run the deterministic rules. */
  assessment?: ConsultationAssessment;
  suggestedQuestions?: ConsultationQuestion[];
  actions?: ConsultationAction[];
  evidenceRefs?: Evidence[];
  /**
   * The engine could not answer from the rule set. This is a normal outcome,
   * not an error: the UI says what needs checking instead of showing a failure.
   */
  unresolved?: string[];
  /** Facts already known from the profile, so the UI can avoid asking again. */
  reusedProfileFacts?: string[];
};

export type ConsultationSession = {
  announcementTitle: string;
  listingId: string;
  sourceStatus: RuleSourceStatus;
  turns: ConsultationTurn[];
};

/** The engine contract. One call per user message; the UI holds no engine state. */
export type ConsultationEngine = {
  start: (input: { listingId: string; seededFrom?: 'ASSESSMENT_RESULT' }) => Promise<ConsultationSession>;
  ask: (input: { session: ConsultationSession; message: string; answering?: { questionKey: string; value: string } }) => Promise<ConsultationTurn>;
};

export const SOURCE_BADGE: Record<RuleSourceStatus, string> = {
  REFERENCE: '원문 확인 전',
  DRAFT_SOURCE_VERIFIED: '검토본 기준',
  OFFICIAL_VERIFIED: '공식 공고 기준',
};

/** Shown once per session, not on every turn. */
export const SOURCE_FIRST_TURN_NOTE: Partial<Record<RuleSourceStatus, string>> = {
  REFERENCE: '아직 공고 원문을 확인하기 전이에요. 조건을 미리 살펴보는 용도로만 사용해 주세요.',
  DRAFT_SOURCE_VERIFIED: '공고 검토본을 기준으로 답변해요. 최종 공고에서 조건이 바뀔 수 있어요.',
};

export const STATUS_HEADLINE: Record<Status, string> = {
  ELIGIBLE: '신청 가능한 조건이에요',
  INELIGIBLE: '현재 조건으로는 신청하기 어려워요',
  NEEDS_MORE_INFORMATION: '확인할 정보가 더 있어요',
};

/** 생애최초처럼 배점이 없는 유형에서 0점 카드를 만들지 않기 위한 단일 판단 지점. */
export function scoreLabel(assessment: ConsultationAssessment): string {
  if (assessment.scoring === 'NOT_APPLICABLE') return '가점제 아님 · 공급단계/추첨';
  if (assessment.scoring === 'PENDING' || !assessment.score) return '점수 확인 전';
  return `${assessment.score.total} / ${assessment.score.max}점`;
}
