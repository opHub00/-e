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

/** 갤러리 한 장. 무엇을 찍은 그림인지 함께 들고 다녀 화면이 순서를 지킬 수 있게 한다. */
export type ListingGalleryImage = {
  url: string;
  /** 외관·단지 전경·투시도·조경·커뮤니티 중 하나. */
  subjectType: string;
  label: string;
};

/**
 * 공식 출처에서 자동으로 찾은 대표 이미지와 갤러리.
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
  /** 대표를 맨 앞에 둔 목록. 한 장뿐이면 화면은 갤러리를 그리지 않는다. */
  gallery: ListingGalleryImage[];
  fallback: ListingLocationPreview | ListingVisualNone;
};

export type ListingVisual = ListingVerifiedImage | ListingSourcedImage | ListingLocationPreview | ListingVisualNone;
