import type { ScoringFormula } from './domain.ts';
import stored from '../../data/scoring-formulas/formulas.json' with { type: 'json' };

/**
 * 등록된 가점 계산식.
 *
 * 지금은 검수를 거친 파일 하나를 읽는다. 운영 DB 에 표를 만들지 않았기 때문이다.
 * 관리자 화면의 편집은 이 파일을 덮어쓰지 않고 브라우저 초안으로만 남는다(`draftStore`).
 * 그래서 "화면에서 본 것"과 "서비스가 쓰는 것"이 어긋나지 않는다.
 */
export function loadFormulas(): ScoringFormula[] {
  return (stored as { formulas: ScoringFormula[] }).formulas;
}

export function scoringFormula(id: string): ScoringFormula | undefined {
  return loadFormulas().find(formula => formula.id === id);
}
