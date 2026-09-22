import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyConsultationUtterance, DeterministicConsultationInterpreter, normalizeConsultationNumbers } from './interpreter.ts';
import { NEWLYWED_UTTERANCES } from './newlywedUtterances.fixture.ts';

const interpreter = new DeterministicConsultationInterpreter();

test('newlywed dataset has at least 50 distinct utterances across every required kind', () => {
  assert.ok(NEWLYWED_UTTERANCES.length >= 50, `${NEWLYWED_UTTERANCES.length}`);
  assert.equal(new Set(NEWLYWED_UTTERANCES.map(item => item.text)).size, NEWLYWED_UTTERANCES.length);
  const categories = new Set(NEWLYWED_UTTERANCES.map(item => item.category));
  for (const category of ['MARRIAGE_DATE', 'MARRIAGE_DURATION', 'CHILD_COUNT', 'CHILD_BIRTH', 'HOUSEHOLD_SIZE', 'ENGAGED', 'SINGLE_PARENT', 'DUAL_INCOME', 'AMBIGUOUS', 'CONFLICT', 'FUTURE']) {
    assert.ok(categories.has(category as never), category);
  }
});

for (const item of NEWLYWED_UTTERANCES) {
  test(`[${item.category}] ${item.text}`, async () => {
    assert.equal(classifyConsultationUtterance(normalizeConsultationNumbers(item.text)), item.kind, 'classification');
    const { updates } = await interpreter.interpret({ message: item.text });
    for (const [field, value] of Object.entries(item.extract)) {
      const found = updates.filter(update => update.field === field);
      assert.ok(found.some(update => update.value === value), `${field}=${JSON.stringify(value)} expected, got ${JSON.stringify(updates)}`);
    }
    for (const field of item.forbid) assert.equal(updates.some(update => update.field === field), false, `${field} must not be extracted: ${JSON.stringify(updates)}`);
  });
}
