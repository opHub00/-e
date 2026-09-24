import type { Answers, Question } from './questions.ts';

/**
 * 카테고리 마법사.
 *
 * 질문을 고르는 일은 questions.ts 가 그대로 맡는다. 이 파일은 그 결과를 다섯 단계로 묶기만 한다.
 * 그래서 조건부 노출(앞선 답에 따라 질문이 늘거나 주는 것)은 단계 안에서 저절로 일어난다.
 */
export const CATEGORIES = ['기본정보', '주거·주택이력', '청약', '소득·자산', '확인'] as const;
export type Category = typeof CATEGORIES[number];

/** 질문의 기존 section 을 단계로 접는다. 질문 정의는 건드리지 않는다. */
const CATEGORY_BY_SECTION: Record<string, Category> = {
  기본: '기본정보',
  가족: '기본정보',
  거주: '주거·주택이력',
  주택: '주거·주택이력',
  청약통장: '청약',
  소득: '소득·자산',
  자산: '소득·자산',
  '공고 확인': '확인',
};

export const categoryOf = (question: Question): Category => CATEGORY_BY_SECTION[question.section] ?? '확인';

export type CategoryStep = { category: Category; questions: Question[]; answered: number; total: number };

const isAnswered = (answers: Answers, id: string) => (answers[id] ?? '').trim() !== '';

/**
 * 지금 보여줄 단계들. 질문이 하나도 없는 단계는 빼고, 마지막 확인 단계는 질문이 없어도 남긴다
 * (요약·누락 확인·판정 실행이 그 화면에 있기 때문이다).
 */
export function buildSteps(questions: Question[], answers: Answers): CategoryStep[] {
  const grouped = new Map<Category, Question[]>();
  for (const question of questions) {
    const category = categoryOf(question);
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category)!.push(question);
  }
  const steps: CategoryStep[] = [];
  for (const category of CATEGORIES) {
    const list = grouped.get(category) ?? [];
    if (!list.length && category !== '확인') continue;
    steps.push({ category, questions: list, total: list.length, answered: list.filter(q => isAnswered(answers, q.id)).length });
  }
  return steps;
}

/**
 * 이어서 할 단계. 아직 다 채우지 않은 첫 단계로 보낸다.
 * 저장된 draft 의 옛 index(질문 번호)는 쓰지 않는다. 답변만으로 다시 계산한다.
 */
export function firstIncompleteStep(steps: CategoryStep[]): number {
  const index = steps.findIndex(step => step.total > 0 && step.answered < step.total);
  return index === -1 ? Math.max(steps.length - 1, 0) : index;
}
