import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import district2Package from '../../../data/assessment-rules/samdo-2-2026-v1.8.json' with { type: 'json' };
import ragData from '../../../data/event/samdo-dual-v2-rag.json' with { type: 'json' };
import { validateImportPackage } from '../../applicationAssessment/server/importPackage.ts';
import { buildSamdoRecommendation } from '../samdo/evaluate.ts';
import { SAMDO_PERSONAS } from '../samdo/personas.test-data.ts';
import { samdoRules } from '../samdoResult/samdoEvaluate.ts';
import { answerSamdoDualDeterministically, buildSamdoDualChatContext } from './chat.ts';
import { SAMDO_DISTRICTS } from './config.ts';
import { buildSamdoDualAssessment } from './evaluate.ts';
import { retrieveSamdoEvidence } from './rag.ts';
import { SAMDO_DISTRICT2_DEEP_RULE_PACKAGE } from './rulePackages.ts';

test('district 1 and district 2 final 1.8 configs stay independently bound', () => {
  const d1 = SAMDO_DISTRICTS['samdo-1'];
  const d2 = SAMDO_DISTRICTS['samdo-2'];
  assert.deepEqual([d1.managementNumber, d1.inventory.total, d1.inventory.special, d1.inventory.general], ['2026000434', 32, 26, 6]);
  assert.deepEqual([d2.managementNumber, d2.inventory.total, d2.inventory.special, d2.inventory.general], ['2026000435', 40, 32, 8]);
  assert.deepEqual(d1.inventory.bySupplyType, { YOUTH: 5, NEWLYWED: 5, NEWBORN: 11, FIRST_HOME: 5, GENERAL: 6 });
  assert.deepEqual(d2.inventory.bySupplyType, { YOUTH: 6, NEWLYWED: 6, NEWBORN: 14, FIRST_HOME: 6, GENERAL: 8 });
  assert.deepEqual(d1.units.find(item => item.unitType === '49A'), {
    unitType: '49A', supplyCount: 8,
    prices: [{ floor: '2층', priceKrw: 242_256_000 }, { floor: '3층', priceKrw: 247_303_000 }, { floor: '4~9층', priceKrw: 252_350_000 }],
    monthlyLandRentKrw: 247_050,
  });
  assert.deepEqual(d2.units.find(item => item.unitType === '49A'), {
    unitType: '49A', supplyCount: 8,
    prices: [{ floor: '2층', priceKrw: 241_927_000 }, { floor: '3층', priceKrw: 246_967_000 }, { floor: '4~9층', priceKrw: 252_007_000 }],
    monthlyLandRentKrw: 283_920,
  });
  assert.deepEqual(d1.units.find(item => item.unitType === '59A'), {
    unitType: '59A', supplyCount: 24,
    prices: [{ floor: '2층', priceKrw: 290_240_000 }, { floor: '3층', priceKrw: 296_287_000 }, { floor: '4~9층', priceKrw: 302_334_000 }],
    monthlyLandRentKrw: 298_840,
  });
  assert.deepEqual(d2.units.find(item => item.unitType === '59A'), {
    unitType: '59A', supplyCount: 32,
    prices: [{ floor: '2층', priceKrw: 289_898_000 }, { floor: '3층', priceKrw: 295_937_000 }, { floor: '4~9층', priceKrw: 301_977_000 }],
    monthlyLandRentKrw: 343_440,
  });
  assert.equal(d1.schedule.winnerAnnouncement, '2026-11-24');
  assert.equal(d2.schedule.winnerAnnouncement, '2026-11-25');
  assert.deepEqual(
    { special: d1.schedule.special, first: d1.schedule.generalFirst, second: d1.schedule.generalSecond, documents: d1.schedule.documentSubmission, contract: d1.schedule.contract },
    { special: '2026-11-16', first: '2026-11-17', second: '2026-11-18', documents: { start: '2026-11-30', end: '2026-12-04' }, contract: { start: '2027-01-25', end: '2027-01-29' } },
  );
  assert.deepEqual(
    { special: d2.schedule.special, first: d2.schedule.generalFirst, second: d2.schedule.generalSecond, documents: d2.schedule.documentSubmission, contract: d2.schedule.contract },
    { special: '2026-11-16', first: '2026-11-17', second: '2026-11-18', documents: { start: '2026-11-30', end: '2026-12-04' }, contract: { start: '2027-01-25', end: '2027-01-29' } },
  );
  assert.notEqual(d1.document.sha256, d2.document.sha256);
});

test('district 2 Rule Package validates and has zero district 1 provenance leakage', () => {
  const validated = validateImportPackage(district2Package);
  assert.equal(validated.rules.id, SAMDO_DISTRICT2_DEEP_RULE_PACKAGE.baseRuleSetId);
  assert.equal(validated.package.announcement.housingManagementNumber, '2026000435');
  assert.equal(validated.package.document.sha256, SAMDO_DISTRICTS['samdo-2'].document.sha256);
  for (const rule of validated.package.rules) {
    assert.equal(rule.evidence.documentId, validated.package.document.id);
    assert.equal(rule.evidence.locator.sha256, validated.package.document.sha256);
    assert.ok(!rule.evidence.source.includes('1지구'), rule.ruleKey);
    assert.ok(!rule.evidence.textExcerpt?.includes('2026000434'), rule.ruleKey);
    assert.ok(Array.isArray(rule.evidence.locator.paragraphs) && rule.evidence.locator.paragraphs.length > 0, rule.ruleKey);
  }
  for (const supply of SAMDO_DISTRICT2_DEEP_RULE_PACKAGE.supplies) for (const rule of supply.rules) {
    assert.equal(rule.evidence.documentId, validated.package.document.id);
    assert.equal(rule.evidence.locator?.sha256, validated.package.document.sha256);
    assert.ok(!rule.evidence.source.includes('1지구'));
  }
});

test('one input evaluates both districts while preserving the nine district 1 persona snapshots', () => {
  for (const persona of SAMDO_PERSONAS) {
    const baseline = buildSamdoRecommendation(samdoRules(), persona.input);
    const dual = buildSamdoDualAssessment(persona.input);
    const [district1, district2] = dual.districts;
    assert.deepEqual(district1.recommendation, baseline, `${persona.id}: district 1 regression`);
    assert.equal(district1.recommendation.listingId, 'samdo-1-2026-final-1.8');
    assert.equal(district2.recommendation.listingId, 'samdo-2-2026-final-1.8');
    for (const first of district1.recommendation.evaluations) {
      const second = district2.recommendation.evaluations.find(item => item.supplyType === first.supplyType)!;
      assert.equal(second.eligibility, first.eligibility, `${persona.id}:${first.supplyType}:eligibility`);
      assert.equal(second.stage, first.stage, `${persona.id}:${first.supplyType}:stage`);
      assert.equal(second.officialScore.status, first.officialScore.status, `${persona.id}:${first.supplyType}:score status`);
      if (second.officialScore.status === 'AVAILABLE' && first.officialScore.status === 'AVAILABLE') {
        assert.deepEqual(
          { total: second.officialScore.total, max: second.officialScore.max, breakdown: second.officialScore.breakdown.map(({ evidenceId: _evidenceId, ...item }) => item) },
          { total: first.officialScore.total, max: first.officialScore.max, breakdown: first.officialScore.breakdown.map(({ evidenceId: _evidenceId, ...item }) => item) },
          `${persona.id}:${first.supplyType}:score`,
        );
        assert.ok(second.officialScore.breakdown.every(item => item.evidenceId.includes('.d2.')), `${persona.id}:${first.supplyType}:district 2 evidence`);
      }
      assert.equal(second.supplyCount, district2.district.inventory.bySupplyType[first.supplyType as keyof typeof district2.district.inventory.bySupplyType]);
      for (const evidence of second.evidence) assert.equal(evidence.locator?.sha256, district2.district.document.sha256);
    }
    assert.equal(/당첨확률(?:이|은|가)?\s*(?:높|낮)|경쟁률\s*\d/.test(dual.comparison.reasons.join(' ')), false);
    assert.match(dual.comparison.disclaimer, /경쟁률이나 당첨확률을 추정하지 않아요/);
  }
});

test('RAG chunks preserve district, section, table and exact source locator', () => {
  assert.equal(ragData.chunks.length, 28);
  assert.match(ragData.fingerprint, /^[a-f0-9]{64}$/);
  for (const chunk of ragData.chunks) {
    const district = SAMDO_DISTRICTS[chunk.districtId as keyof typeof SAMDO_DISTRICTS];
    assert.equal(chunk.locator.sha256, district.document.sha256, chunk.id);
    assert.ok(chunk.locator.paragraphs.length > 0, chunk.id);
    assert.ok(chunk.section && chunk.textExcerpt, chunk.id);
  }
  const newborn = retrieveSamdoEvidence('2지구 신생아 특별공급 몇 세대야?');
  assert.deepEqual(newborn.districtIds, ['samdo-2']);
  assert.equal(newborn.intent, 'SUPPLY_COUNT');
  assert.ok(newborn.chunks.every(chunk => chunk.districtId === 'samdo-2'));
  const lease = retrieveSamdoEvidence('토지임대부가 뭐야?');
  assert.equal(lease.intent, 'LAND_LEASE');
  assert.ok(lease.chunks.some(chunk => chunk.section === '토지임대부 분양주택 안내'));
});

test('deterministic dual chat answers structured facts exactly', () => {
  const assessment = buildSamdoDualAssessment(SAMDO_PERSONAS.find(item => item.id === 'newborn-family')!.input);
  const cases: Array<[string, RegExp]> = [
    ['2지구 신생아 특별공급 몇 세대야?', /14세대/],
    ['59㎡ 토지임대료 차이는?', /1지구 59㎡ 월 토지임대료는 298,840원.*2지구 59㎡ 월 토지임대료는 343,440원/],
    ['1지구 분양가는 얼마야?', /1지구 59㎡ 분양가격은 2층 290,240,000원, 3층 296,287,000원, 4~9층 302,334,000원/],
    ['특별공급 언제 신청해?', /특별공급.*11월 16일/],
    ['1지구 당첨자 발표 언제야?', /1지구 당첨자 발표는 11월 24일/],
    ['2지구 당첨자 발표 언제야?', /2지구 당첨자 발표는 11월 25일/],
    ['토지임대부가 뭐야?', /토지는 공공이 소유하고 건물은 수분양자가 소유/],
    ['해외체류가 있으면 어떻게 돼?', /제주 거주기간 산정과 지역 우선공급 인정 여부/],
    ['준비서류 뭐가 필요해?', /주민등록표등본·초본/],
  ];
  for (const [question, expected] of cases) assert.match(answerSamdoDualDeterministically(assessment, question).text, expected, question);
  const both = answerSamdoDualDeterministically(assessment, '나는 둘 다 신청 가능해?');
  assert.ok((both.detail ?? []).some(item => item.startsWith('1지구:')));
  assert.ok((both.detail ?? []).some(item => item.startsWith('2지구:')));
});

test('dual browser LLM context is presentation-safe and cannot author RAG evidence', () => {
  const input = SAMDO_PERSONAS.find(item => item.id === 'newborn-family')!.input;
  const context = buildSamdoDualChatContext(buildSamdoDualAssessment(input), '2지구 신생아 특별공급 몇 세대야?');
  const serialized = JSON.stringify(context);
  assert.equal(context.schemaVersion, 2);
  assert.equal(context.scope, 'SAMDO_DUAL');
  assert.deepEqual(context.retrievedEvidence, []);
  for (const forbidden of ['birthDate', 'monthlyIncome', 'householdIncome', 'totalAssets', 'parentAssets', 'factKey', 'rulePackage', 'qrToken', 'personId']) {
    assert.ok(!serialized.includes(forbidden), forbidden);
  }
});
