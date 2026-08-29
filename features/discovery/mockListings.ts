import { mockListingProvider } from './data/MockListingProvider.ts';
import { normalizeListingBatch } from './data/normalizeListing.ts';

/**
 * 기존 UI를 변경하지 않기 위한 동기 snapshot façade.
 * 원본 fixture는 MockListingProvider 뒤에 있고 모든 행은 V2 normalizer를 통과한다.
 */
const mockPayload = mockListingProvider.getFixturePayload();
const mockDataset = normalizeListingBatch(mockPayload.records, {
  source: mockListingProvider.source,
  fetchedAt: mockPayload.fetchedAt!,
  referenceDate: new Date(mockPayload.statusAsOf!),
});

if (mockDataset.listings.length === 0) {
  throw new Error('MockListingProvider returned no usable listings');
}

export const discoveryListings = mockDataset.listings;
export const discoveryListingValidationIssues = mockDataset.issues;
