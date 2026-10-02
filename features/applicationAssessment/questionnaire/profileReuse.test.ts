import assert from 'node:assert/strict';
import test from 'node:test';
import { questionsRequiringUserInput, type Question } from './questions.ts';

test('known reusable facts are not asked again in the V3 flow', () => {
  const questions: Question[] = [
    { id: 'birthDate', title: '생년월일', kind: 'date', section: '기본', prefill: { value: '1995-01-01', source: '프로필' } },
    { id: 'exceptions', title: '공고별 예외', kind: 'boolean', section: '예외' },
  ];
  assert.deepEqual(questionsRequiringUserInput(questions, true).map(question => question.id), ['exceptions']);
  assert.deepEqual(questionsRequiringUserInput(questions, false).map(question => question.id), ['birthDate', 'exceptions']);
});
