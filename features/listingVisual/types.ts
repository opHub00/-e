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

export type ListingVisual = ListingVerifiedImage | ListingLocationPreview | ListingVisualNone;
