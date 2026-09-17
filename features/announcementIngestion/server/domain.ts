import { createHash } from 'node:crypto';
import type { FetchRange, IngestionState, Manifest, NormalizedAnnouncement } from './model.ts';

export const sha256 = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, ordered(v)]));
  return value;
}
export const contentHash = (value: unknown) => sha256(JSON.stringify(ordered(value)));
export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function canonicalUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('UNSAFE_URL');
  for (const key of url.searchParams.keys()) if (/token|secret|servicekey|api[_-]?key|password|authorization|signature|credential/i.test(key)) throw new Error('CREDENTIAL_URL');
  url.hash = ''; url.searchParams.sort();
  return url.href;
}
export function identity(a: NormalizedAnnouncement): { canonicalId: string; identityBasis: Manifest['identityBasis'] } {
  let key: unknown, identityBasis: Manifest['identityBasis'];
  if (a.externalId) { key = ['external', a.externalId]; identityBasis = 'EXTERNAL_ID'; }
  else if (a.housingManagementNumber) { key = ['management', a.housingManagementNumber]; identityBasis = 'MANAGEMENT_NUMBER'; }
  else if (a.detailUrl) { key = ['url', canonicalUrl(a.detailUrl)]; identityBasis = 'SOURCE_URL'; }
  else {
    if (!a.publisher) throw new Error('INSUFFICIENT_IDENTITY');
    key = ['title', a.title.normalize('NFKC').trim().replace(/\s+/g, ' '), a.publisher.normalize('NFKC').trim(), a.announcementDate];
    identityBasis = 'TITLE_FALLBACK';
  }
  // Namespace all identities. A management number alone does not merge different publishers/sources.
  return { canonicalId: contentHash([a.source, key]), identityBasis };
}
export function metadataHash(a: NormalizedAnnouncement): string {
  const { retrievedAt: _retrieved, ...metadata } = a;
  return contentHash(metadata);
}
export function deduplicate(records: NormalizedAnnouncement[]) {
  const unique = new Map<string, NormalizedAnnouncement>(), conflicts = new Set<string>();
  for (const a of records) {
    const { canonicalId: id } = identity(a), prior = unique.get(id);
    if (prior && metadataHash(prior) !== metadataHash(a)) conflicts.add(id);
    else unique.set(id, a);
  }
  for (const id of conflicts) unique.delete(id);
  return { records: [...unique.values()], conflicts: [...conflicts] };
}
export function syncRange(now: string, cursor?: string, from?: string, to?: string): FetchRange {
  if (!Number.isFinite(Date.parse(now))) throw new Error('INVALID_CLOCK');
  const end = to ?? new Date(Date.parse(now) + 9 * 3600000).toISOString().slice(0, 10);
  const base = cursor && cursor < end ? cursor : end;
  const start = from ?? new Date(Date.parse(base) - 6 * 86400000).toISOString().slice(0, 10);
  if (!validDate(start) || !validDate(end) || start > end || Date.parse(end) - Date.parse(start) > 90 * 86400000) throw new Error('INVALID_DATE_RANGE');
  return { from: start, to: end };
}
const hash = (s: unknown): s is string => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const nullableText = (s: unknown) => s === null || (typeof s === 'string' && s.length > 0 && s.length <= 8000);
const timestamp = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(s) && Number.isFinite(Date.parse(s));
export function validateAnnouncement(value: unknown): asserts value is NormalizedAnnouncement {
  const a = value as NormalizedAnnouncement;
  if (!a || typeof a.source !== 'string' || !/^[A-Z][A-Z0-9_]{0,39}$/.test(a.source) || typeof a.title !== 'string' || !a.title.trim() || a.title.length > 1000 || !validDate(a.announcementDate) || !timestamp(a.retrievedAt)) throw new Error('INVALID_ANNOUNCEMENT');
  if (![a.externalId, a.housingManagementNumber, a.publisher, a.detailUrl].every(nullableText) || !a.region || ![a.region.code, a.region.name].every(nullableText) || !a.rawMetadata || typeof a.rawMetadata !== 'object' || Array.isArray(a.rawMetadata) || !Array.isArray(a.documentUrls)) throw new Error('INVALID_METADATA');
  if (Object.entries(a.rawMetadata).some(([k, v]) => /token|secret|servicekey|api[_-]?key|password|authorization|credential/i.test(k) || !(v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= 8000)))) throw new Error('INVALID_RAW_METADATA');
  if (a.documentUrls.some(url => typeof url !== 'string' || !url)) throw new Error('INVALID_SOURCE_URL');
  for (const url of [a.detailUrl, ...a.documentUrls].filter((s): s is string => s !== null)) {
    if (typeof url !== 'string' || url.length > 8000) throw new Error('INVALID_SOURCE_URL');
    canonicalUrl(url);
  }
  identity(a);
}
export function manifestVersion(metadata: string, documents: Manifest['documents'], status: Manifest['status'], errors: string[]): string {
  return contentHash({ metadata, documents: documents.map(d => [d.sourceUrl, d.sha256]).sort(), status, errors });
}
export function validateManifest(value: unknown): asserts value is Manifest {
  const m = value as Manifest;
  if (!m || m.schemaVersion !== 1 || m.sourceStatusCandidate !== 'REFERENCE' || !hash(m.canonicalId) || !hash(m.metadataHash) || !hash(m.version)) throw new Error('INVALID_MANIFEST');
  const a = m.announcement;
  validateAnnouncement(a);
  if (identity(a).canonicalId !== m.canonicalId || identity(a).identityBasis !== m.identityBasis || metadataHash(a) !== m.metadataHash) throw new Error('MANIFEST_IDENTITY_MISMATCH');
  if (!['DISCOVERED', 'DOCUMENT_FOUND', 'DOWNLOADED', 'FAILED'].includes(m.status) || !Array.isArray(m.errors) || m.errors.some(e => typeof e !== 'string' || !/^[A-Z0-9_:-]+$/.test(e))) throw new Error('INVALID_STATUS');
  if (!Array.isArray(m.documents) || m.documents.length > 5) throw new Error('INVALID_DOCUMENTS');
  for (const d of m.documents) {
    if (!d || !hash(d.sha256) || !Number.isSafeInteger(d.size) || d.size <= 0 || d.size > 50_000_000 || !timestamp(d.retrievedAt) || ![d.etag, d.lastModified].every(v => v === null || (typeof v === 'string' && v.length <= 2048 && !/[\r\n]/.test(v)))) throw new Error('INVALID_DOCUMENT');
    const extension = d.mimeType === 'application/pdf' ? 'pdf' : d.mimeType === 'application/x-hwp' ? 'hwp' : d.mimeType === 'application/hwp+zip' ? 'hwpx' : null;
    if (!extension || d.localPath !== `blobs/${d.sha256}.${extension}`) throw new Error('INVALID_DOCUMENT_PATH');
    if (!nullableText(d.sourceUrl)) throw new Error('INVALID_DOCUMENT_URL');
    if (d.sourceUrl !== null) canonicalUrl(d.sourceUrl);
  }
  if (new Set(m.documents.map(d => d.sourceUrl ?? d.sha256)).size !== m.documents.length) throw new Error('DUPLICATE_DOCUMENT');
  if (m.status === 'DOWNLOADED' && (!m.documents.length || m.errors.length)) throw new Error('NOT_EXTRACTION_READY');
  if (manifestVersion(m.metadataHash, m.documents, m.status, m.errors) !== m.version) throw new Error('VERSION_MISMATCH');
}
export function validateState(value: unknown): asserts value is IngestionState {
  const s = value as IngestionState;
  if (!s || s.schemaVersion !== 1 || !s.entries || !s.cursors || Array.isArray(s.entries) || Array.isArray(s.cursors)) throw new Error('INVALID_STATE');
  for (const cursor of Object.values(s.cursors)) if (typeof cursor !== 'string' || !validDate(cursor)) throw new Error('INVALID_CURSOR');
  for (const [id, entry] of Object.entries(s.entries)) {
    validateManifest(entry.manifest);
    if (id !== entry.manifest.canonicalId || entry.metadataHash !== entry.manifest.metadataHash || !Number.isFinite(Date.parse(entry.lastCheckedAt)) || entry.manifestPath !== `announcements/${id}/versions/${entry.manifest.version}.json`) throw new Error('INVALID_STATE_ENTRY');
  }
}
export function buildExtractionInput(manifest: Manifest) {
  validateManifest(manifest);
  if (manifest.status !== 'DOWNLOADED') throw new Error('NOT_EXTRACTION_READY');
  return { schemaVersion: 1, jobKey: contentHash([manifest.canonicalId, manifest.version]), canonicalId: manifest.canonicalId,
    version: manifest.version, sourceStatusCandidate: 'REFERENCE' as const, requiresHumanReview: true,
    announcement: manifest.announcement, documents: manifest.documents.map(({ localPath, sha256, mimeType, size, sourceUrl }) => ({ localPath, sha256, mimeType, size, sourceUrl })) };
}
