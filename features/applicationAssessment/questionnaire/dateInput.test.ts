import assert from 'node:assert/strict';
import test from 'node:test';
import { ageOnDate, displayDate, formatDateInput, formatDateListInput, normalizeDateInput } from './dateInput.ts';

/** 한 글자씩 실제로 치는 상황. 화면에 남은 값(하이픈 포함)이 다음 입력의 앞부분이 된다. */
const typeDigits = (text: string) => {
  let shown = '';
  for (const ch of text) shown = formatDateInput(shown + ch);
  return shown;
};

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

test('숫자를 한 글자씩 쳐도 연-월-일이 모두 끊어진다', () => {
  // 회귀: 하이픈을 사용자가 친 구분자로 오해해서 12345678 이 1234-5678 로 멈추던 문제.
  const cases: [string, string][] = [
    ['1', '1'], ['1994', '1994'], ['19940', '1994-0'], ['199407', '1994-07'],
    ['1994070', '1994-07-0'], ['19940705', '1994-07-05'],
    ['12345678', '1234-56-78'], ['19940230', '1994-02-30'], ['19941301', '1994-13-01'],
  ];
  for (const [typed, shown] of cases) {
    assert.equal(typeDigits(typed), shown, `한 글자씩: ${typed}`);
    assert.equal(formatDateInput(typed), shown, `한 번에: ${typed}`);
  }
});

test('형식은 맞춰 주되 없는 날짜는 검증에서 막는다', () => {
  for (const typed of ['19940230', '19941301']) {
    const result = normalizeDateInput(typeDigits(typed));
    assert.equal(result.status, 'INVALID', typed);
  }
  assert.deepEqual(normalizeDateInput(typeDigits('19940705')), { status: 'OK', value: '1994-07-05' });
});

test('이미 완성된 표기와 사용자가 쓴 구분자는 그대로 지킨다', () => {
  assert.equal(formatDateInput('1994-07-05'), '1994-07-05');
  assert.equal(typeDigits('1994-07-05'), '1994-07-05', '하이픈까지 직접 쳐도 결과가 같다');
  assert.equal(formatDateInput('1994.7.5'), '1994.7.5');
  assert.deepEqual(normalizeDateInput('1994.7.5'), { status: 'OK', value: '1994-07-05' });
  assert.equal(formatDateInput('199407051234'), '1994-07-05', '8자리를 넘는 입력은 버린다');
  assert.equal(typeDigits('199407051234'), '1994-07-05');
});

test('지우는 동안 값이 튀지 않는다', () => {
  // 한 글자씩 지우면 자리수만큼만 줄어든다. 하이픈에서 멈추거나 되살아나지 않는다.
  const steps: string[] = [];
  let shown = formatDateInput('19940705');
  while (shown) { steps.push(shown); shown = formatDateInput(shown.slice(0, -1)); }
  assert.deepEqual(steps, ['1994-07-05', '1994-07-0', '1994-07', '1994-0', '1994', '199', '19', '1']);
});

test('여러 날짜를 쉼표로 받는 칸도 같은 규칙을 쓴다', () => {
  assert.equal(formatDateListInput('20220510'), '2022-05-10');
  assert.equal(formatDateListInput('20220510,20240103'), '2022-05-10,2024-01-03');
  assert.equal(formatDateListInput('20220510, 20240103'), '2022-05-10, 2024-01-03');
  assert.equal(formatDateListInput('없음'), '없음', '숫자가 아닌 답은 건드리지 않는다');
});

test('만 나이는 기준일로 계산한다. 기기 시계를 쓰지 않는다', () => {
  assert.equal(ageOnDate('1994-07-05', '2026-07-04'), 31);
  assert.equal(ageOnDate('1994-07-05', '2026-07-05'), 32);
  assert.equal(ageOnDate('1994-07-05', undefined), undefined);
  assert.equal(ageOnDate(undefined, '2026-07-05'), undefined);
});
