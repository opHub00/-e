// Read-only assertions against locally provisioned samples. No network or AI calls.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { LocalIngestionStore } from '../features/announcementIngestion/server/localStore.ts';
import { validateParsedDocument } from '../features/ruleExtraction/server/parsedDocument.ts';
import { buildExtractionPlan } from '../features/ruleExtraction/server/extraction.ts';
const store = new LocalIngestionStore('.ingestion'), state = await store.load(), results=[];
for (const [prefix, title, blocks, tables, date] of [
  ['bd67d7ee6c','삼도이동',4115,172,'2026.09.14'],
  ['a4da2c72c8','더샵 트리센트',465,25,'2026.09.10'],
  ['be9fc0f60a','힐스테이트 고덕엘리스트',3514,110,'2026.09.11'],
]) {
  const entry=Object.values(state.entries).find(e=>e.manifest.documents.some(d=>d.sha256.startsWith(prefix)));assert.ok(entry,'sample required');
  const doc=entry.manifest.documents.find(d=>d.sha256.startsWith(prefix));assert.ok(await store.cached(doc));
  const parsed=JSON.parse(await readFile(store.path(`announcements/${entry.manifest.canonicalId}/parsed/${doc.sha256}/document-parser-v1/document.json`),'utf8'));
  validateParsedDocument(parsed);assert.equal(parsed.blocks.length,blocks);assert.equal(parsed.tables.length,tables);
  const text=parsed.blocks.map(b=>b.text).join('\n');assert.ok(text.includes(title));
  if (prefix!=='bd67d7ee6c') {assert.ok(text.includes(date));assert.ok(parsed.tables.some(t=>t.rows.flat().some(c=>c.text.includes(date))));}
  if (prefix==='bd67d7ee6c') {
    const old=JSON.parse(await readFile('.cache/samdo-hwp.json','utf8'));
    assert.deepEqual(parsed.blocks.map(b=>b.text),old.paragraphs.map(p=>p.text));
    assert.deepEqual(parsed.blocks.map(b=>[b.sourceLocator.stream,b.sourceLocator.recordOffset]),old.paragraphs.map(p=>[p.stream,p.offset]));
    for(const value of ['2,669,354','3,813,363','5,338,708','7,533,763','276백만원','1,034백만원','362백만원','표7','표10'])assert.ok(text.includes(value),value);
    for(const value of ['2,669,354','3,813,363','5,338,708','7,533,763'])assert.ok(parsed.tables.some(t=>t.rows.flat().some(c=>c.text.includes(value))),value+' table cell');
    assert.ok(parsed.metadata.memoAnchors.length);assert.equal(parsed.pages,null);
  }
  const plan=buildExtractionPlan(parsed);
  results.push({title,blocks,tables,pages:parsed.pages,brokenCharacters:parsed.quality.replacementCharacterCount,chunks:plan.chunks.length,oversized:plan.oversizedChunkIds.length,status:parsed.status});
}
console.log(JSON.stringify({results,aiCalls:0,semanticExtractionAccuracy:'NOT_MEASURED'},null,2));
