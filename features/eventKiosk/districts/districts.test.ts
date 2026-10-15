import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { kioskEvent } from '../kioskEvent.ts';
import { evaluatePhase4Personas } from '../phase4Personas.ts';
import { samdoInputFromAnswers } from '../samdoResult/samdoInput.ts';
import { buildSamdoDualAssessment } from '../samdoDual/evaluate.ts';
import { SAMDO_DISTRICTS } from '../samdoDual/config.ts';
import { buildDistrictComparison, formatDistrictDate, formatMonthly, formatPrice, formatPriceTiers } from './districtAdapter.ts';
import { DISTRICT_COPY } from './districtCopy.ts';

const load = kioskEvent();
if (!load.ok) throw new Error(load.error);
const persona = evaluatePhase4Personas(load.event).find(item => item.personaId === 'NEWLYWED_ONE_CHILD')!;
const dual = buildSamdoDualAssessment(samdoInputFromAnswers(persona.finalAnswers));

test('normal district cards read only final 1.8 config and this visitor’s dual assessment', () => {
  const model = buildDistrictComparison({ dual });
  const [d1, d2] = model.cards;
  assert.deepEqual(d1.inventory, { total: 32, special: 26, general: 6, units49: 8, units59: 24 });
  assert.deepEqual(d2.inventory, { total: 40, special: 32, general: 8, units49: 8, units59: 32 });
  assert.equal(d1.managementNumber, '2026000434');
  assert.equal(d2.managementNumber, '2026000435');
  assert.equal(d1.schedule.winnerAnnouncement, '2026-11-24');
  assert.equal(d2.schedule.winnerAnnouncement, '2026-11-25');
  assert.deepEqual(d1.costs.salePrices59, SAMDO_DISTRICTS['samdo-1'].units[1].prices);
  assert.deepEqual(d2.costs.salePrices59, SAMDO_DISTRICTS['samdo-2'].units[1].prices);
  assert.equal(d1.costs.monthlyLandRent59, 298_840);
  assert.equal(d2.costs.monthlyLandRent59, 343_440);
  assert.equal(d1.assessment.status, 'READY');
  assert.equal(d2.assessment.status, 'READY');
  assert.equal(d1.source.sha256, SAMDO_DISTRICTS['samdo-1'].document.sha256);
  assert.equal(d2.source.sha256, SAMDO_DISTRICTS['samdo-2'].document.sha256);
  assert.equal(model.sample, false);
});

test('before answers, both districts keep real notice data and only the assessment is pending', () => {
  const model = buildDistrictComparison({ dual: null });
  for (const card of model.cards) {
    assert.equal(card.assessment.status, 'PENDING');
    assert.equal(card.source.status, 'FINAL_USER_SOURCE');
    assert.ok(card.costs.salePrices49.length > 0);
    assert.ok(card.schedule.special);
  }
  assert.equal(JSON.stringify(model).includes('공고 데이터 연결 전'), false);
  assert.equal(JSON.stringify(model).includes('행사 브리프'), false);
});

test('layout sample is explicit and cannot enter the normal path', () => {
  assert.equal(buildDistrictComparison({ dual: null }).sample, false);
  const model = buildDistrictComparison({ dual: null, layoutSample: true });
  assert.equal(model.sample, true);
  assert.ok(model.cards.every(card => card.source.status === 'LAYOUT_SAMPLE'));
});

test('formats: tiered prices, monthly rent and dates', () => {
  assert.equal(formatPrice(245_000_000), '2억 4,500만원');
  assert.equal(formatPrice(null), null);
  assert.equal(formatPriceTiers([{ floor: '2층', priceKrw: 245_000_000 }, { floor: '3층', priceKrw: 250_000_000 }]), '2층 2억 4,500만원\n3층 2억 5,000만원');
  assert.equal(formatMonthly(213_000), '월 213,000원');
  assert.equal(formatDistrictDate('2026-11-16'), '11월 16일(월)');
  assert.equal(formatDistrictDate('2026-11-24', 'long'), '2026년 11월 24일');
});

test('district UI copy never frames counts or prices as winning chances', () => {
  const sources = ['DistrictComparison.tsx', 'districtCopy.ts', 'DistrictDetailFold.tsx'].map(file => readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');
  const copy = JSON.stringify(DISTRICT_COPY) + sources;
  assert.ok(!/당첨\s*확률|당첨\s*가능성이\s*높|경쟁률\s*\d|유리한\s*지구/.test(copy));
  assert.ok(copy.includes('당첨 가능성을 뜻하지 않아요'));
  assert.ok(!/함께하는 곳/.test(copy));
});
