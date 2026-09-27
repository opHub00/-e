import type { ScoringBand, ScoringFormula, ScoringStatus, ScoringTestCase } from './domain.ts';
import { runTestCases, validateFormula } from './domain.ts';

/**
 * 산식 초안.
 *
 * 운영 DB 표가 아직 없다. 그래서 편집 결과를 **이 브라우저에만** 둔다.
 * 파일(배포본)은 건드리지 않으므로, 화면에서 고친 것이 사용자에게 새어 나가지 않는다.
 * 대신 화면은 "초안이라 서비스에 반영되지 않았다"는 사실을 늘 함께 보여줘야 한다.
 *
 * 저장소가 생기면 이 파일의 자리에 repository 가 들어가고, 화면은 그대로 둘 수 있다.
 */
export const SCORING_DRAFT_KEY = 'wanpane.admin.scoringDrafts.v1';

type Storage = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };

const memory = new Map<string, string>();
/** 브라우저 저장소가 막혀 있어도 화면이 죽지 않게, 같은 모양의 대체 저장소를 쓴다. */
const fallback: Storage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => { memory.set(key, value); },
};

function storage(): Storage {
  try {
    const candidate = (globalThis as { localStorage?: Storage }).localStorage;
    if (!candidate) return fallback;
    candidate.getItem(SCORING_DRAFT_KEY);
    return candidate;
  } catch { return fallback; }
}

export function readDrafts(): Record<string, ScoringFormula> {
  try {
    const raw = storage().getItem(SCORING_DRAFT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ScoringFormula>;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch { return {}; }
}

export function writeDraft(formula: ScoringFormula): void {
  try {
    const drafts = readDrafts();
    drafts[formula.id] = formula;
    storage().setItem(SCORING_DRAFT_KEY, JSON.stringify(drafts));
  } catch { /* 저장하지 못해도 화면은 계속 돈다. 화면이 초안 여부를 다시 읽어 알린다. */ }
}

export function clearDraft(id: string): void {
  try {
    const drafts = readDrafts();
    delete drafts[id];
    storage().setItem(SCORING_DRAFT_KEY, JSON.stringify(drafts));
  } catch { /* 위와 같다 */ }
}

/** 배포본 위에 초안을 덮어 준다. 초안이 없으면 배포본 그대로. */
export function withDraft(formula: ScoringFormula): { formula: ScoringFormula; isDraft: boolean } {
  const draft = readDrafts()[formula.id];
  return draft ? { formula: draft, isDraft: true } : { formula, isDraft: false };
}

const stamp = (formula: ScoringFormula, summary: string): ScoringFormula => ({
  ...formula,
  updatedAt: new Date().toISOString().slice(0, 10),
  history: [...formula.history, { at: new Date().toISOString().slice(0, 10), actor: '관리자(초안)', summary }],
});

/** 구간 한 줄을 고친다. 표에서 누르는 자리 그대로. */
export function editBand(formula: ScoringFormula, componentId: string, index: number, patch: Partial<ScoringBand>): ScoringFormula {
  return stamp({
    ...formula,
    components: formula.components.map(component => component.id !== componentId ? component : {
      ...component,
      bands: component.bands.map((band, position) => position === index ? { ...band, ...patch } : band),
    }),
  }, `${componentId} 구간을 고쳤어요.`);
}

export function addBand(formula: ScoringFormula, componentId: string): ScoringFormula {
  return stamp({
    ...formula,
    components: formula.components.map(component => component.id !== componentId ? component : {
      ...component,
      // 새 구간은 마지막 구간 다음부터 시작한다. 운영자가 숫자를 처음부터 적지 않아도 되게.
      bands: [...component.bands, {
        min: Math.max(0, ...component.bands.map(band => (band.max ?? band.min ?? 0) + 1)),
        points: 0,
        label: '새 구간',
      }],
    }),
  }, `${componentId} 에 구간을 더했어요.`);
}

export function removeBand(formula: ScoringFormula, componentId: string, index: number): ScoringFormula {
  return stamp({
    ...formula,
    components: formula.components.map(component => component.id !== componentId ? component : {
      ...component,
      bands: component.bands.filter((_, position) => position !== index),
    }),
  }, `${componentId} 의 구간 하나를 지웠어요.`);
}

export function upsertTestCase(formula: ScoringFormula, testCase: ScoringTestCase): ScoringFormula {
  const exists = formula.testCases.some(item => item.id === testCase.id);
  return stamp({
    ...formula,
    testCases: exists
      ? formula.testCases.map(item => item.id === testCase.id ? testCase : item)
      : [...formula.testCases, testCase],
  }, exists ? `예시 '${testCase.label}' 를 고쳤어요.` : `예시 '${testCase.label}' 를 더했어요.`);
}

export function removeTestCase(formula: ScoringFormula, id: string): ScoringFormula {
  return stamp({ ...formula, testCases: formula.testCases.filter(item => item.id !== id) }, '예시 하나를 지웠어요.');
}

/** 상태를 옮긴다. 활성으로 가는 길만 따로 막는다(`activationCheck` 참고). */
export function setStatus(formula: ScoringFormula, status: ScoringStatus): ScoringFormula {
  return stamp({ ...formula, status }, `상태를 ${status} 로 바꿨어요.`);
}

export function setPublished(formula: ScoringFormula, publishedToUsers: boolean): ScoringFormula {
  return stamp({ ...formula, publishedToUsers }, publishedToUsers ? '사용자에게 공개하기로 했어요.' : '사용자 공개를 껐어요.');
}

export type ActivationCheck = { key: string; label: string; passed: boolean; detail: string };

/**
 * 활성화 전에 통과해야 하는 검사.
 *
 * 운영자가 실수로 서비스에 잘못된 배점을 올리는 것을 막는 유일한 관문이다.
 * 하나라도 실패하면 활성으로 옮기지 않는다.
 */
export function activationChecks(formula: ScoringFormula): ActivationCheck[] {
  const problems = validateFormula(formula);
  const runs = runTestCases(formula);
  const has = (pattern: RegExp) => problems.filter(problem => pattern.test(problem.message));

  const overlap = has(/겹쳐/);
  const gap = has(/빈틈/);
  const negative = has(/0 이상/);
  const basics = problems.filter(problem =>
    !/겹쳐|빈틈|0 이상/.test(problem.message));
  const componentTotals = formula.components.map(component =>
    `${component.label} ${component.bands.reduce((best, band) => Math.max(best, band.points), 0)}점`);

  return [
    {
      key: 'basics', label: '기본 정보', passed: basics.length === 0,
      detail: basics.length ? basics.map(problem => problem.message).join(' ') : '이름·적용 대상·근거가 모두 적혀 있어요.',
    },
    {
      key: 'overlap', label: '구간 겹침', passed: overlap.length === 0,
      detail: overlap.length ? overlap.map(problem => problem.message).join(' ') : '같은 값이 두 구간에 걸치지 않아요.',
    },
    {
      key: 'gap', label: '구간 빈틈', passed: gap.length === 0,
      detail: gap.length ? gap.map(problem => problem.message).join(' ') : '구간이 빠짐없이 이어져 있어요.',
    },
    {
      key: 'negative', label: '음수 점수', passed: negative.length === 0,
      detail: negative.length ? negative.map(problem => problem.message).join(' ') : '모든 구간 점수가 0 이상이에요.',
    },
    {
      key: 'max', label: '항목별 만점', passed: formula.components.every(component => component.bands.length > 0),
      detail: componentTotals.length ? componentTotals.join(' · ') : '배점 항목이 없어요.',
    },
    {
      key: 'tests', label: '저장된 예시', passed: runs.length > 0 && runs.every(run => run.passed),
      detail: runs.length === 0
        ? '예시가 하나도 없어요. 활성화 전에 최소 한 개는 있어야 해요.'
        : `${runs.filter(run => run.passed).length} / ${runs.length}개 통과`,
    },
  ];
}

export const canActivate = (formula: ScoringFormula): boolean =>
  activationChecks(formula).every(check => check.passed);
