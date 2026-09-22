import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildSamdoReviewSeed } from './buildSamdoReviewSeed.ts';
import { SAMDO_STAGING_REVIEW_SEED } from './samdoReviewSeed.generated.ts';
import { decodeReviewSeedAnnotation } from '../seed/annotations.ts';
import { buildAssessmentReviewSeed } from '../seed/buildAssessmentReviewSeed.ts';
import { CRITICAL_CATEGORIES } from '../server/types.ts';

const source = JSON.parse(await readFile(new URL('../../../data/assessment-rules/samdo-2026-v1.7.json', import.meta.url), 'utf8'));
const annotation = decodeReviewSeedAnnotation(JSON.parse(await readFile(new URL('../../../data/assessment-rules/samdo-2026-v1.7.review-annotations.json', import.meta.url), 'utf8')));
let checks = 0;
const check = (fn: () => void) => { fn(); checks += 1; };

const seed = buildAssessmentReviewSeed(source, annotation);

/*
  The activation gate refuses while any materialized rule lacks a review row.
  A partial seed can therefore never reach ACTIVATION_ELIGIBLE, which is what
  the curated fixture did on staging.
*/
check(() => {
  assert.equal(seed.rules.length, source.rules.length, '모든 source rule 이 review candidate 를 가져야 한다');
  const seeded = seed.rules.map(rule => rule.ruleId).sort();
  const expected = source.rules.map((rule: { ruleKey: string }) => rule.ruleKey).sort();
  assert.deepEqual(seeded, expected);
  assert.equal(new Set(seeded).size, seeded.length, '중복 candidate 없음');
});

// 테스트/개발용 fixture 는 계속 좁은 범위를 유지한다. 두 seed 는 서로 다른 목적이다.
check(() => {
  assert.equal(buildSamdoReviewSeed(source, annotation).rules.length, 7);
  assert.ok(seed.rules.length > buildSamdoReviewSeed(source, annotation).rules.length);
});

// 규칙 정체성과 근거는 source 에서 그대로 온다. 생성기가 새로 만들어내지 않는다.
check(() => {
  for (const rule of source.rules) {
    const candidate = seed.rules.find(item => item.ruleId === rule.ruleKey);
    assert.ok(candidate, `missing ${rule.ruleKey}`);
    const snapshot = candidate.originalCandidate;
    assert.equal(snapshot.ruleKey, rule.ruleKey);
    assert.equal(snapshot.label, rule.config.label);
    assert.equal(snapshot.supplyType, rule.supplyType);
    assert.equal(snapshot.stage, rule.stage);
    assert.equal(snapshot.evidence.length, 1);
    assert.equal(snapshot.evidence[0].id, rule.evidence.id);
    assert.equal(snapshot.evidence[0].documentId, rule.evidence.documentId);
    assert.ok(CRITICAL_CATEGORIES.includes(snapshot.category));
  }
});

// 점수표가 없는 패키지에서 점수를 지어내지 않는다.
check(() => {
  assert.ok(seed.rules.every(rule => rule.originalCandidate.score === null && rule.originalCandidate.maxScore === null));
});

// 승인 상태를 자동으로 부여하지 않는다. 모든 candidate 는 정상 lifecycle 을 거쳐야 한다.
check(() => {
  for (const rule of seed.rules) {
    assert.ok(['AUTO_SAFE_CANDIDATE', 'REVIEW_REQUIRED'].includes(rule.candidateStatus));
    assert.ok(!('reviewStatus' in rule), 'seed 는 review 결과를 담지 않는다');
    assert.ok(!('reviewedAt' in rule));
  }
});

// 같은 입력이면 같은 출력. 카테고리 배정이 순서나 실행 시점에 흔들리지 않는다.
check(() => {
  assert.deepEqual(buildAssessmentReviewSeed(source, annotation), seed);
  // 이미 staging 에 들어간 75개 candidate 와 한 글자도 다르지 않다.
  assert.equal(JSON.stringify(seed), JSON.stringify(SAMDO_STAGING_REVIEW_SEED));
});

// 예외 규칙은 EXCEPTION 으로 분류되고, 거주 규칙은 같은 공급유형의 해외체류 예외와 연결된다.
check(() => {
  const overseas = seed.rules.filter(rule => rule.ruleId.endsWith('.overseas'));
  assert.ok(overseas.length > 0);
  assert.ok(overseas.every(rule => rule.originalCandidate.category === 'EXCEPTION' && !rule.required));
  for (const rule of seed.rules.filter(item => item.ruleId.endsWith('.residence'))) {
    assert.deepEqual(rule.originalCandidate.relatedExceptionRuleIds, [`${rule.originalCandidate.supplyType}.overseas`]);
  }
});

// 세대 기준 규칙은 세대 scope 로 남는다.
check(() => {
  assert.equal(seed.rules.find(rule => rule.ruleId === 'newlywed.assets')?.originalCandidate.scope, 'HOUSEHOLD');
  assert.equal(seed.rules.find(rule => rule.ruleId === 'youth.assets')?.originalCandidate.scope, 'APPLICANT');
});

// requiredCategories 는 required candidate 에서만 나온다.
check(() => {
  assert.ok(seed.requiredCategories.length > 0);
  for (const entry of seed.requiredCategories) {
    assert.ok(seed.rules.some(rule => rule.required
      && rule.originalCandidate.supplyType === entry.supplyType
      && rule.originalCandidate.category === entry.category));
  }
});

// 매핑되지 않은 rule key 는 임의 분류 대신 build 를 멈춘다.
check(() => {
  const broken = { ...source, rules: [...source.rules, { ...source.rules[0], ruleKey: 'youth.unmappedSegment' }] };
  assert.throws(() => buildAssessmentReviewSeed(broken, annotation), /REVIEW_RULE_CATEGORY_UNMAPPED/);
});

console.log(`features/assessmentRuleReview/stagingReviewSeed: ${checks}개 검증 통과`);
