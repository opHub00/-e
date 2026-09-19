import type { RuleListItemDto } from '../server/dto.ts';
import type {
  ActivationGate, CriticalBlockerCode, EvidenceReviewStatus, ExceptionReviewStatus,
  RuleReviewRecord, RuleReviewStatus, RuleReviewWorkspace,
} from '../server/types.ts';
import type { ExceptionRelationType } from '../../ruleExtraction/server/v4_1/exceptionRelations.ts';
import type { RuleSourceStatus } from '../../applicationAssessment/types.ts';

/** Internal enums stay out of the console copy; the badge carries the meaning. */
export const PRIORITY_LABEL: Record<RuleListItemDto['priority'], string> = {
  CRITICAL_BLOCKER: '반드시 확인', REVIEW_REQUIRED: '확인 권장', NORMAL: '근거 명확',
};
export const REVIEW_STATUS_LABEL: Record<RuleReviewStatus, string> = {
  PENDING_REVIEW: '검수 대기', IN_REVIEW: '검수 중', APPROVED: '승인',
  APPROVED_WITH_EDIT: '수정 후 승인', HELD: '보류', REJECTED: '제외',
};
export const SOURCE_STATUS_LABEL: Record<RuleSourceStatus, string> = {
  REFERENCE: '원문 확인 전', DRAFT_SOURCE_VERIFIED: '검토본 기준', OFFICIAL_VERIFIED: '공식 공고 기준',
};
export const EVIDENCE_STATUS_LABEL: Record<EvidenceReviewStatus, string> = {
  VALID: '근거 유효', INVALID: '근거 무효', REPLACED: '근거 교체됨', NEEDS_REVIEW: '근거 확인 필요',
};
export const EXCEPTION_STATUS_LABEL: Record<ExceptionReviewStatus, string> = {
  LINKED: '기본 규칙에 연결됨', INDEPENDENT: '독립 예외', EXCLUDED: '제외됨',
  HELD: '보류', ORPHAN_EXCEPTION: '연결된 기본 규칙 없음', WRONG_RELATION: '관계 지정 오류',
};
export const RELATION_LABEL: Record<ExceptionRelationType, string> = {
  LIMITED_BY: '이 규칙을 제한함', EXEMPTED_BY: '이 규칙의 적용을 면제함',
  OVERRIDDEN_BY: '이 규칙을 대체함', QUALIFIED_BY: '이 규칙에 단서를 붙임',
  APPLIES_ONLY_IF: '이 조건에서만 적용됨',
};
export const SUPPLY_GROUP_LABEL: Record<string, string> = {
  common: '공통조건', youth: '청년', newlywed: '신혼부부', firstHome: '생애최초', exception: '특례',
};
/** Exceptions read as their own group; a reviewer looks for them as a set. */
export const supplyGroupOf = (item: RuleListItemDto) => item.category === 'EXCEPTION' ? 'exception' : item.supplyType;

const BLOCKER_SENTENCE: Record<CriticalBlockerCode, string> = {
  CONFLICT: '같은 개념에 서로 다른 기준이 연결돼 있어요. 충돌을 먼저 해결해 주세요.',
  UNRESOLVED: '공고에서 확정되지 않은 항목이 남아 있어요.',
  ORPHAN_EXCEPTION: '이 예외가 어떤 기본 규칙을 한정하는지 연결되지 않았어요.',
  MISSING_CRITICAL_RULE: '필수 category의 규칙이 아직 승인되지 않았어요.',
  SEMANTIC_EVIDENCE_MISMATCH: '인용한 근거가 이 규칙의 의미를 뒷받침하지 않아요. 원문을 다시 대조해 주세요.',
  CRITICAL_SCORE_VIOLATION: '배점이 공고의 배점표와 맞지 않아요.',
  PARTIAL_RANGE_BINDING: '구간의 한쪽 경계만 연결돼 있어요. 상한과 하한을 모두 확인해 주세요.',
  SCOPE_MISMATCH: '적용 대상(본인·세대·배우자)이 원문과 다를 수 있어요.',
  HIGH_CRITICAL_ERROR: '추출 단계에서 치명적 오류로 표시된 규칙이에요.',
};

/**
 * Why the console will not offer approval yet.
 *
 * These read the same workspace facts the service enforces on, so the button never
 * promises something `approveRule` would refuse. The service stays the authority:
 * if it still refuses, the console surfaces its error instead of hiding it.
 */
export function approvalBlockReasons(rule: RuleReviewRecord, workspace: RuleReviewWorkspace, gate: ActivationGate): string[] {
  const reasons: string[] = [];
  for (const code of rule.safetyBlockers.filter(item => !rule.resolvedBlockerCodes.includes(item))) reasons.push(BLOCKER_SENTENCE[code]);
  if (rule.critical && !rule.evidenceReviews.some(item => item.status === 'VALID' || item.status === 'REPLACED')) {
    reasons.push('critical 규칙은 유효한 근거를 하나 이상 확인해야 승인할 수 있어요. 아래 근거를 먼저 검토해 주세요.');
  }
  if (workspace.conflicts.some(item => item.candidateRuleIds.includes(rule.ruleId) && (!item.resolution || item.resolution.type === 'HELD'))) {
    reasons.push(BLOCKER_SENTENCE.CONFLICT);
  }
  if (workspace.exceptionReviews.some(item => item.exceptionRuleId === rule.ruleId && (item.status === 'ORPHAN_EXCEPTION' || item.status === 'WRONG_RELATION'))) {
    reasons.push(BLOCKER_SENTENCE.ORPHAN_EXCEPTION);
  }
  for (const blocker of gate.blockers.filter(item => item.ruleId === rule.ruleId && item.code in BLOCKER_SENTENCE)) {
    const sentence = BLOCKER_SENTENCE[blocker.code as CriticalBlockerCode];
    if (!reasons.includes(sentence)) reasons.push(sentence);
  }
  return [...new Set(reasons)];
}

/** Audit entries become one readable line each; raw before/after JSON is never shown. */
export function historyLine(action: string): string {
  return ({
    START_REVIEW: '검수 시작', APPROVE_RULE: '승인', APPROVE_RULE_WITH_EDIT: '수정 후 승인',
    HOLD_RULE: '보류', REJECT_RULE: '제외', REVIEW_EVIDENCE: '근거 검토',
    RESOLVE_CONFLICT: '충돌 해결', RESOLVE_UNRESOLVED: '미해결 항목 처리', REVIEW_EXCEPTION: '예외 관계 검토',
    BULK_APPROVE_SAFE: '근거 명확 일괄 승인', DOCUMENT_INVALIDATED: '문서 변경 감지', COMPLETE_REVIEW: '검수 완료',
  } as Record<string, string>)[action] ?? action;
}
