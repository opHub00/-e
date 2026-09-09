import assert from 'node:assert/strict';
import {
  buildBenchmarkExplanationContext,
  buildBenchmarkExplanationFallback,
  formatBenchmarkExplanationContext,
  isBenchmarkExplanationContext,
  isSafeBenchmarkExplanation,
  parseBenchmarkExplanationContext,
} from './ai.ts';
import { buildPeerBenchmark } from './domain.ts';
import { createMinimalApplicantProfile } from '../profile/domain.ts';

const result = buildPeerBenchmark(createMinimalApplicantProfile({
  name: '민감한이름',
  age: 29,
  currentRegion: '',
  preferredRegions: [],
}));
const context = buildBenchmarkExplanationContext(result);

assert.equal(context.feature, 'peer_preparation_benchmark_v1');
assert.equal(context.dimensions.length, 8);
assert.ok(isBenchmarkExplanationContext(context));
assert.deepEqual(parseBenchmarkExplanationContext(formatBenchmarkExplanationContext(context)), context);
assert.ok(!JSON.stringify(context).includes('민감한이름'));
assert.ok(!JSON.stringify(context).includes('applicantProfile'));
assert.ok(!JSON.stringify(context).includes('29'));
assert.ok(!isBenchmarkExplanationContext({ ...context, rawProfile: { age: 29 } }));
assert.ok(!isBenchmarkExplanationContext({ ...context, dimensions: context.dimensions.slice(0, 7) }));
assert.equal(parseBenchmarkExplanationContext('{broken'), null);

assert.ok(isSafeBenchmarkExplanation('확인된 지역 정보는 유지하고, 청약통장 정보부터 채워보세요.', context));
assert.ok(!isSafeBenchmarkExplanation('또래 평균은 64점이에요.', context));
assert.ok(!isSafeBenchmarkExplanation('30대 평균보다 상위예요.', context));
assert.ok(!isSafeBenchmarkExplanation('당첨 확률은 높아요.', context));
assert.ok(!isSafeBenchmarkExplanation('신청 자격이 있습니다.', context));
assert.ok(!isSafeBenchmarkExplanation('정보 부족이라 뒤처졌어요.', context));

const fallback = buildBenchmarkExplanationFallback(context);
assert.ok(fallback.includes(result.disclaimer));
assert.ok(fallback.includes('청약통장'));
assert.doesNotMatch(fallback, /또래 평균은 \d|당첨 확률은 높|\d+\s*%/);

console.log('features/benchmark/ai: 19개 검증 통과');
