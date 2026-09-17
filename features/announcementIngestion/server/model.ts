// Node/server-only ingestion contracts. Never imported by the Expo runtime.
export type RawAnnouncement = Readonly<Record<string, unknown>>;
export type NormalizedAnnouncement = {
  source: string;
  externalId: string | null;
  housingManagementNumber: string | null;
  title: string;
  publisher: string | null;
  announcementDate: string;
  region: { code: string | null; name: string | null };
  detailUrl: string | null;
  documentUrls: string[];
  rawMetadata: Record<string, string | number | boolean | null>;
  retrievedAt: string;
};
export type FetchRange = { from: string; to: string };
export interface AnnouncementSourceAdapter {
  source: string;
  fetchAnnouncements(range: FetchRange): Promise<{ records: RawAnnouncement[]; complete: boolean }>;
  normalize(raw: RawAnnouncement, retrievedAt: string): NormalizedAnnouncement;
  discoverDocuments(announcement: NormalizedAnnouncement): Promise<string[]>;
}
export type LocalDocument = {
  sourceUrl: string | null;
  localPath: string;
  sha256: string;
  size: number;
  mimeType: string;
  retrievedAt: string;
  etag: string | null;
  lastModified: string | null;
};
export type IngestionStatus = 'DISCOVERED' | 'DOCUMENT_FOUND' | 'DOWNLOADED' | 'FAILED';
export type Manifest = {
  schemaVersion: 1;
  canonicalId: string;
  identityBasis: 'EXTERNAL_ID' | 'MANAGEMENT_NUMBER' | 'SOURCE_URL' | 'TITLE_FALLBACK';
  version: string;
  metadataHash: string;
  sourceStatusCandidate: 'REFERENCE';
  announcement: NormalizedAnnouncement;
  documents: LocalDocument[];
  status: IngestionStatus;
  errors: string[];
};
export type StateEntry = { metadataHash: string; lastCheckedAt: string; manifestPath: string; manifest: Manifest };
export type IngestionState = { schemaVersion: 1; cursors: Record<string, string>; entries: Record<string, StateEntry> };
export const emptyState = (): IngestionState => ({ schemaVersion: 1, cursors: {}, entries: {} });
