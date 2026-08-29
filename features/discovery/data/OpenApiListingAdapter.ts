import type { ListingProviderPayload } from './ListingProvider.ts';

/**
 * 청약홈 OpenAPI의 JSON envelope만 푼다. HTTP 호출·API key 처리는 향후 provider 책임이다.
 * 공공데이터포털의 response.body.items.item 형식과 data 배열 형식을 모두 허용한다.
 */
export function parseOpenApiListingPayload(
  payload: unknown,
  fetchedAt?: string,
): ListingProviderPayload {
  return {
    records: extractRecords(payload),
    fetchedAt,
  };
}

function extractRecords(payload: unknown): readonly unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];

  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.item)) return payload.item;

  const response = asRecord(payload.response);
  const body = asRecord(response?.body);
  const items = asRecord(body?.items);
  const nestedItem = items?.item;
  if (Array.isArray(nestedItem)) return nestedItem;
  if (isRecord(nestedItem)) return [nestedItem];

  return [];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return isRecord(value) ? value : null;
}
