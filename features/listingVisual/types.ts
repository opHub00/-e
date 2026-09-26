export type ListingLocationPreview = {
  kind: 'map_preview';
  latitude: number;
  longitude: number;
  label: '위치 미리보기';
  provenance: 'existing_listing_coordinate';
};

export type ListingVisualNone = {
  kind: 'none';
  reason: 'missing_coordinates' | 'preview_unavailable';
};

export type VerifiedListingImageCandidate = {
  url: string;
  source: {
    name: string;
    pageUrl: string;
  };
  attribution?: string;
  reusePermission: {
    basis: 'open-license' | 'written-permission';
    referenceUrl: string;
  };
};

export type ListingVerifiedImage = {
  kind: 'verified_image';
  url: string;
  source: VerifiedListingImageCandidate['source'];
  attribution?: string;
  reusePermission: VerifiedListingImageCandidate['reusePermission'];
  fallback: ListingLocationPreview | ListingVisualNone;
};

/**
 * 공식 출처에서 자동으로 찾은 대표 이미지.
 *
 * 재사용 허가를 주장하지 않는다. 그래서 verified_image 와 나눠 둔다.
 * 대신 어디서 왔는지(공고의 공식 분양 홈페이지)를 화면에 함께 적는다.
 */
export type ListingSourcedImage = {
  kind: 'sourced_image';
  url: string;
  source: VerifiedListingImageCandidate['source'];
  attribution: string;
  confidence: number;
  fallback: ListingLocationPreview | ListingVisualNone;
};

export type ListingVisual = ListingVerifiedImage | ListingSourcedImage | ListingLocationPreview | ListingVisualNone;
