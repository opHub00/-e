import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createMinimalApplicantProfile, knownField, type ApplicantProfileV2 } from '../profile/domain.ts';
import { validateImportPackage } from '../applicationAssessment/server/importPackage.ts';
import { assessApplication } from '../applicationAssessment/engine.ts';
import type { ApplicationAssessmentResult } from '../applicationAssessment/types.ts';
import { buildListingInsight, daysUntil, deadlineLabel, pickPrimaryInsight, INSIGHT_VIEW } from './domain.ts';
import { ListingRuleCache, type RuleLookupResult } from './ruleCache.ts';

const load = (name: string) => validateImportPackage(JSON.parse(readFileSync(new URL(`../../data/assessment-rules/${name}`, import.meta.url), 'utf8'))).rules;
const godeok = load('lh-godeok-a65bl-2026000438.json');
const LISTING = 'apt-2026000438-2026000438';
const ASOF = godeok.announcementDate ?? '2026-09-11';

const blank = (): ApplicantProfileV2 => createMinimalApplicantProfile({ name: '검증용', age: 31, currentRegion: '경기도 평택시', preferredRegions: [] });
const assess = (profile: ApplicantProfileV2, details: Record<string, unknown> = {}) =>
  assessApplication(godeok, { profile, details: details as never }, LISTING).find(item => item.supplyType === 'newlywed')!;

test('1~2. 로그인·프로필이 없어도 판정은 돌고, 확인 필요로만 표현한다', () => {
  const insight = buildListingInsight(assess(blank()));
  assert.equal(insight.status, 'NEEDS_MORE_INFORMATION');
  assert.ok(insight.unknown > 0);
  assert.equal(insight.failed, 0);
  assert.doesNotMatch(insight.label, /실패|오류/, '정보 부족을 분석 실패로 쓰지 않는다');
  assert.match(insight.sentence, /조건 \d+개 중 \d+개 충족/);
});

test('3~4. 프로필이 있으면 충족 수가 늘고, 부족분은 입력 안내로 바뀐다', () => {
  const filled = blank();
  filled.basic.birthDate = knownField('1994-07-05');
  filled.family.marriageStatus = knownField('married');
  filled.housing.currentOwnership = knownField('no-home');
  filled.housing.householdHasHome = knownField(false);
  filled.housing.hasSpecialSupplyRestriction = knownField(false);
  const before = buildListingInsight(assess(blank()));
  const after = buildListingInsight(assess(filled));
  assert.ok(after.passed > before.passed, `프로필을 채우면 충족이 늘어야 한다 (${before.passed} → ${after.passed})`);
  assert.equal(after.status, 'NEEDS_MORE_INFORMATION');
  assert.match(after.label, /정보 \d+개를 더 입력하면 분석할 수 있어요|확인이 더 필요한 조건이 있어요/);
});

test('5. 맞지 않는 조건이 있으면 숨기지 않는다. 엔진이 부적합이라고 할 때만 부적합이라 쓴다', () => {
  const rich = blank();
  rich.basic.birthDate = knownField('1994-07-05');
  const result = assess(rich, { realEstateAssets: 9_999_999_999 });
  const insight = buildListingInsight(result);
  // 엔진은 다른 조건이 UNKNOWN 이면 판단을 끝내지 않는다. 그 의미를 바꾸지 않는다.
  assert.equal(result.status, 'NEEDS_MORE_INFORMATION');
  assert.equal(insight.status, 'NEEDS_MORE_INFORMATION');
  assert.ok(insight.failed > 0, '미충족 조건 수는 그대로 보여준다');
  assert.match(insight.label, /맞지 않는 조건 \d+개/);
  assert.match(insight.sentence, /\d+개 미충족/);
  // 엔진이 INELIGIBLE 이라고 한 결과만 부적합으로 표현한다.
  const blocked = buildListingInsight({ ...result, status: 'INELIGIBLE', eligible: false });
  assert.equal(blocked.status, 'INELIGIBLE');
  assert.equal(blocked.label, '현재 조건으로는 신청이 어려워요');
});

test('6. 카드·상세가 쓰는 수치는 엔진 배열 길이 그대로다', () => {
  const result = assess(blank());
  const insight = buildListingInsight(result);
  assert.equal(insight.passed, result.satisfiedConditions.length);
  assert.equal(insight.failed, result.failedConditions.length);
  assert.equal(insight.unknown, result.unknownConditions.length);
  assert.equal(insight.total, result.satisfiedConditions.length + result.failedConditions.length + result.unknownConditions.length);
  assert.equal(insight.scoring, result.scoring);
});

test('UNKNOWN 은 충족에 합산되지 않고 색·아이콘도 다르다', () => {
  const insight = buildListingInsight(assess(blank()));
  assert.notEqual(insight.unknown, 0);
  assert.equal(insight.passed + insight.failed + insight.unknown, insight.total);
  assert.notEqual(INSIGHT_VIEW.NEEDS_MORE_INFORMATION.tone, INSIGHT_VIEW.ANALYZED.tone);
  assert.notEqual(INSIGHT_VIEW.NEEDS_MORE_INFORMATION.icon, INSIGHT_VIEW.ANALYZED.icon);
});

test('7. 사용자가 답해서 풀 수 있는 항목만 입력 CTA 수로 센다', () => {
  const insight = buildListingInsight(assess(blank()));
  assert.equal(insight.answerableMissing, insight.missingLabels.length);
  for (const label of insight.missingLabels) assert.equal(typeof label, 'string');
  // 공고 기준이 없어서 생긴 항목은 입력으로 풀리지 않으므로 CTA 수에 넣지 않는다.
  assert.ok(!insight.missingLabels.some(label => insight.announcementMissingLabels.includes(label)));
});

test('여러 공급유형이 있으면 다음 행동이 있는 결과를 앞세운다', () => {
  const base = assess(blank());
  const ineligible: ApplicationAssessmentResult = { ...base, supplyType: 'firstHome', status: 'INELIGIBLE', failedConditions: [...base.failedConditions, base.unknownConditions[0]].filter(Boolean) };
  const primary = pickPrimaryInsight([ineligible, base]);
  assert.equal(primary?.supplyType, 'newlywed', '확인 필요가 부적합보다 먼저다');
  assert.equal(pickPrimaryInsight([]), null);
});

test('10. 고덕 listing 은 공식 공고 기준으로 판정된다', () => {
  const insight = buildListingInsight(assess(blank()));
  assert.equal(insight.listingId, LISTING);
  assert.equal(insight.sourceStatus, 'OFFICIAL_VERIFIED');
});

test('11. 규칙이 없는 listing 은 조용히 아무것도 만들지 않는다', async () => {
  const cache = new ListingRuleCache(async () => ({ status: 'NONE' }));
  assert.deepEqual(await cache.get('apt-없는공고'), { status: 'NONE' });
  assert.deepEqual(pickPrimaryInsight([]), null);
});

test('마감 D-day 는 날짜가 있을 때만 만든다', () => {
  assert.equal(daysUntil('2026-09-20', '2026-09-11'), 9);
  assert.equal(deadlineLabel('2026-09-20', '2026-09-11'), '마감 D-9');
  assert.equal(deadlineLabel('2026-09-11', '2026-09-11'), '오늘 마감');
  assert.equal(deadlineLabel(null, '2026-09-11'), null, '날짜가 없으면 아무것도 그리지 않는다');
  assert.equal(deadlineLabel('2026-09-01', '2026-09-11'), null, '지난 날짜는 추정하지 않는다');
});

test('규칙 조회는 listing 당 한 번만 한다', async () => {
  let calls = 0;
  const cache = new ListingRuleCache(async (listingId): Promise<RuleLookupResult> => {
    calls += 1;
    return listingId === LISTING ? { status: 'AVAILABLE', rules: godeok } : { status: 'NONE' };
  });
  await cache.get(LISTING);
  await cache.get(LISTING);
  await cache.get(LISTING);
  assert.equal(calls, 1, '같은 listing 을 다시 묻지 않는다');
  await cache.get('apt-다른공고');
  assert.equal(calls, 2);
  assert.equal(cache.snapshotStats().lookups, 2, '실제 RPC 호출 수');
  assert.equal(cache.snapshotStats().hits, 2, '캐시로 막은 호출 수');
});

test('동시에 여러 카드가 같은 listing 을 물어도 호출은 한 번이다', async () => {
  let calls = 0;
  const cache = new ListingRuleCache(async (): Promise<RuleLookupResult> => {
    calls += 1;
    await new Promise(resolve => setTimeout(resolve, 5));
    return { status: 'AVAILABLE', rules: godeok };
  });
  await Promise.all([cache.get(LISTING), cache.get(LISTING), cache.get(LISTING)]);
  assert.equal(calls, 1);
  assert.equal(cache.snapshotStats().inflightJoins, 2, '진행 중인 요청에 합류한 횟수');
});

test('listing 20개 중 보이는 카드만 물으면 호출도 그만큼이다', async () => {
  let calls = 0;
  const cache = new ListingRuleCache(async (): Promise<RuleLookupResult> => { calls += 1; return { status: 'NONE' }; });
  const listings = Array.from({ length: 20 }, (_, index) => `apt-${index}`);
  const visible = listings.slice(0, 5);
  for (const id of visible) await cache.get(id);
  assert.equal(calls, 5, '보이지 않는 15개는 부르지 않는다');
  // 스크롤해서 5개가 더 보이면 그만큼만 늘고, 이미 본 것은 다시 묻지 않는다.
  for (const id of listings.slice(0, 10)) await cache.get(id);
  assert.equal(calls, 10);
  assert.equal(cache.snapshotStats().requests, 15, '요청 15회 중 실제 호출은 10회');
  assert.equal(cache.snapshotStats().lookups, 10);
});

test('조회에 실패하면 기억하지 않고 다음에 다시 시도한다', async () => {
  let calls = 0;
  const cache = new ListingRuleCache(async () => { calls += 1; throw new Error('network'); });
  assert.deepEqual(await cache.get(LISTING), { status: 'NONE' });
  assert.deepEqual(await cache.get(LISTING), { status: 'NONE' });
  assert.equal(calls, 2, '실패는 캐시하지 않는다');
});
