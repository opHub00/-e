import type { ScoringFormula } from './domain.ts';
import stored from '../../data/scoring-formulas/formulas.json' with { type: 'json' };

/**
 * 등록된 가점 계산식.
 *
 * 운영 저장소 seed와 로컬 테스트 repository가 공유하는 결정적 원본이다.
 * 관리자 화면은 이 파일이나 브라우저 저장소를 직접 수정하지 않고 ScoringFormulaRepository만 사용한다.
 */
export function loadFormulas(): ScoringFormula[] {
  return (stored as { formulas: ScoringFormula[] }).formulas;
}

export function scoringFormula(id: string): ScoringFormula | undefined {
  return loadFormulas().find(formula => formula.id === id);
}
