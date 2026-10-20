import type { AnswerStateMap } from '../questionPolicy.ts';
import { buildSamdoResolutionCenter, type SamdoResolutionState } from '../samdoResult/samdoRefinement.ts';
import type { SamdoSupplyType } from '../samdo/types.ts';
import type { SamdoDistrictId, SamdoDualAssessment } from './types.ts';

export type SamdoUnresolvedAssessmentFact = {
  /** Internal deduplication id. It is removed at the browser/server presentation boundary. */
  factKey: string;
  label: string;
  state: SamdoResolutionState;
  districts: SamdoDistrictId[];
  affectedSupplyTypes: SamdoSupplyType[];
  affectedSupplyLabels: string[];
  userFacingQuestion: string;
  reason: string;
  evidenceNeeded: string;
};

const statePriority: Record<SamdoResolutionState, number> = {
  DOES_NOT_KNOW: 4,
  EVIDENCE_REQUIRED: 3,
  CONDITIONAL: 2,
  UNKNOWN: 1,
};

const questionFor = (label: string, kind: 'NUMBER' | 'DATE' | 'BOOLEAN'): string => {
  if (kind === 'DATE') return `${label}의 정확한 날짜를 확인할 수 있나요?`;
  if (kind === 'NUMBER') return `${label}을(를) 확인해 입력할 수 있나요?`;
  return `${label}을(를) 확인할 수 있나요?`;
};

/**
 * Converts unresolved engine facts into a deduplicated, user-answerable list.
 * The factKey remains internal; buildSamdoDualChatContext deliberately drops it.
 */
export function getUnresolvedAssessmentFacts(
  assessment: SamdoDualAssessment,
  answerStates: AnswerStateMap = {},
): SamdoUnresolvedAssessmentFact[] {
  const merged = new Map<string, SamdoUnresolvedAssessmentFact>();
  for (const district of assessment.districts) {
    for (const item of buildSamdoResolutionCenter(district.recommendation, answerStates)) {
      // The rule's childbirth REVIEW can remain after an exact DOB was entered.
      // It asks for documentary verification of the exception, not the date again.
      const knownChildDate = item.id === 'childBirthDate' && item.currentState === 'EVIDENCE_REQUIRED'
        && answerStates['household.childBirthDates.0'] === 'ANSWERED';
      const label = knownChildDate ? '출산특례·자녀 관계 증빙' : item.label;
      const reason = knownChildDate
        ? '자녀 생년월일은 입력됐지만 출산특례 적용과 가족관계는 서류 확인이 필요해요.'
        : item.reason;
      const evidenceNeeded = knownChildDate
        ? '가족관계증명서와 출산특례 적용 여부를 공고문 기준으로 확인해 주세요.'
        : item.help;
      const current = merged.get(item.id);
      if (!current) {
        merged.set(item.id, {
          factKey: item.id,
          label,
          state: item.currentState,
          districts: [district.district.id],
          affectedSupplyTypes: [...item.affectedSupplyTypes],
          affectedSupplyLabels: [...item.affectedSupplyLabels],
          userFacingQuestion: knownChildDate ? '출산특례 적용 및 자녀 관계를 증빙할 서류를 확인했나요?' : questionFor(label, item.inputKind),
          reason,
          evidenceNeeded,
        });
        continue;
      }
      if (!current.districts.includes(district.district.id)) current.districts.push(district.district.id);
      for (const type of item.affectedSupplyTypes) if (!current.affectedSupplyTypes.includes(type)) current.affectedSupplyTypes.push(type);
      for (const label of item.affectedSupplyLabels) if (!current.affectedSupplyLabels.includes(label)) current.affectedSupplyLabels.push(label);
      if (statePriority[item.currentState] > statePriority[current.state]) current.state = item.currentState;
    }
  }
  return [...merged.values()].sort((a, b) => {
    const coverage = b.districts.length * b.affectedSupplyTypes.length - a.districts.length * a.affectedSupplyTypes.length;
    return coverage || statePriority[b.state] - statePriority[a.state] || a.label.localeCompare(b.label, 'ko');
  });
}
