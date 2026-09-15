/** Server/tooling only. Never import packages or service credentials from the app UI. */
import { decodeRuleSet } from '../data/ruleCodec.ts';
import * as v from '../data/validation.ts';
import type { AnnouncementRules, RuleSourceStatus } from '../types.ts';

export type ImportPackage = {
  schemaVersion: 1;
  announcement: { id: string; source: string; externalId: string | null; housingManagementNumber: string | null;
    title: string; publisher: string; announcementDate: string; regionCode: string | null; regionName: string; sourceUrl: string | null };
  document: { id: string; documentType: 'DRAFT' | 'OFFICIAL' | 'CORRECTION' | 'ATTACHMENT'; storagePath: string;
    fileName: string; mimeType: string; versionLabel: string; sha256: string; isOfficial: boolean; sourceUrl: string | null; publishedAt: string | null };
  ruleSet: { id: string; version: string; sourceStatus: RuleSourceStatus; effectiveDate: string; config: Record<string, unknown> };
  rules: { ruleKey: string; supplyType: string; stage: string | null; category: string; config: Record<string, unknown>;
    evidence: { id: string; documentId: string; source: string; section: string; label: string; tableLabel: string | null;
      pageNumber: number | null; textExcerpt: string | null; sourceUrl: string | null; locator: Record<string, unknown> } }[];
};
function keys(o: Record<string, unknown>, expected: string[]) {
  if (Object.keys(o).sort().join() !== [...expected].sort().join()) throw new Error('Unexpected or missing package fields');
}
const nullableText = (value: unknown) => value === null ? null : v.string(value);
function url(value: unknown): string | null {
  if (value === null) return null;
  const s = v.string(value), u = new URL(s);
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw new Error('Invalid source URL');
  return s;
}
export function packageToWire(p: ImportPackage) {
  return { title: p.announcement.title, listing_id: `announcement:${p.announcement.id}`,
    rule_set: { id: p.ruleSet.id, announcement_id: p.announcement.id, document_id: p.document.id, version: p.ruleSet.version,
      schema_version: p.schemaVersion, source_status: p.ruleSet.sourceStatus, effective_date: p.ruleSet.effectiveDate, config: p.ruleSet.config,
      is_active: true, is_public: true, approved_at: '2000-01-01T00:00:00Z' },
    rules: p.rules.map(r => ({ rule_set_id: p.ruleSet.id, rule_key: r.ruleKey, supply_type: r.supplyType, stage: r.stage, category: r.category, config: r.config,
      evidence: [{ evidence_key: r.evidence.id, document_id: r.evidence.documentId, source: r.evidence.source, section: r.evidence.section,
        evidence_label: r.evidence.label, table_label: r.evidence.tableLabel, page_number: r.evidence.pageNumber, text_excerpt: r.evidence.textExcerpt,
        source_url: r.evidence.sourceUrl, locator: r.evidence.locator }] })) };
}

/** These temporary visibility fields are used for validation ONLY, never persisted. */
export function validateImportPackage(raw: unknown): { package: ImportPackage; rules: AnnouncementRules } {
  if (JSON.stringify(raw).length > 2_000_000) throw new Error('Package exceeds 2 MB');
  const p = v.object(raw);
  keys(p, ['schemaVersion', 'announcement', 'document', 'ruleSet', 'rules']);
  if (p.schemaVersion !== 1) throw new Error('Unsupported import schemaVersion');
  const a = v.object(p.announcement), d = v.object(p.document), s = v.object(p.ruleSet);
  keys(a, ['id','source','externalId','housingManagementNumber','title','publisher','announcementDate','regionCode','regionName','sourceUrl']);
  keys(d, ['id','documentType','storagePath','fileName','mimeType','versionLabel','sha256','isOfficial','sourceUrl','publishedAt']);
  keys(s, ['id','version','sourceStatus','effectiveDate','config']);
  const announcement = { id: v.uuid(a.id), source: v.string(a.source), externalId: nullableText(a.externalId), housingManagementNumber: nullableText(a.housingManagementNumber),
    title: v.string(a.title), publisher: v.string(a.publisher), announcementDate: v.date(a.announcementDate), regionCode: nullableText(a.regionCode), regionName: v.string(a.regionName), sourceUrl: url(a.sourceUrl) };
  if (announcement.source.length > 80 || announcement.title.length > 500) throw new Error('Announcement field too long');
  if (!['DRAFT', 'OFFICIAL', 'CORRECTION', 'ATTACHMENT'].includes(String(d.documentType)) || typeof d.isOfficial !== 'boolean') throw new Error('Document type/status');
  const document = { id: v.uuid(d.id), documentType: d.documentType as ImportPackage['document']['documentType'], storagePath: v.string(d.storagePath),
    fileName: v.string(d.fileName), mimeType: v.string(d.mimeType), versionLabel: v.string(d.versionLabel), sha256: v.string(d.sha256),
    isOfficial: d.isOfficial, sourceUrl: url(d.sourceUrl), publishedAt: d.publishedAt === null ? null : v.date(d.publishedAt) };
  const path = document.storagePath.split('/');
  if (path.length !== 4 || !/^\d{4}$/.test(path[0]) || path[1] !== announcement.id || path[2] !== document.id || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(path[3])) throw new Error('Immutable storage path mismatch');
  if (!/^[a-f0-9]{64}$/.test(document.sha256)) throw new Error('SHA-256 is required');
  const ruleSet = { id: v.uuid(s.id), version: v.string(s.version), sourceStatus: v.sourceStatus(s.sourceStatus), effectiveDate: v.date(s.effectiveDate), config: v.object(s.config) };
  if (ruleSet.version.length > 80) throw new Error('Version too long');
  if (ruleSet.sourceStatus === 'OFFICIAL_VERIFIED' && !document.isOfficial) throw new Error('Official source requires official document');
  if (document.documentType === 'DRAFT' && document.isOfficial) throw new Error('Draft is not an official document');
  const rules = v.array(p.rules).map(rawRule => {
    const r = v.object(rawRule); keys(r, ['ruleKey','supplyType','stage','category','config','evidence']);
    if (v.string(r.ruleKey).length > 256) throw new Error('Rule key too long');
    const e = v.object(r.evidence); keys(e, ['id','documentId','source','section','label','tableLabel','pageNumber','textExcerpt','sourceUrl','locator']);
    return { ruleKey: v.string(r.ruleKey), supplyType: v.string(r.supplyType), stage: nullableText(r.stage), category: v.string(r.category), config: v.object(r.config),
      evidence: { id: v.string(e.id), documentId: v.uuid(e.documentId), source: v.string(e.source), section: v.string(e.section), label: v.string(e.label),
        tableLabel: nullableText(e.tableLabel), pageNumber: e.pageNumber === null ? null : v.integer(e.pageNumber), textExcerpt: nullableText(e.textExcerpt), sourceUrl: url(e.sourceUrl), locator: v.object(e.locator) } };
  });
  const pkg: ImportPackage = { schemaVersion: 1, announcement, document, ruleSet, rules };
  const decoded = decodeRuleSet(packageToWire(pkg), { announcementId: announcement.id });
  if (decoded.status !== 'AVAILABLE') throw new Error(`Invalid rule package: ${decoded.status}`);
  return { package: structuredClone(pkg), rules: decoded.rules };
}
