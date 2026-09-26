/**
 * 청약가점 계산식.
 *
 * 운영자가 "로직"이 아니라 **배점 규칙**으로 다룰 수 있게 모양을 잡았다.
 * 항목(무주택 기간·부양가족 수·통장 가입기간 …)마다 구간 표가 있고, 구간마다 점수와 설명이 붙는다.
 * 계산은 구간을 찾아 점수를 더하는 것뿐이고, 그 이상은 하지 않는다.
 *
 * 구간의 생김새(`min`/`max`/`points`)는 판정 엔진의 ScoreRule.bands 와 같다.
 * 나중에 이 산식을 공고 규칙에 얹을 때 형태를 바꾸지 않아도 되도록 일부러 맞춰 두었다.
 * 지금은 엔진을 건드리지 않는다. 엔진은 공고에서 읽은 배점표로만 계산한다.
 */
import type { SupplyType } from '../applicationAssessment/types.ts';

/** 산식이 지금 어디까지 왔는가. 활성만 서비스에 쓸 수 있다. */
export type ScoringStatus = 'DRAFT' | 'REVIEW' | 'ACTIVE' | 'SUSPENDED';

export const SCORING_STATUS_LABEL: Record<ScoringStatus, string> = {
  DRAFT: '초안',
  REVIEW: '검토 중',
  ACTIVE: '활성',
  SUSPENDED: '중지',
};

/** 어떤 공급에 쓰는 산식인가. 엔진의 공급 유형과 "민영 일반공급"을 함께 담는다. */
export type ScoringTarget = SupplyType | 'generalPrivate' | 'generalPublic';

export const SCORING_TARGET_LABEL: Record<ScoringTarget, string> = {
  generalPrivate: '민영주택 일반공급',
  generalPublic: '국민주택 일반공급',
  youth: '청년 특별공급',
  newlywed: '신혼부부 특별공급',
  firstHome: '생애최초 특별공급',
};

/** 한 구간. 경계는 양끝을 포함한다(min 이상 max 이하). */
export type ScoringBand = {
  /** 비어 있으면 아래쪽이 열려 있다. */
  min?: number;
  /** 비어 있으면 위쪽이 열려 있다. */
  max?: number;
  points: number;
  /** 운영자가 표에서 그대로 읽을 설명. 예: "1년 이상 2년 미만". */
  label: string;
  note?: string;
};

export type ScoringComponent = {
  id: string;
  /** 화면에 쓰는 이름. 예: 무주택 기간. */
  label: string;
  /** 무엇을 입력하는 값인지 한 줄 설명. */
  description: string;
  /** 입력값의 단위. 화면과 시뮬레이터가 그대로 쓴다. */
  unit: string;
  /** 판정 엔진과 맞추기 위한 입력 이름. 예: noHomeMonths. */
  fact: string;
  bands: ScoringBand[];
  /** 표시 순서. 작은 값이 위로. */
  order: number;
};

/** 총점을 사람 말로 옮기는 구간. */
export type ScoringInterpretation = {
  /** 이 점수 이상일 때 이 문구를 쓴다. */
  minTotal: number;
  headline: string;
  detail: string;
};

export type ScoringTestCase = {
  id: string;
  label: string;
  /** component.id → 입력값 */
  inputs: Record<string, number>;
  expectedTotal: number;
};

export type ScoringFormula = {
  id: string;
  name: string;
  description: string;
  targets: ScoringTarget[];
  version: string;
  status: ScoringStatus;
  /** 서비스 화면에 이 산식의 해석을 내보낼지. 활성이어도 이 값이 false 면 내부용이다. */
  publishedToUsers: boolean;
  /** 어디서 온 기준인지. 근거 없는 산식을 만들지 않기 위해 반드시 적는다. */
  legalBasis: string;
  components: ScoringComponent[];
  interpretations: ScoringInterpretation[];
  testCases: ScoringTestCase[];
  /** 누가 언제 무엇을 바꿨는지. 오래된 것이 앞에 온다. */
  history: { at: string; actor: string; summary: string }[];
  updatedAt: string;
};

/** 항목 하나가 줄 수 있는 가장 큰 점수. */
export const componentMax = (component: ScoringComponent): number =>
  component.bands.reduce((best, band) => Math.max(best, band.points), 0);

/** 산식 전체의 만점. */
export const formulaMax = (formula: ScoringFormula): number =>
  formula.components.reduce((sum, component) => sum + componentMax(component), 0);

/** 값이 어느 구간에 드는지. 겹치거나 빈 구간이면 null 이고, 계산은 그 사실을 그대로 알린다. */
export function matchBand(component: ScoringComponent, value: number): ScoringBand | null {
  const hits = component.bands.filter(band =>
    (band.min === undefined || value >= band.min) && (band.max === undefined || value <= band.max));
  return hits.length === 1 ? hits[0] : null;
}

export type ScoringBreakdown = {
  componentId: string;
  label: string;
  input: number | null;
  points: number | null;
  max: number;
  bandLabel: string | null;
  /** 점수를 낼 수 없으면 왜 그런지. */
  problem: string | null;
};

export type ScoringResult = {
  total: number | null;
  max: number;
  breakdown: ScoringBreakdown[];
  /** 총점을 낼 수 없게 만든 항목들. 비어 있으면 total 이 채워진다. */
  problems: string[];
  interpretation: ScoringInterpretation | null;
};

/**
 * 점수를 낸다.
 *
 * 값이 없거나 구간이 겹쳐 고를 수 없으면 그 항목만 비우고 총점을 내지 않는다.
 * 모르는 값을 0 점으로 세면 운영자와 사용자 모두에게 거짓말이 된다.
 */
export function calculateScore(formula: ScoringFormula, inputs: Record<string, number | null>): ScoringResult {
  const breakdown: ScoringBreakdown[] = [];
  const problems: string[] = [];
  for (const component of [...formula.components].sort((left, right) => left.order - right.order)) {
    const max = componentMax(component);
    const value = inputs[component.id];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      breakdown.push({ componentId: component.id, label: component.label, input: null, points: null, max, bandLabel: null, problem: '값이 아직 없어요.' });
      problems.push(`${component.label}: 값이 아직 없어요.`);
      continue;
    }
    const band = matchBand(component, value);
    if (!band) {
      const problem = component.bands.some(item => (item.min === undefined || value >= item.min) && (item.max === undefined || value <= item.max))
        ? '구간이 겹쳐 점수를 하나로 고를 수 없어요.'
        : '어느 구간에도 들지 않아요.';
      breakdown.push({ componentId: component.id, label: component.label, input: value, points: null, max, bandLabel: null, problem });
      problems.push(`${component.label}: ${problem}`);
      continue;
    }
    breakdown.push({ componentId: component.id, label: component.label, input: value, points: band.points, max, bandLabel: band.label, problem: null });
  }
  const total = problems.length ? null : breakdown.reduce((sum, item) => sum + (item.points ?? 0), 0);
  return {
    total,
    max: formulaMax(formula),
    breakdown,
    problems,
    interpretation: total === null ? null : interpretationFor(formula, total),
  };
}

/** 총점에 맞는 해석 문구. 없으면 null 이고 화면은 문구를 지어내지 않는다. */
export function interpretationFor(formula: ScoringFormula, total: number): ScoringInterpretation | null {
  return [...formula.interpretations]
    .sort((left, right) => right.minTotal - left.minTotal)
    .find(item => total >= item.minTotal) ?? null;
}

export type FormulaProblem = { componentId: string | null; message: string };

/**
 * 저장하기 전에 표가 말이 되는지 본다.
 *
 * 운영자가 구간을 손으로 고치다 보면 빈틈과 겹침이 생긴다.
 * 그대로 두면 어떤 사용자는 점수가 안 나오고 어떤 사용자는 두 점수를 받는다.
 */
export function validateFormula(formula: ScoringFormula): FormulaProblem[] {
  const problems: FormulaProblem[] = [];
  if (!formula.name.trim()) problems.push({ componentId: null, message: '산식 이름을 적어 주세요.' });
  if (!formula.targets.length) problems.push({ componentId: null, message: '어떤 공급에 쓰는 산식인지 골라 주세요.' });
  if (!formula.legalBasis.trim()) problems.push({ componentId: null, message: '기준이 된 근거를 적어 주세요.' });
  if (!formula.components.length) problems.push({ componentId: null, message: '배점 항목이 하나도 없어요.' });

  for (const component of formula.components) {
    if (!component.bands.length) {
      problems.push({ componentId: component.id, message: `${component.label}: 구간이 하나도 없어요.` });
      continue;
    }
    for (const band of component.bands) {
      if (!Number.isFinite(band.points) || band.points < 0) {
        problems.push({ componentId: component.id, message: `${component.label}: 점수는 0 이상이어야 해요.` });
      }
      if (band.min !== undefined && band.max !== undefined && band.min > band.max) {
        problems.push({ componentId: component.id, message: `${component.label}: 구간의 시작이 끝보다 커요(${band.label}).` });
      }
    }
    // 구간을 시작값 순으로 세우고, 앞 구간의 끝과 다음 구간의 시작이 맞닿는지 본다.
    const sorted = [...component.bands].sort((left, right) => (left.min ?? -Infinity) - (right.min ?? -Infinity));
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (previous.max === undefined) {
        problems.push({ componentId: component.id, message: `${component.label}: 끝이 열린 구간(${previous.label}) 뒤에 다른 구간이 있어요.` });
        continue;
      }
      if (current.min === undefined) continue;
      if (current.min <= previous.max) {
        problems.push({ componentId: component.id, message: `${component.label}: 구간이 겹쳐요(${previous.label} ↔ ${current.label}).` });
      } else if (current.min > previous.max + 1) {
        problems.push({ componentId: component.id, message: `${component.label}: 구간 사이에 빈틈이 있어요(${previous.label} ↔ ${current.label}).` });
      }
    }
  }

  const seen = new Set<number>();
  for (const item of formula.interpretations) {
    if (seen.has(item.minTotal)) problems.push({ componentId: null, message: `해석 문구의 기준 점수 ${item.minTotal}점이 두 번 있어요.` });
    seen.add(item.minTotal);
  }
  return problems;
}

export type TestCaseRun = {
  testCase: ScoringTestCase;
  actualTotal: number | null;
  passed: boolean;
  problems: string[];
};

/** 저장해 둔 예시를 한 번에 돌려 본다. 산식을 고친 뒤 무엇이 달라졌는지 바로 보이게. */
export function runTestCases(formula: ScoringFormula): TestCaseRun[] {
  return formula.testCases.map(testCase => {
    const result = calculateScore(formula, testCase.inputs);
    return {
      testCase,
      actualTotal: result.total,
      passed: result.total === testCase.expectedTotal,
      problems: result.problems,
    };
  });
}

export type FormulaSummary = {
  id: string;
  name: string;
  targets: string;
  version: string;
  status: ScoringStatus;
  publishedToUsers: boolean;
  componentCount: number;
  maxScore: number;
  testsPassed: number;
  testsTotal: number;
  problemCount: number;
  updatedAt: string;
};

export function summarizeFormula(formula: ScoringFormula): FormulaSummary {
  const runs = runTestCases(formula);
  return {
    id: formula.id,
    name: formula.name,
    targets: formula.targets.map(target => SCORING_TARGET_LABEL[target]).join(', '),
    version: formula.version,
    status: formula.status,
    publishedToUsers: formula.publishedToUsers,
    componentCount: formula.components.length,
    maxScore: formulaMax(formula),
    testsPassed: runs.filter(run => run.passed).length,
    testsTotal: runs.length,
    problemCount: validateFormula(formula).length,
    updatedAt: formula.updatedAt,
  };
}

/**
 * 서비스에 쓸 수 있는 산식인가.
 *
 * 활성이고, 표에 문제가 없고, 저장된 예시가 전부 맞아야 한다.
 * 셋 중 하나라도 어긋나면 사용자 화면에 내보내지 않는다.
 */
export function isServiceReady(formula: ScoringFormula): boolean {
  return formula.status === 'ACTIVE'
    && validateFormula(formula).length === 0
    && runTestCases(formula).every(run => run.passed);
}

/** 사용자 화면이 실제로 쓸 산식. 없으면 null 이고, 화면은 점수를 말하지 않는다. */
export function publishedFormulaFor(formulas: ScoringFormula[], target: ScoringTarget): ScoringFormula | null {
  return formulas.find(formula =>
    formula.targets.includes(target) && formula.publishedToUsers && isServiceReady(formula)) ?? null;
}
