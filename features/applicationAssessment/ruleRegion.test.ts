import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OFFICIAL_REGION_NAME_PATTERN, OFFICIAL_REGION_NAMES, normalizeProfileRegion, PROFILE_REGIONS, REGION_DEFINITIONS } from '../discovery/regions.ts';
import { validateImportPackage } from './server/importPackage.ts';
import { announcementResidenceRegion } from './ruleRegion.ts';
import { REFERENCE_RULE_SET } from './reference/index.ts';

const samdo = validateImportPackage(JSON.parse(readFileSync(new URL('../../data/assessment-rules/samdo-2026-v1.7.json', import.meta.url), 'utf8'))).rules;

test('every region is handled by the one registry, with no per-region code', () => {
  assert.equal(REGION_DEFINITIONS.length, 17);
  for (const region of REGION_DEFINITIONS) {
    for (const alias of region.aliases) assert.equal(normalizeProfileRegion(alias), region.profile, alias);
    assert.ok(OFFICIAL_REGION_NAME_PATTERN.test(`${region.profile}에 거주`), region.profile);
  }
  assert.ok(PROFILE_REGIONS.every(name => OFFICIAL_REGION_NAMES.includes(name)));
  // 짧은 이름만으로는 문서 속 지역으로 보지 않는다.
  assert.equal(OFFICIAL_REGION_NAME_PATTERN.test('서울 거주'), false);
  assert.equal(normalizeProfileRegion('해외'), null);
});

test('the required residence region is read from the rules themselves', () => {
  assert.deepEqual(announcementResidenceRegion(samdo), { profile: '제주특별자치도', short: '제주' });
  assert.deepEqual(announcementResidenceRegion(REFERENCE_RULE_SET), { profile: '제주특별자치도', short: '제주' });
  assert.equal(announcementResidenceRegion(undefined), null);
});

test('rules without a region, or with several, never get a guessed region', () => {
  const stripped = structuredClone(samdo);
  for (const supply of stripped.supplies) supply.eligibility = supply.eligibility.filter(rule => !JSON.stringify(rule.expression).includes('"residence"'));
  for (const supply of stripped.supplies) for (const stage of supply.stages) stage.conditions = stage.conditions.filter(rule => !JSON.stringify(rule.expression).includes('"residence"'));
  assert.equal(announcementResidenceRegion(stripped), null);
  const ambiguous = structuredClone(samdo);
  const first = ambiguous.supplies[0].eligibility[0];
  first.expression = { any: [first.expression, { fact: 'residence', op: 'eq', value: '서울특별시' }] };
  assert.equal(announcementResidenceRegion(ambiguous), null);
});
