import type { ApplicantProfileV2 } from '../../profile/domain.ts';
import { knownField, withApplicantBirthDate } from '../../profile/domain.ts';
import { parseForm } from '../form.ts';
import type { AssessmentInput, SupplyType } from '../types.ts';
import { normalizeDateInput } from './dateInput.ts';
import type { Answers, Question } from './questions.ts';

/**
 * questionnaire → 기존 판정 입력.
 *
 * UI가 받은 값을 canonical 형식으로 맞춘 뒤, 기존 parseForm 을 그대로 통과시킨다.
 * 엔진에 들어가는 details 는 예전 화면과 같은 방법으로 만들어지므로 결과도 같다.
 */
export type NormalizedAnswers = { raw: Answers; errors: Record<string, string> };

const DATE_KINDS = new Set(['date', 'dateList']);

export function normalizeAnswers(questions: Question[], answers: Answers, bounds?: { notAfter?: string; notAfterLabel?: string }): NormalizedAnswers {
  const raw: Answers = {};
  const errors: Record<string, string> = {};
  const byId = new Map(questions.map(question => [question.id, question]));
  for (const [id, value] of Object.entries(answers)) {
    const text = (value ?? '').trim();
    const question = byId.get(id);
    if (!text) continue;
    // 지금 묻지 않는 질문의 답은 판정에 넣지 않는다(앞선 답이 바뀌어 필요 없어진 값).
    if (!question) continue;
    if (!DATE_KINDS.has(question.kind)) { raw[id] = text; continue; }
    if (question.kind === 'dateList' && ['없음', '없어요', '0'].includes(text)) { raw[id] = '없음'; continue; }
    const parts = question.kind === 'dateList' ? text.split(',').map(part => part.trim()).filter(Boolean) : [text];
    const normalized: string[] = [];
    for (const part of parts) {
      const result = normalizeDateInput(part, bounds);
      if (result.status === 'OK') normalized.push(result.value);
      else if (result.status === 'INVALID') { errors[id] = result.message; break; }
    }
    if (!errors[id] && normalized.length) raw[id] = normalized.join(', ');
  }
  return { raw, errors };
}

/** 정규화한 답변을 기존 엔진 입력으로. parseForm 계약은 그대로 쓴다. */
export function assessmentDetails(questions: Question[], answers: Answers, supply: SupplyType, bounds?: { notAfter?: string; notAfterLabel?: string }):
{ details: AssessmentInput['details']; errors: Record<string, string> } {
  const normalized = normalizeAnswers(questions, answers, bounds);
  const parsed = parseForm(normalized.raw, supply);
  const errors = { ...normalized.errors };
  // parseForm 이 남긴 형식 오류도 질문별로 되돌려 붙인다.
  for (const question of questions) {
    if (errors[question.id] || normalized.raw[question.id] === undefined) continue;
    const single = parseForm({ [question.id]: normalized.raw[question.id] }, supply).errors[0];
    if (single) errors[question.id] = single.replace(/^[^:]+:\s*/, '');
  }
  return { details: parsed.details, errors };
}

export type ProfileUpdate = { profile: ApplicantProfileV2; changed: string[] };

/**
 * 오래 쓰는 사용자 정보만 프로필에 옮긴다(생년월일·혼인 여부·통장 보유·자녀).
 * 공고별로만 의미가 있는 답(소득, 자산, 거주 시작일 등)은 프로필에 쓰지 않는다.
 */
export function profileUpdatesFromAnswers(profile: ApplicantProfileV2, answers: Answers, asOf: string): ProfileUpdate {
  let next = profile;
  const changed: string[] = [];
  const birth = normalizeDateInput(answers.birthDate);
  if (birth.status === 'OK' && (profile.basic.birthDate.status !== 'known' || profile.basic.birthDate.value !== birth.value)) {
    next = withApplicantBirthDate(next, birth.value, asOf);
    changed.push('생년월일');
  }
  const family = answers.familyCategory;
  const marriageStatus = family === 'married' ? 'married' : family === 'engaged' || family === 'singleParent' ? 'single' : undefined;
  if (marriageStatus && next.family.marriageStatus.status !== 'known') {
    next = { ...next, family: { ...next.family, marriageStatus: knownField(marriageStatus) } };
    changed.push('혼인 여부');
  }
  if ((answers.hasAccount === 'yes' || answers.hasAccount === 'no') && next.subscriptionAccount.hasAccount.status !== 'known') {
    next = { ...next, subscriptionAccount: { ...next.subscriptionAccount, hasAccount: knownField(answers.hasAccount === 'yes') } };
    changed.push('청약통장 보유');
  }
  const children = childrenFromAnswer(answers.children);
  if (children && next.family.childrenCount.status !== 'known') {
    next = { ...next, family: { ...next.family, childrenCount: knownField(children.count), childBirthYears: knownField(children.years) } };
    changed.push('자녀 정보');
  }
  return { profile: next, changed };
}

function childrenFromAnswer(value: string | undefined): { count: number; years: number[] } | null {
  const text = (value ?? '').trim();
  if (!text) return null;
  if (['없음', '없어요', '0'].includes(text)) return { count: 0, years: [] };
  const years: number[] = [];
  for (const part of text.split(',').map(item => item.trim()).filter(Boolean)) {
    const result = normalizeDateInput(part);
    if (result.status !== 'OK') return null;
    years.push(Number(result.value.slice(0, 4)));
  }
  return years.length ? { count: years.length, years } : null;
}
