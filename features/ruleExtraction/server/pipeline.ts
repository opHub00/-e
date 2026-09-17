import { readFile, stat, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { LocalIngestionStore } from '../../announcementIngestion/server/localStore.ts';
import { validateManifest, sha256 } from '../../announcementIngestion/server/domain.ts';
import { documentParsers } from './parser.ts';
import { validateParsedDocument, type ParsedDocument } from './parsedDocument.ts';
import { buildExtractionPlan, extractObservations, MockRuleExtractor } from './extraction.ts';
import { validateCandidatePackage } from './candidate.ts';

export async function processAnnouncement(options: { root: string; id: string; python: string; dryRun?: boolean; extract?: boolean }) {
  if (!/^[a-f0-9]{64}$/.test(options.id)) throw new Error('INVALID_CANONICAL_ID');
  const store = new LocalIngestionStore(options.root), state = await store.load();
  const manifest = state.entries[options.id]?.manifest;
  if (!manifest) throw new Error('ANNOUNCEMENT_NOT_FOUND'); validateManifest(manifest);
  if (manifest.status !== 'DOWNLOADED' || !manifest.documents.length) throw new Error('DOCUMENT_NOT_READY');
  if (manifest.documents.length > 5) throw new Error('BATCH_LIMIT');
  for (const doc of manifest.documents) {
    if (!await store.cached(doc)) throw new Error('DOCUMENT_HASH_MISMATCH');
  }
  if (options.dryRun) return { dryRun: true, id: options.id, documents: manifest.documents.length, writes: 0, aiCalls: 0 };
  const unlock = await store.lock();
  try {
    const results = [];
    for (const doc of manifest.documents) {
      const folder = `announcements/${options.id}/parsed/${doc.sha256}/document-parser-v1`;
      const parsedPath = `${folder}/document.json`;
      let parsed: ParsedDocument;
      try {
        if ((await stat(store.path(parsedPath))).size > 64_000_000) throw new Error('PARSER_OUTPUT_LIMIT');
        parsed = JSON.parse(await readFile(store.path(parsedPath), 'utf8')); validateParsedDocument(parsed);
        if (parsed.sha256 !== doc.sha256 || parsed.mimeType !== doc.mimeType || parsed.parserVersion !== 'document-parser-v1') throw new Error('PARSED_CACHE_MISMATCH');
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
        const parser = documentParsers(options.python).find(p => p.supports(doc)); if (!parser) throw new Error('UNSUPPORTED_DOCUMENT');
        const temporary = store.path(`parser-${randomUUID()}.tmp`);
        try { parsed = await parser.parse(doc, store.path(doc.localPath), temporary); }
        finally { await unlink(temporary).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
        await store.immutable(parsedPath, Buffer.from(JSON.stringify(parsed)));
      }
      await store.immutable(`${folder}/quality-report.json`, Buffer.from(JSON.stringify(parsed.quality, null, 2)));
      if (parsed.quality.extractionAllowed) {
        const plan = buildExtractionPlan(parsed);
        const base = `announcements/${options.id}/extraction/${manifest.version}/${doc.sha256}/assessment-rule-extraction-v1`;
        await store.immutable(`${base}/plan.json`, Buffer.from(JSON.stringify(plan)));
        await store.immutable(`${base}/observations.json`, Buffer.from(JSON.stringify(extractObservations(parsed))));
        if (options.extract) {
          const candidate = await new MockRuleExtractor().extract({ manifest, document: parsed });
          validateCandidatePackage(candidate, parsed, { canonicalId: manifest.canonicalId, title: manifest.announcement.title, announcementDate: manifest.announcement.announcementDate });
          await store.immutable(`${base}/candidate-rules.json`, Buffer.from(JSON.stringify(candidate, null, 2)));
        }
      }
      results.push({ sha256: doc.sha256, status: parsed.status, blocks: parsed.blocks.length, tables: parsed.tables.length,
        extractionAllowed: parsed.quality.extractionAllowed, parsedPath, artifactHash: sha256(Buffer.from(JSON.stringify(parsed))) });
    }
    return { id: options.id, results, aiCalls: 0, reviewStatus: 'REVIEW_REQUIRED' };
  } finally { await unlock(); }
}
