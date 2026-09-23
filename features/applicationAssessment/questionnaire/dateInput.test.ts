import assert from 'node:assert/strict';
import test from 'node:test';
import { ageOnDate, displayDate, formatDateInput, normalizeDateInput } from './dateInput.ts';

test('숫자만 입력해도, 구분자를 섞어도 같은 날짜로 읽는다', () => {
  for (const raw of ['19940705', '1994-07-05', '1994.07.05', '1994/07/05', '1994-7-5', '1994.7.5', ' 19940705 ']) {
    assert.deepEqual(normalizeDateInput(raw), { status: 'OK', value: '1994-07-05' }, raw);
  }
});

test('빈 입력은 오류가 아니라 미입력이다', () => {
  assert.deepEqual(normalizeDateInput(''), { status: 'EMPTY' });
  assert.deepEqual(normalizeDateInput(undefined), { status: 'EMPTY' });
  assert.deepEqual(normalizeDateInput('   '), { status: 'EMPTY' });
});

test('없는 날짜와 형식 오류는 즉시 막는다', () => {
  const cases: [string, RegExp][] = [
    ['1994-02-30', /2월은 28일까지/], ['1994-13-01', /13월은 없어요/], ['1994-00-10', /월은 1~12/],
    ['19940732', /7월은 31일까지/], ['1994', /8자리/], ['199407', /8자리/], ['1994-07-05-06', /8자리/], ['1994070', /8자리/],
    ['abcd', /8자리/], ['1894-07-05', /1900년부터/], ['2199-01-01', /연도를 확인/],
  ];
  for (const [raw, message] of cases) {
    const result = normalizeDateInput(raw);
    assert.equal(result.status, 'INVALID', raw);
    assert.match(result.status === 'INVALID' ? result.message : '', message, raw);
  }
});

test('윤년을 달력대로 판단한다', () => {
  assert.equal(normalizeDateInput('20240229').status, 'OK');
  assert.equal(normalizeDateInput('20230229').status, 'INVALID');
});

test('공고일보다 뒤인 날짜는 그 자리에서 막는다', () => {
  const bounds = { notAfter: '2026-09-11', notAfterLabel: '공고일(2026.09.11.)' };
  assert.equal(normalizeDateInput('20260912', bounds).status, 'INVALID');
  assert.deepEqual(normalizeDateInput('20260911', bounds), { status: 'OK', value: '2026-09-11' });
  const invalid = normalizeDateInput('20260912', bounds);
  assert.match(invalid.status === 'INVALID' ? invalid.message : '', /공고일\(2026.09.11.\) 이전/);
});

test('입력 중에는 자동으로 하이픈을 끼워 보여준다', () => {
  assert.equal(formatDateInput('1994'), '1994');
  assert.equal(formatDateInput('199407'), '1994-07');
  assert.equal(formatDateInput('19940705'), '1994-07-05');
  assert.equal(formatDateInput('1994-07-05'), '1994-07-05');
  assert.equal(formatDateInput('199407051234'), '1994-07-05', '8자리를 넘으면 잘라낸다');
  assert.equal(formatDateInput('1994.7.5'), '1994.7.5', '직접 쓴 구분자는 그대로 둔다');
  assert.equal(formatDateInput('1994/07/05'), '1994/07/05');
  assert.equal(normalizeDateInput(formatDateInput('1994.7.5')).status, 'OK');
  assert.equal(displayDate('1994-07-05'), '1994.07.05');
});

test('만 나이는 기준일로 계산한다. 기기 시계를 쓰지 않는다', () => {
  assert.equal(ageOnDate('1994-07-05', '2026-07-04'), 31);
  assert.equal(ageOnDate('1994-07-05', '2026-07-05'), 32);
  assert.equal(ageOnDate('1994-07-05', undefined), undefined);
  assert.equal(ageOnDate(undefined, '2026-07-05'), undefined);
});
