export type SourceLocator = {
  kind: 'PDF_BBOX' | 'HWP_RECORD' | 'HWPX_XML'; pageNumber: number | null;
  bbox?: number[]; stream?: string; recordOffset?: number; recordLevel?: number; paragraphIndex?: number;
  xpath?: string; tableId?: string; row?: number; column?: number; memoId?: number;
};
export type ParsedBlock = { id: string; type: 'heading' | 'paragraph' | 'list' | 'table' | 'note'; text: string; sectionPath: string[]; sourceLocator: SourceLocator };
export type ParsedCell = { row: number; column: number; rowSpan: number | null; columnSpan: number | null; text: string; blockIds: string[]; sourceLocator: SourceLocator };
export type ParsedTable = { id: string; caption: string | null; rows: ParsedCell[][]; rowCount: number; columnCount: number;
  fidelity: 'STRUCTURAL' | 'GEOMETRY_INFERRED'; warnings: string[]; sourceLocator: SourceLocator };
export type ParsedDocument = {
  schemaVersion: 1; documentId: string; sha256: string; mimeType: string; parserVersion: string;
  status: 'PARSED' | 'PARTIAL' | 'UNREADABLE' | 'UNSUPPORTED'; pages: number | null;
  blocks: ParsedBlock[]; tables: ParsedTable[]; metadata: Record<string, unknown>;
  quality: { textBlockCount: number; tableCount: number; characterCount: number; emptyBlockRatio: number;
    replacementCharacterCount: number; suspiciousEncoding: boolean; parserWarnings: string[]; extractionAllowed: boolean };
};
export const object = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('OBJECT_REQUIRED'); return v as Record<string, unknown>; };
export const string = (v: unknown, max = 20000): string => { if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Error('STRING_REQUIRED'); return v; };
export const integer = (v: unknown): number => { if (!Number.isSafeInteger(v) || Number(v) < 0) throw new Error('INTEGER_REQUIRED'); return v as number; };
export const array = (v: unknown, max = 1000): unknown[] => { if (!Array.isArray(v) || v.length > max) throw new Error('ARRAY_REQUIRED'); return v; };
export function exact(value: Record<string, unknown>, keys: string[]) { if (Object.keys(value).sort().join() !== [...keys].sort().join()) throw new Error('UNKNOWN_OR_MISSING_FIELDS'); }

export function validateLocator(v: unknown, d: ParsedDocument): asserts v is SourceLocator {
  const l = object(v);
  if ((d.mimeType === 'application/pdf' && l.kind !== 'PDF_BBOX') || (d.mimeType === 'application/x-hwp' && l.kind !== 'HWP_RECORD') || (d.mimeType === 'application/hwp+zip' && l.kind !== 'HWPX_XML')) throw new Error('LOCATOR_FORMAT_MISMATCH');
  if (Object.keys(l).some(k => !['kind','pageNumber','bbox','stream','recordOffset','recordLevel','paragraphIndex','xpath','tableId','row','column','memoId'].includes(k))) throw new Error('UNKNOWN_LOCATOR_FIELD');
  if (l.kind === 'PDF_BBOX') {
    const page = integer(l.pageNumber); if (!d.pages || page < 1 || page > d.pages || !Array.isArray(l.bbox) || l.bbox.length !== 4 || l.bbox.some(x => typeof x !== 'number' || !Number.isFinite(x)) || l.bbox[2] < l.bbox[0] || l.bbox[3] < l.bbox[1]) throw new Error('INVALID_PDF_LOCATOR');
  } else if (l.kind === 'HWP_RECORD') {
    if (l.pageNumber !== null || !/^BodyText\/Section\d+$/.test(string(l.stream))) throw new Error('INVALID_HWP_LOCATOR');
    integer(l.recordOffset); integer(l.recordLevel);
  } else if (l.kind === 'HWPX_XML') {
    if (l.pageNumber !== null || !/^Contents\/section\d+\.xml$/.test(string(l.stream)) || !string(l.xpath).startsWith('/')) throw new Error('INVALID_HWPX_LOCATOR');
  } else throw new Error('INVALID_LOCATOR_KIND');
  if (l.paragraphIndex !== undefined) integer(l.paragraphIndex);
  if (l.memoId !== undefined) integer(l.memoId);
  if (l.tableId !== undefined) { string(l.tableId); integer(l.row); integer(l.column); }
}
export function validateParsedDocument(v: unknown): asserts v is ParsedDocument {
  const r = object(v), d = r as unknown as ParsedDocument;
  if (d.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(string(d.sha256)) || d.documentId !== `sha256:${d.sha256}` || !['application/pdf','application/x-hwp','application/hwp+zip'].includes(d.mimeType) || !['PARSED','PARTIAL','UNREADABLE','UNSUPPORTED'].includes(d.status)) throw new Error('INVALID_PARSED_DOCUMENT');
  string(d.parserVersion); object(d.metadata);
  if (d.pages !== null && (integer(d.pages) < 1 || d.pages > 150)) throw new Error('INVALID_PAGE_COUNT');
  const ids = new Set<string>();
  for (const raw of array(d.blocks, 50000)) {
    const b = raw as ParsedBlock; if (!/^b\d{6}$/.test(string(b.id)) || ids.has(b.id)) throw new Error('DUPLICATE_BLOCK_ID'); ids.add(b.id);
    string(b.text, 500000); array(b.sectionPath, 30).forEach(x => string(x));
    if (!['heading','paragraph','list','table','note'].includes(b.type)) throw new Error('INVALID_BLOCK_TYPE');
    validateLocator(b.sourceLocator, d);
  }
  const tableIds = new Set<string>();
  for (const raw of array(d.tables, 2000)) {
    const t = raw as ParsedTable; if (!/^t\d{5}$/.test(string(t.id)) || tableIds.has(t.id)) throw new Error('DUPLICATE_TABLE_ID'); tableIds.add(t.id);
    if (!['STRUCTURAL','GEOMETRY_INFERRED'].includes(t.fidelity) || integer(t.rowCount) < 1 || integer(t.columnCount) < 1 || t.rowCount * t.columnCount > 20000 || array(t.rows, 20000).length !== t.rowCount) throw new Error('INVALID_TABLE');
    validateLocator(t.sourceLocator, d); array(t.warnings).forEach(x => string(x));
    for (const [row, cells] of t.rows.entries()) for (const c of array(cells, 20000) as ParsedCell[]) {
      if (c.row !== row || integer(c.column) >= t.columnCount || typeof c.text !== 'string') throw new Error('INVALID_CELL');
      if (c.rowSpan !== null && integer(c.rowSpan) < 1) throw new Error('INVALID_SPAN');
      if (c.columnSpan !== null && integer(c.columnSpan) < 1) throw new Error('INVALID_SPAN');
      if (t.fidelity === 'STRUCTURAL' && (c.rowSpan === null || c.columnSpan === null || c.row + c.rowSpan > t.rowCount || c.column + c.columnSpan > t.columnCount)) throw new Error('INVALID_STRUCTURAL_SPAN');
      if (c.sourceLocator.tableId !== t.id || c.sourceLocator.row !== c.row || c.sourceLocator.column !== c.column) throw new Error('CELL_LOCATOR_MISMATCH');
      validateLocator(c.sourceLocator, d); array(c.blockIds, 50000).forEach(id => { if (!ids.has(string(id))) throw new Error('UNKNOWN_CELL_BLOCK'); });
    }
  }
  for (const b of d.blocks) if (b.sourceLocator.tableId && !d.tables.some(t => t.id === b.sourceLocator.tableId && t.rows.some(row => row.some(c => c.row === b.sourceLocator.row && c.column === b.sourceLocator.column && c.blockIds.includes(b.id))))) throw new Error('UNKNOWN_BLOCK_CELL');
  const q = object(d.quality), text = d.blocks.map(b => b.text).join('\n');
  if (q.textBlockCount !== d.blocks.length || q.tableCount !== d.tables.length || q.characterCount !== [...text].length || q.replacementCharacterCount !== (text.match(/\ufffd/g) ?? []).length || typeof q.emptyBlockRatio !== 'number' || q.emptyBlockRatio < 0 || q.emptyBlockRatio > 1) throw new Error('INVALID_QUALITY_REPORT');
  array(q.parserWarnings).forEach(x => string(x));
  const broken = (text.match(/\ufffd/g) ?? []).length / Math.max([...text].length, 1) > .01 || (text.match(/\(cid:\d+\)/g) ?? []).length > 20;
  if (q.suspiciousEncoding !== broken || typeof q.extractionAllowed !== 'boolean' || (q.extractionAllowed && (broken || text.trim().length < 100 || !['PARSED','PARTIAL'].includes(d.status)))) throw new Error('QUALITY_GATE_MISMATCH');
}
