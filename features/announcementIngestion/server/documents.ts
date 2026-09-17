import { sha256 } from './domain.ts';
import { allowedDocumentUrl, type IngestionHttp } from './http.ts';
import type { LocalDocument } from './model.ts';
import type { LocalIngestionStore } from './localStore.ts';

export function documentFormat(bytes: Uint8Array): { extension: string; mimeType: string } {
  const b = Buffer.from(bytes);
  if (b.subarray(0, 5).toString() === '%PDF-') return { extension: 'pdf', mimeType: 'application/pdf' };
  if (b.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex')) && b.includes(Buffer.from('HWP Document File'))) return { extension: 'hwp', mimeType: 'application/x-hwp' };
  if (b.subarray(0, 4).equals(Buffer.from('504b0304', 'hex')) && b.includes(Buffer.from('Contents/content.hpf')) && b.includes(Buffer.from('mimetype'))) return { extension: 'hwpx', mimeType: 'application/hwp+zip' };
  // Transport signature checks, not a full PDF/HWP parser or malware validator. Never execute/unzip documents here.
  throw new Error('UNSUPPORTED_DOCUMENT_CONTENT');
}
export async function storeDocument(store: LocalIngestionStore, bytes: Uint8Array, now: string, sourceUrl: string | null, headers = new Headers()): Promise<LocalDocument> {
  if (!bytes.length || bytes.length > 50_000_000) throw new Error('INVALID_DOCUMENT_SIZE');
  const format = documentFormat(bytes), digest = sha256(bytes), localPath = `blobs/${digest}.${format.extension}`;
  await store.immutable(localPath, bytes);
  return { sourceUrl, localPath, sha256: digest, size: bytes.length, mimeType: format.mimeType, retrievedAt: now,
    etag: headers.get('etag'), lastModified: headers.get('last-modified') };
}
export async function downloadDocument(http: IngestionHttp, store: LocalIngestionStore, sourceUrl: string, now: string, previous?: LocalDocument) {
  const url = allowedDocumentUrl(sourceUrl), headers: Record<string, string> = {};
  const verifiedCache = previous && await store.cached(previous);
  if (verifiedCache) {
    if (previous.etag) headers['If-None-Match'] = previous.etag;
    if (previous.lastModified) headers['If-Modified-Since'] = previous.lastModified;
  }
  const response = await http.get(url, headers, 50_000_000);
  if (response.status === 304) {
    if (!verifiedCache) throw new Error('INVALID_NOT_MODIFIED');
    return previous!;
  }
  return storeDocument(store, response.bytes, now, url, response.headers);
}
