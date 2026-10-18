export type MetricBucket = 'day' | 'week' | 'month';
export type MetricWindowQuery = { from: string; to: string; bucket: MetricBucket; previousPeriod: boolean };
export type MetricTotals = { assessments: number; needsUserInput: number; needsUserInputRate: number | null;
  aiRequests: number; fallback: number; fallbackRate: number | null };
export type MetricTrend = { window: MetricWindowQuery; current: MetricTotals; previous: MetricTotals | null;
  buckets: Array<{ key: string; totals: MetricTotals }> };

const day = /^\d{4}-\d{2}-\d{2}$/;
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const duration = 86_400_000;
const empty = (): MetricTotals => ({ assessments: 0, needsUserInput: 0, needsUserInputRate: null, aiRequests: 0, fallback: 0, fallbackRate: null });
const finish = (value: MetricTotals): MetricTotals => ({ ...value,
  needsUserInputRate: value.assessments ? value.needsUserInput / value.assessments : null,
  fallbackRate: value.aiRequests ? value.fallback / value.aiRequests : null });

export function parseMetricWindowQuery(raw: Record<string, unknown>): MetricWindowQuery | null {
  const from = String(raw.from ?? ''), to = String(raw.to ?? ''), bucket = String(raw.bucket ?? 'day');
  if (!day.test(from) || !day.test(to) || !['day', 'week', 'month'].includes(bucket)) return null;
  const start = date(from), end = date(to);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || start.toISOString().slice(0, 10) !== from || end.toISOString().slice(0, 10) !== to
    || end < start || end.valueOf() - start.valueOf() > 366 * duration) return null;
  if (raw.previousPeriod !== undefined && !['true', 'false', '1', '0'].includes(String(raw.previousPeriod))) return null;
  return { from, to, bucket: bucket as MetricBucket, previousPeriod: raw.previousPeriod === 'true' || raw.previousPeriod === '1' };
}

const bucketKey = (iso: string, bucket: MetricBucket): string => {
  if (bucket === 'month') return iso.slice(0, 7);
  if (bucket === 'day') return iso.slice(0, 10);
  const value = new Date(iso);
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return value.toISOString().slice(0, 10);
};

export function buildMetricTrend(
  assessments: readonly { created_at: unknown; status: unknown }[],
  ai: readonly { created_at: unknown; mode: unknown }[],
  window: MetricWindowQuery,
): MetricTrend {
  const start = date(window.from).valueOf(), end = date(window.to).valueOf() + duration;
  const span = end - start;
  const collect = (from: number, to: number) => {
    const totals = empty();
    for (const row of assessments) {
      const at = Date.parse(String(row.created_at));
      if (at < from || at >= to) continue;
      totals.assessments++;
      if (row.status === 'NEEDS_USER_INPUT') totals.needsUserInput++;
    }
    for (const row of ai) {
      const at = Date.parse(String(row.created_at));
      if (at < from || at >= to) continue;
      totals.aiRequests++;
      if (row.mode === 'fallback') totals.fallback++;
    }
    return finish(totals);
  };
  const keys = new Map<string, MetricTotals>();
  for (const row of assessments) {
    const at = Date.parse(String(row.created_at));
    if (at < start || at >= end) continue;
    const key = bucketKey(new Date(at).toISOString(), window.bucket), value = keys.get(key) ?? empty();
    value.assessments++;
    if (row.status === 'NEEDS_USER_INPUT') value.needsUserInput++;
    keys.set(key, value);
  }
  for (const row of ai) {
    const at = Date.parse(String(row.created_at));
    if (at < start || at >= end) continue;
    const key = bucketKey(new Date(at).toISOString(), window.bucket), value = keys.get(key) ?? empty();
    value.aiRequests++;
    if (row.mode === 'fallback') value.fallback++;
    keys.set(key, value);
  }
  return { window, current: collect(start, end), previous: window.previousPeriod ? collect(start - span, start) : null,
    buckets: [...keys].sort(([a], [b]) => a.localeCompare(b)).map(([key, totals]) => ({ key, totals: finish(totals) })) };
}
