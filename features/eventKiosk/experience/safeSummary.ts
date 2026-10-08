import type { ResultSummary } from '../summary.ts';

const isText = (value: unknown): value is string => typeof value === 'string';
const BUCKETS = new Set(['eligible', 'review', 'difficult']);

/**
 * 휴대폰 화면이 그리기 전에 요약 모양을 확인한다. 서버에서 받은 값이 예상과 다르면
 * 화면이 깨지는 대신 '읽을 수 없어요'로 안내한다. QR·세션 로직은 건드리지 않는다.
 */
export function isRenderableSummary(value: unknown): value is ResultSummary {
  if (!value || typeof value !== 'object') return false;
  const summary = value as Partial<ResultSummary>;
  const itemsOk = (items: unknown) => Array.isArray(items) && items.every(item =>
    item && typeof item === 'object' && isText((item as { title?: unknown }).title) && isText((item as { supply?: unknown }).supply) && BUCKETS.has((item as { bucket?: string }).bucket ?? ''));
  return summary.v === 1
    && isText(summary.date)
    && !!summary.counts && typeof summary.counts === 'object'
    && ['eligible', 'review', 'difficult'].every(key => typeof (summary.counts as Record<string, unknown>)[key] === 'number')
    && itemsOk(summary.recommended)
    && itemsOk(summary.favorites)
    && Array.isArray(summary.cautions) && summary.cautions.every(isText);
}
