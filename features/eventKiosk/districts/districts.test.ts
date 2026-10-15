import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { kioskEvent } from '../kioskEvent.ts';
import { evaluatePhase4Personas } from '../phase4Personas.ts';
import { SAMDO_DEEP_RULE_PACKAGE } from '../samdo/rulePackage.ts';
import { samdoRecommendationForAnswers } from '../samdoResult/samdoEvaluate.ts';
import { buildDistrictComparison, district1Assessment, formatDistrictDate, formatMonthly, formatPrice } from './districtAdapter.ts';
import { DISTRICT_COPY } from './districtCopy.ts';
import { codexDistrictPresentation, DISTRICT_LAYOUT_SAMPLE } from './districtSource.ts';

const load = kioskEvent();
if (!load.ok) throw new Error(load.error);
const persona = evaluatePhase4Personas(load.event).find(item => item.personaId === 'NEWLYWED_ONE_CHILD')!;
const recommendation = samdoRecommendationForAnswers(persona.finalAnswers);

test('1지구 card reads the final 1.8 package and this visitor’s Samdo result unchanged', () => {
  const model = buildDistrictComparison({ district1: recommendation });
  const d1 = model.cards.find(card => card.id === 'D1')!;
  assert.deepEqual(d1.inventory, { total: SAMDO_DEEP_RULE_PACKAGE.inventory.total, units49: SAMDO_DEEP_RULE_PACKAGE.inventory.units49, units59: SAMDO_DEEP_RULE_PACKAGE.inventory.units59 });
  assert.equal(d1.schedule.special, SAMDO_DEEP_RULE_PACKAGE.schedule.special);
  assert.equal(d1.schedule.winnerAnnouncement, SAMDO_DEEP_RULE_PACKAGE.schedule.winnerAnnouncement);
  assert.equal(d1.assessment.status, 'READY');
  if (d1.assessment.status === 'READY') {
    assert.equal(d1.assessment.recommendedSupply, recommendation.recommendedType?.supplyLabel);
    assert.equal(d1.assessment.eligibility, recommendation.recommendedType?.eligibility);
    assert.equal(d1.assessment.supplyCount, recommendation.recommendedType?.supplyCount);
  }
  assert.equal(model.sample, false);
});

test('2지구 shows only the brief inventory until Codex data arrives — no invented verdict, price or date', () => {
  assert.equal(codexDistrictPresentation(), null, 'no Codex district data connected on this branch');
  const d2 = buildDistrictComparison({ district1: recommendation }).cards.find(card => card.id === 'D2')!;
  assert.deepEqual(d2.inventory, { total: 40, units49: 8, units59: 32 });
  assert.equal(d2.assessment.status, 'PENDING');
  assert.deepEqual(d2.costs, { salePrice49: null, salePrice59: null, monthlyLandRent49: null, monthlyLandRent59: null });
  assert.deepEqual(d2.schedule, { special: null, generalFirst: null, generalSecond: null, winnerAnnouncement: null });
  assert.equal(d2.source.status, 'BRIEF');
});

test('Codex presentation overrides field by field; null/undefined never erases a known value', () => {
  const model = buildDistrictComparison({
    district1: recommendation,
    codex: [
      { id: 'D1', costs: { salePrice59: 200_000_000, monthlyLandRent59: null } },
      { id: 'D2', schedule: { special: '2026-12-01' }, assessment: { status: 'READY', recommendedSupply: '청년 특별공급', eligibility: 'ELIGIBLE', priorityStage: '우선공급', officialScore: { status: 'PENDING' }, supplyCount: 7 }, source: { status: 'OFFICIAL', label: '2지구 공고' } },
    ],
  });
  const [d1, d2] = model.cards;
  assert.equal(d1.costs.salePrice59, 200_000_000);
  assert.equal(d1.costs.monthlyLandRent59, null);
  assert.equal(d1.schedule.special, SAMDO_DEEP_RULE_PACKAGE.schedule.special, 'untouched fields keep the package value');
  assert.equal(d2.schedule.special, '2026-12-01');
  assert.equal(d2.schedule.generalFirst, null);
  assert.equal(d2.assessment.status, 'READY');
  assert.equal(d2.source.label, '2지구 공고');
});

test('layout sample is flagged so the screen can warn it is not real data', () => {
  assert.equal(buildDistrictComparison({ district1: null, codex: DISTRICT_LAYOUT_SAMPLE }).sample, true);
  assert.equal(district1Assessment(null).status, 'PENDING');
});

test('formats: price, monthly rent, dates', () => {
  assert.equal(formatPrice(245_000_000), '2억 4,500만원');
  assert.equal(formatPrice(300_000_000), '3억원');
  assert.equal(formatPrice(98_000_000), '9,800만원');
  assert.equal(formatPrice(null), null);
  assert.equal(formatMonthly(213_000), '월 213,000원');
  assert.equal(formatDistrictDate('2026-11-16'), '11월 16일(월)');
  assert.equal(formatDistrictDate('2026-11-24', 'long'), '2026년 11월 24일');
  assert.equal(formatDistrictDate(null), null);
});

test('district UI copy never frames counts or prices as winning chances', () => {
  const sources = ['DistrictComparison.tsx', 'districtCopy.ts', 'DistrictDetailFold.tsx'].map(file => readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');
  const copy = JSON.stringify(DISTRICT_COPY) + sources;
  assert.ok(!/당첨\s*확률|당첨\s*가능성이\s*높|경쟁률\s*\d|유리한\s*지구/.test(copy));
  assert.ok(copy.includes('당첨 가능성을 뜻하지 않아요'), 'the comparison says counts/prices are not chances');
  assert.ok(!/함께하는 곳/.test(copy));
});
