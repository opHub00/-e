import type { Listing } from '../types.ts';

export type ListingSourceKind = 'mock' | 'openapi' | 'applyhome' | 'fixture';

export type ListingDataSource = {
  id: string;
  kind: ListingSourceKind;
  label: string;
};

/** Provider가 반환하는 원본 한 행. 필드명과 값 형식은 신뢰하지 않는다. */
export type RawListingRecord = Readonly<Record<string, unknown>>;

export type ListingProviderPayload = {
  records: readonly unknown[];
  fetchedAt?: string;
  /** Demo/fixture처럼 상태 계산 기준일을 고정해야 할 때만 사용한다. */
  statusAsOf?: string;
};

export type ListingProviderRequest = {
  signal?: AbortSignal;
};

/** 네트워크, fixture 등 데이터 출처를 앱 내부 모델과 분리하는 경계. */
export interface ListingProvider {
  readonly source: ListingDataSource;
  fetchListings(request?: ListingProviderRequest): Promise<ListingProviderPayload>;
}

export type ListingValidationIssue = {
  recordIndex: number;
  field: string;
  code:
    | 'invalid-record'
    | 'missing-value'
    | 'invalid-value'
    | 'unsupported-region'
    | 'duplicate-id';
  severity: 'warning' | 'error';
  message: string;
};

export type ListingDataset = {
  listings: Listing[];
  source: ListingDataSource;
  fetchedAt: string;
  statusCalculatedAt: string;
  isFallback: boolean;
  fallbackReason?: string;
  cacheStatus: 'miss' | 'hit';
  validationIssues: ListingValidationIssue[];
};
