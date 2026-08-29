import type { ListingProviderPayload } from './ListingProvider.ts';
import { parseOpenApiListingPayload } from './OpenApiListingAdapter.ts';

type ApplyHomeEdgePayload = {
  records?: unknown;
  fetchedAt?: unknown;
  statusAsOf?: unknown;
  source?: unknown;
};

export function parseApplyHomeListingPayload(payload: unknown): ListingProviderPayload {
  if (!isRecord(payload)) return { records: [] };
  const edge = payload as ApplyHomeEdgePayload;
  const parsed = parseOpenApiListingPayload(
    { data: Array.isArray(edge.records) ? edge.records : [] },
    readTimestamp(edge.fetchedAt),
  );
  return {
    ...parsed,
    statusAsOf: readTimestamp(edge.statusAsOf),
  };
}

function readTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
