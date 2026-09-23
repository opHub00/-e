import assert from 'node:assert/strict';
import test from 'node:test';
import { clearDraft, createMemoryDraftStorage, draftKey, readDraft, writeDraft } from './draft.ts';

test('8. 중간에 나갔다 돌아와도 답한 값과 위치가 남는다', () => {
  const storage = createMemoryDraftStorage();
  writeDraft('apt-2026000438-2026000438', 'newlywed', { answers: { birthDate: '1994-03-01', familyCategory: 'married' }, index: 2 }, storage);
  const restored = readDraft('apt-2026000438-2026000438', 'newlywed', storage);
  assert.deepEqual(restored?.answers, { birthDate: '1994-03-01', familyCategory: 'married' });
  assert.equal(restored?.index, 2);
  assert.match(restored?.savedAt ?? '', /^\d{4}-\d{2}-\d{2}T/);
});

test('공고와 공급유형마다 따로 저장한다', () => {
  const storage = createMemoryDraftStorage();
  writeDraft('listing-a', 'newlywed', { answers: { birthDate: '1990-01-01' }, index: 1 }, storage);
  writeDraft('listing-a', 'firstHome', { answers: { birthDate: '1991-01-01' }, index: 0 }, storage);
  writeDraft('listing-b', 'newlywed', { answers: { birthDate: '1992-01-01' }, index: 0 }, storage);
  assert.equal(readDraft('listing-a', 'newlywed', storage)?.answers.birthDate, '1990-01-01');
  assert.equal(readDraft('listing-a', 'firstHome', storage)?.answers.birthDate, '1991-01-01');
  assert.equal(readDraft('listing-b', 'newlywed', storage)?.answers.birthDate, '1992-01-01');
  assert.notEqual(draftKey('listing-a', 'newlywed'), draftKey('listing-a', 'firstHome'));
});

test('판정을 마치면 지운다', () => {
  const storage = createMemoryDraftStorage();
  writeDraft('listing-a', 'youth', { answers: { birthDate: '1990-01-01' }, index: 3 }, storage);
  clearDraft('listing-a', 'youth', storage);
  assert.equal(readDraft('listing-a', 'youth', storage), null);
});

test('깨진 값이 있어도 화면을 막지 않는다', () => {
  const storage = createMemoryDraftStorage();
  storage.setItem(draftKey('listing-a', 'newlywed'), '{ not json');
  assert.equal(readDraft('listing-a', 'newlywed', storage), null);
  storage.setItem(draftKey('listing-a', 'newlywed'), JSON.stringify({ answers: { ok: 'yes', bad: 12 }, index: -5 }));
  const restored = readDraft('listing-a', 'newlywed', storage);
  assert.deepEqual(restored?.answers, { ok: 'yes' });
  assert.equal(restored?.index, 0);
  assert.equal(readDraft('', 'newlywed', storage), null);
  // 저장소를 쓸 수 없어도 예외를 던지지 않는다.
  const broken = { getItem: () => { throw new Error('nope'); }, setItem: () => { throw new Error('nope'); }, removeItem: () => { throw new Error('nope'); } };
  assert.doesNotThrow(() => writeDraft('listing-a', 'newlywed', { answers: {}, index: 0 }, broken));
  assert.equal(readDraft('listing-a', 'newlywed', broken), null);
});

test('저장 크기를 제한한다', () => {
  const storage = createMemoryDraftStorage();
  const answers = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`q${i}`, 'yes']));
  answers.longOne = 'x'.repeat(500);
  writeDraft('listing-a', 'newlywed', { answers, index: 0 }, storage);
  const restored = readDraft('listing-a', 'newlywed', storage)!;
  assert.ok(Object.keys(restored.answers).length <= 60);
  assert.equal(restored.answers.longOne, undefined);
});
