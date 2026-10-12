import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateImportPackage } from '../../applicationAssessment/server/importPackage.ts';
import { buildSamdoRecommendation } from './evaluate.ts';
import { SAMDO_PERSONAS } from './personas.test-data.ts';
import { buildSamdoQuestionPlan } from './questions.ts';
import { SAMDO_DEEP_RULE_PACKAGE } from './rulePackage.ts';
import { toSamdoPresentationRecommendation } from './presentation.ts';
import { containsRawDomainKey } from '../presentation.ts';

const pkg = JSON.parse(readFileSync(new URL('../../../data/assessment-rules/samdo-2026-v1.7.json', import.meta.url), 'utf8'));
const rules = validateImportPackage(pkg).rules;

test('dedicated package is bound to the exact hashed HWP and 1-district inventory', () => {
  assert.equal(SAMDO_DEEP_RULE_PACKAGE.document.sha256, pkg.document.sha256);
  assert.equal(SAMDO_DEEP_RULE_PACKAGE.document.isOfficial, false);
  assert.equal(SAMDO_DEEP_RULE_PACKAGE.sourceStatus, 'DRAFT_SOURCE_VERIFIED');
  assert.deepEqual(SAMDO_DEEP_RULE_PACKAGE.inventory, { total: 32, units49: 8, units59: 24 });
  assert.deepEqual(Object.fromEntries(SAMDO_DEEP_RULE_PACKAGE.supplies.map(item => [item.supplyType, item.supplyCount])), {
    YOUTH: 5, NEWLYWED: 5, FIRST_HOME: 5, NEWBORN: 11, GENERAL: 3, INSTITUTIONAL_RECOMMENDATION: 3,
  });
  assert.equal(SAMDO_DEEP_RULE_PACKAGE.supplies.find(item => item.supplyType === 'INSTITUTIONAL_RECOMMENDATION')?.autoRecommend, false);
  for (const supply of SAMDO_DEEP_RULE_PACKAGE.supplies) for (const rule of supply.rules) {
    assert.equal(rule.evidence.locator?.sha256, pkg.document.sha256);
    assert.ok(rule.evidence.textExcerpt);
  }
});

test('newborn exact two-year boundary, score and general no-score semantics', () => {
  const input = structuredClone(SAMDO_PERSONAS.find(item => item.id === 'newborn-family')!.input);
  input.details.children = [{ birthDate: '2024-09-14', unborn: false }];
  let recommendation = buildSamdoRecommendation(rules, input);
  const newborn = recommendation.evaluations.find(item => item.supplyType === 'NEWBORN')!;
  const general = recommendation.evaluations.find(item => item.supplyType === 'GENERAL')!;
  assert.equal(newborn.eligibility, 'ELIGIBLE');
  assert.equal(newborn.stage, 'PRIORITY');
  assert.deepEqual(newborn.officialScore.status === 'AVAILABLE' ? [newborn.officialScore.total, newborn.officialScore.max] : null, [10, 12]);
  assert.equal(general.officialScore.status, 'NOT_APPLICABLE');
  input.details.children = [{ birthDate: '2024-09-13', unborn: false }];
  recommendation = buildSamdoRecommendation(rules, input);
  assert.equal(recommendation.evaluations.find(item => item.supplyType === 'NEWBORN')?.eligibility, 'INELIGIBLE');
});

test('birth and asset exceptions stay evidence-required instead of optimistic eligibility', () => {
  const input = structuredClone(SAMDO_PERSONAS.find(item => item.id === 'newborn-family')!.input);
  input.details.totalAssets = 390_000_000;
  let newborn = buildSamdoRecommendation(rules, input).evaluations.find(item => item.supplyType === 'NEWBORN')!;
  assert.equal(newborn.eligibility, 'EVIDENCE_REQUIRED');
  assert.ok(newborn.evidenceRequired.some(item => item.includes('자산기준 완화')));
  input.details.totalAssets = 100_000_000;
  input.details.householdIncome = 11_000_000;
  input.details.dualIncome = false;
  newborn = buildSamdoRecommendation(rules, input).evaluations.find(item => item.supplyType === 'NEWBORN')!;
  assert.equal(newborn.eligibility, 'EVIDENCE_REQUIRED');
  assert.ok(newborn.evidenceRequired.some(item => item.includes('소득기준 완화')));
});

test('institutional recommendation remains information-only and outside auto ranking', () => {
  const result = buildSamdoRecommendation(rules, SAMDO_PERSONAS[0].input);
  assert.equal(result.informationOnlyTypes.length, 1);
  assert.equal(result.informationOnlyTypes[0].stage, 'INFORMATION_ONLY');
  assert.ok(result.recommendedType);
  assert.notEqual(result.recommendedType?.supplyType, 'INSTITUTIONAL_RECOMMENDATION');
});

test('adaptive questions deduplicate shared facts and exclude already ineligible supplies', () => {
  const sparse = structuredClone(SAMDO_PERSONAS[0].input);
  sparse.details.householdIncome = undefined;
  sparse.details.totalAssets = undefined;
  sparse.details.dualIncome = undefined;
  sparse.details.incomeHouseholdSize = undefined;
  const plan = buildSamdoQuestionPlan(buildSamdoRecommendation(rules, sparse));
  const ids = [...plan.questions, ...plan.evidenceOnly].map(item => item.id);
  assert.equal(ids.length, new Set(ids).size);
  assert.equal(ids.filter(id => id === 'householdIncome').length, 1);
  assert.ok(plan.excludedIneligible.includes('NEWBORN'));
  assert.ok(plan.evidenceOnly.some(item => item.id === 'householdIncome'));

  const addressed = {
    'household.householdIncome': 'DOES_NOT_KNOW',
    'household.totalAssets': 'DOES_NOT_KNOW',
    'household.dualIncome': 'DOES_NOT_KNOW',
    'household.householdSize': 'DOES_NOT_KNOW',
  } as const;
  const afterUnknown = buildSamdoQuestionPlan(buildSamdoRecommendation(rules, sparse), addressed);
  const repeated = [...afterUnknown.questions, ...afterUnknown.evidenceOnly].map(item => item.id)
    .filter(id => ['householdIncome', 'totalAssets', 'dualIncome', 'incomeHouseholdSize'].includes(id));
  assert.deepEqual(repeated, [], 'explicit unknown facts are not re-asked with another Samdo label');

  const parentUnknown = structuredClone(SAMDO_PERSONAS.find(item => item.id === 'young-single-20s')!.input);
  parentUnknown.details.parentAssets = undefined;
  const afterParentReason = buildSamdoQuestionPlan(buildSamdoRecommendation(rules, parentUnknown), {
    'household.parentInformationStatus': 'DOES_NOT_KNOW',
  });
  assert.ok(!afterParentReason.evidenceOnly.some(item => item.id === 'parentAssets'), 'a completed parent-information reason is not asked again');
});

test('nine persona recommendation snapshots', () => {
  const snapshot = Object.fromEntries(SAMDO_PERSONAS.map(persona => {
    const recommendation = buildSamdoRecommendation(rules, persona.input);
    return [persona.id, {
      possible: recommendation.evaluations.filter(item => item.autoRecommend && item.eligibility !== 'INELIGIBLE').map(item => `${item.supplyType}:${item.eligibility}`),
      recommended: recommendation.recommendedType?.supplyType ?? null,
      rejected: recommendation.rejectedTypes.map(item => `${item.supplyType}:${item.failedReasons[0]}`),
      topReason: recommendation.recommendedType?.reasons[0] ?? null,
    }];
  }));
  assert.deepEqual(snapshot, {
    'young-single-20s': { possible: ['YOUTH:ELIGIBLE', 'GENERAL:ELIGIBLE'], recommended: 'YOUTH', rejected: ['FIRST_HOME:혼인 중 또는 동일 등본의 미혼 자녀', 'NEWLYWED:혼인 7년 이내 또는 만 7세 미만 자녀 / 예비신혼 / 한부모', 'NEWBORN:공고일 현재 2세 미만 자녀 또는 태아가 없어요.'], topReason: '기본 자격과 우선공급 대상 조건을 충족했어요.' },
    'young-jeju-2y': { possible: ['YOUTH:ELIGIBLE', 'GENERAL:ELIGIBLE'], recommended: 'YOUTH', rejected: ['FIRST_HOME:혼인 중 또는 동일 등본의 미혼 자녀', 'NEWLYWED:혼인 7년 이내 또는 만 7세 미만 자녀 / 예비신혼 / 한부모', 'NEWBORN:공고일 현재 2세 미만 자녀 또는 태아가 없어요.'], topReason: '기본 자격과 우선공급 대상 조건을 충족했어요.' },
    engaged: { possible: ['NEWLYWED:ELIGIBLE', 'YOUTH:ELIGIBLE', 'GENERAL:ELIGIBLE'], recommended: 'NEWLYWED', rejected: ['FIRST_HOME:혼인 중 또는 동일 등본의 미혼 자녀', 'NEWBORN:공고일 현재 2세 미만 자녀 또는 태아가 없어요.'], topReason: '기본 자격과 우선공급 대상 조건을 충족했어요.' },
    'newlywed-no-child': { possible: ['NEWLYWED:ELIGIBLE', 'FIRST_HOME:ELIGIBLE', 'GENERAL:ELIGIBLE'], recommended: 'NEWLYWED', rejected: ['YOUTH:혼인 중이 아님', 'NEWBORN:공고일 현재 2세 미만 자녀 또는 태아가 없어요.'], topReason: '기본 자격과 우선공급 대상 조건을 충족했어요.' },
    'newlywed-infant': { possible: ['NEWBORN:ELIGIBLE', 'GENERAL:ELIGIBLE', 'FIRST_HOME:EVIDENCE_REQUIRED', 'NEWLYWED:EVIDENCE_REQUIRED'], recommended: 'NEWBORN', rejected: ['YOUTH:혼인 중이 아님'], topReason: '1단계 우선공급(70%)' },
    'first-home-couple': { possible: ['FIRST_HOME:ELIGIBLE', 'GENERAL:ELIGIBLE', 'NEWLYWED:ELIGIBLE'], recommended: 'FIRST_HOME', rejected: ['YOUTH:혼인 중이 아님', 'NEWBORN:공고일 현재 2세 미만 자녀 또는 태아가 없어요.'], topReason: '기본 자격과 우선공급 대상 조건을 충족했어요.' },
    'newborn-family': { possible: ['NEWBORN:ELIGIBLE', 'GENERAL:ELIGIBLE', 'FIRST_HOME:EVIDENCE_REQUIRED', 'NEWLYWED:EVIDENCE_REQUIRED'], recommended: 'NEWBORN', rejected: ['YOUTH:혼인 중이 아님'], topReason: '1단계 우선공급(70%)' },
    'general-no-home': { possible: ['GENERAL:ELIGIBLE', 'FIRST_HOME:EVIDENCE_REQUIRED'], recommended: 'GENERAL', rejected: ['NEWLYWED:혼인 7년 이내 또는 만 7세 미만 자녀 / 예비신혼 / 한부모', 'YOUTH:만 19~39세', 'NEWBORN:공고일 현재 2세 미만 자녀 또는 태아가 없어요.'], topReason: '2단계 1순위 우선공급(30%)' },
    'clearly-ineligible': { possible: [], recommended: null, rejected: ['FIRST_HOME:입주자저축 보유 및 종류', 'NEWLYWED:세대 총자산 362백만원 이하', 'YOUTH:입주자저축 보유 및 종류', 'NEWBORN:세대에 주택 보유자가 있어 무주택 요건을 충족하지 못해요.', 'GENERAL:세대에 주택 보유자가 있어 무주택 요건을 충족하지 못해요.'], topReason: null },
  });
});

test('ranking is deterministic and never claims winning probability', () => {
  const input = SAMDO_PERSONAS.find(item => item.id === 'newborn-family')!.input;
  const first = buildSamdoRecommendation(rules, input);
  const second = buildSamdoRecommendation(rules, structuredClone(input));
  assert.deepEqual(first, second);
  assert.equal(/당첨확률이?\s*(?:높|낮)/.test(JSON.stringify(first)), false);
});

test('presentation contract strips internal fact keys and exposes only user copy', () => {
  const input = structuredClone(SAMDO_PERSONAS[0].input);
  input.details.householdIncome = undefined;
  const view = toSamdoPresentationRecommendation(buildSamdoRecommendation(rules, input));
  assert.equal(Object.hasOwn(view.evaluations[0], 'missingFacts'), false);
  for (const item of view.evaluations) {
    for (const value of [...item.matchedAdvantages, ...item.cautions, ...item.evidenceRequired, ...item.reasons, ...item.failedReasons]) {
      assert.equal(containsRawDomainKey(value), false, value);
    }
  }
});
