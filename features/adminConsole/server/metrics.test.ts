import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildMetricTrend, parseMetricWindowQuery } from './metrics.ts';

test('trend window validates dates and computes current/previous rates from real event rows', () => {
  const query = parseMetricWindowQuery({ from: '2026-10-17', to: '2026-10-18', bucket: 'day', previousPeriod: '1' });
  assert.ok(query);
  const result = buildMetricTrend([
    { created_at: '2026-10-15T03:00:00Z', status: 'NEEDS_USER_INPUT' },
    { created_at: '2026-10-17T03:00:00Z', status: 'COMPLETE' },
    { created_at: '2026-10-18T03:00:00Z', status: 'NEEDS_USER_INPUT' },
  ], [
    { created_at: '2026-10-15T03:00:00Z', mode: 'fallback' },
    { created_at: '2026-10-17T03:00:00Z', mode: 'llm' },
    { created_at: '2026-10-18T03:00:00Z', mode: 'fallback' },
  ], query);
  assert.equal(result.current.assessments, 2);
  assert.equal(result.current.needsUserInputRate, 0.5);
  assert.equal(result.current.fallbackRate, 0.5);
  assert.equal(result.previous?.needsUserInputRate, 1);
  assert.equal(result.previous?.fallbackRate, 1);
  assert.deepEqual(result.buckets.map(item => item.key), ['2026-10-17', '2026-10-18']);
  assert.equal(parseMetricWindowQuery({ from: '2026-02-30', to: '2026-03-01' }), null);
  assert.equal(parseMetricWindowQuery({ from: '2026-10-18', to: '2026-10-17' }), null);
});
