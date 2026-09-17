import { deduplicate, identity, metadataHash, manifestVersion, syncRange, buildExtractionInput, validateAnnouncement } from './domain.ts';
import { LocalIngestionStore } from './localStore.ts';
import type { AnnouncementSourceAdapter, LocalDocument, Manifest, NormalizedAnnouncement } from './model.ts';

export type SyncOptions = { now: string; from?: string; to?: string; limit: number; dryRun: boolean; recheck?: boolean };
export type SyncItem = { canonicalId: string; title: string; change: 'NEW' | 'UNCHANGED' | 'MODIFIED'; status: Manifest['status']; documentCount: number; manifestPath?: string; version?: string; errors: string[] };
const errorCode = (error: unknown) => error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : 'INGESTION_FAILED';

export async function syncAnnouncements(adapter: AnnouncementSourceAdapter, store: LocalIngestionStore,
  download: (url: string, now: string, previous?: LocalDocument) => Promise<LocalDocument>, options: SyncOptions) {
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100) throw new Error('INVALID_LIMIT');
  const release = options.dryRun ? undefined : await store.lock();
  try {
    const state = await store.load(), range = syncRange(options.now, state.cursors[adapter.source], options.from, options.to);
    const fetched = await adapter.fetchAnnouncements(range), normalizationErrors: string[] = [], normalized: NormalizedAnnouncement[] = [];
    for (const raw of fetched.records) {
      try {
        const a = adapter.normalize(raw, options.now);
        validateAnnouncement(a);
        if (a.source !== adapter.source || a.announcementDate < range.from || a.announcementDate > range.to) throw new Error('SOURCE_RANGE_MISMATCH');
        identity(a); normalized.push(a);
      } catch (error) { normalizationErrors.push(errorCode(error)); }
    }
    const deduped = deduplicate(normalized), items: SyncItem[] = [];
    // New/modified first, then oldest checked. --limit cannot permanently starve later announcements.
    const rank = (a: NormalizedAnnouncement) => {
      const old = state.entries[identity(a).canonicalId];
      return !old || old.metadataHash !== metadataHash(a) ? '' : old.lastCheckedAt;
    };
    const candidates = deduped.records.sort((a, b) => rank(a).localeCompare(rank(b)) || identity(a).canonicalId.localeCompare(identity(b).canonicalId)).slice(0, options.limit);
    for (const a of candidates) {
      const id = identity(a), old = state.entries[id.canonicalId], hash = metadataHash(a), errors: string[] = [];
      let status: Manifest['status'] = 'DISCOVERED', documents: LocalDocument[] = [], urls: string[] = [];
      let change: SyncItem['change'] = !old ? 'NEW' : hash === old.metadataHash ? 'UNCHANGED' : 'MODIFIED';
      try {
        const age = old ? Date.parse(options.now) - Date.parse(old.lastCheckedAt) : Infinity;
        if (!options.dryRun && !options.recheck && change === 'UNCHANGED' && old?.manifest.status === 'DOWNLOADED' && age >= 0 && age < 24 * 3600000 &&
          (await Promise.all(old.manifest.documents.map(d => store.cached(d)))).every(Boolean)) {
          items.push({ canonicalId: id.canonicalId, title: a.title, change, status: 'DOWNLOADED', documentCount: old.manifest.documents.length, manifestPath: old.manifestPath, version: old.manifest.version, errors });
          continue;
        }
        urls = [...new Set(await adapter.discoverDocuments(a))].sort();
        if (urls.length > 5) throw new Error('TOO_MANY_ATTACHMENTS');
        if (urls.length) status = 'DOCUMENT_FOUND';
        if (!options.dryRun) {
          for (const url of urls) {
            try { documents.push(await download(url, options.now, old?.manifest.documents.find(d => d.sourceUrl === url))); }
            catch (error) { errors.push(errorCode(error)); }
          }
          status = errors.length ? 'FAILED' : documents.length ? 'DOWNLOADED' : 'DISCOVERED';
        }
      } catch (error) { errors.push(errorCode(error)); status = 'FAILED'; }
      const version = manifestVersion(hash, documents, status, errors);
      if (old && !options.dryRun && status === 'DOWNLOADED' && version !== old.manifest.version) change = 'MODIFIED';
      const item: SyncItem = { canonicalId: id.canonicalId, title: a.title, change, status, documentCount: options.dryRun ? urls.length : documents.length, errors };
      if (!options.dryRun) {
        const manifest: Manifest = { schemaVersion: 1, ...id, version, metadataHash: hash, sourceStatusCandidate: 'REFERENCE', announcement: a, documents, status, errors };
        item.version = version; item.manifestPath = await store.saveManifest(manifest);
        if (status === 'DOWNLOADED') await store.immutable(`announcements/${id.canonicalId}/extraction/${version}.json`, Buffer.from(JSON.stringify(buildExtractionInput(manifest), null, 2) + '\n'), false);
        state.entries[id.canonicalId] = { metadataHash: hash, lastCheckedAt: options.now, manifestPath: item.manifestPath, manifest };
        // Durable progress per announcement; a later failure does not lose successful work.
        await store.save(state);
      }
      items.push(item);
    }
    const complete = fetched.complete && !normalizationErrors.length && !deduped.conflicts.length && candidates.length === deduped.records.length && items.every(i => i.status !== 'FAILED');
    const previousCursor = state.cursors[adapter.source];
    const cursorAdvanced = !options.dryRun && complete && (!previousCursor || (range.from <= previousCursor && range.to > previousCursor));
    // Explicit backfills never rewind the cursor or skip an unscanned gap.
    if (cursorAdvanced) { state.cursors[adapter.source] = range.to; await store.save(state); }
    return { source: adapter.source, dryRun: options.dryRun, range, fetched: fetched.records.length, normalized: normalized.length,
      duplicates: normalized.length - deduped.records.length - deduped.conflicts.length, conflicts: deduped.conflicts,
      normalizationErrors, complete, cursorAdvanced, items };
  } finally { await release?.(); }
}
