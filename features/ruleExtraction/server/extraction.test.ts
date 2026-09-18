import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { blockEvidence, validateCandidatePackage as validateCandidate, type CandidateRulePackage } from './candidate.ts';
import { buildExtractionPlan, compareWithOracle, extractObservations, MockRuleExtractor } from './extraction.ts';
import { validateParsedDocument, type ParsedDocument } from './parsedDocument.ts';
import { processAnnouncement } from './pipeline.ts';
import { PythonDocumentParser } from './parser.ts';
import { LocalIngestionStore } from '../../announcementIngestion/server/localStore.ts';
import { storeDocument } from '../../announcementIngestion/server/documents.ts';
import type { Manifest } from '../../announcementIngestion/server/model.ts';

function document(): ParsedDocument {
  const text = '소득 130% 이하, 100% 초과. 자산 362백만원. 공고일 2026-09-14. 관리번호 2026000434. 검토 필요. '.repeat(4);
  return { schemaVersion: 1, documentId: 'sha256:'+'a'.repeat(64), sha256: 'a'.repeat(64), mimeType: 'application/pdf', parserVersion: 'document-parser-v1', status: 'PARTIAL', pages: 1,
    blocks: [{ id: 'b000000', type: 'paragraph', text, sectionPath: [], sourceLocator: { kind: 'PDF_BBOX', pageNumber: 1, bbox: [0,0,100,100] } }], tables: [], metadata: {},
    quality: { textBlockCount: 1, tableCount: 0, characterCount: [...text].length, emptyBlockRatio: 0, replacementCharacterCount: 0, suspiciousEncoding: false, parserWarnings: ['PDF_READING_ORDER_REQUIRES_REVIEW'], extractionAllowed: true } };
}
const manifest = { canonicalId: 'b'.repeat(64), announcement: { title: 'fixture', announcementDate: '2026-09-14' } } as Manifest;
function validateCandidatePackage(raw: unknown, d: ParsedDocument) { validateCandidate(raw,d,{canonicalId:manifest.canonicalId,title:manifest.announcement.title,announcementDate:manifest.announcement.announcementDate}); }
async function candidate(d = document()) {
  const p = await new MockRuleExtractor().extract({ manifest, document: d });
  p.candidateRules.push({ candidateRuleId: 'c1', ruleKey: 'income', supplyType: 'YOUTH', stage: 'COMMON', category: 'incomeThreshold',
    condition: { input: 'incomePercentage', operator: 'lte', value: 130, values: [] }, score: null, maxScore: null, requiredInputs: ['incomePercentage'], relatedExceptionRuleKeys:[], evidence: [blockEvidence(d,0)], confidence: 'HIGH', confidenceReason: 'Explicit text', reviewStatus: 'REVIEW_REQUIRED' });
  return p;
}
test('grounded candidate accepted, inclusive operator preserved', async () => { const p = await candidate(); validateCandidatePackage(p, document()); assert.equal(p.candidateRules[0].condition.operator, 'lte'); });
const mutations: [string, (p: CandidateRulePackage) => void][] = [
  ['no evidence', p => { p.candidateRules[0].evidence=[]; }],
  ['unknown block', p => { p.candidateRules[0].evidence[0].blockId='b999999'; }],
  ['invented snippet', p => { p.candidateRules[0].evidence[0].snippet='130% 미만'; }],
  ['changed page', p => { p.candidateRules[0].evidence[0].locator.pageNumber=2; }],
  ['unknown supply', p => { (p.candidateRules[0] as any).supplyType='UNKNOWN'; }],
  ['invalid operator', p => { (p.candidateRules[0].condition as any).operator='about'; }],
  ['nan', p => { p.candidateRules[0].condition.value=NaN; }],
  ['numeric string', p => { p.candidateRules[0].condition.value='130'; }],
  ['missing input', p => { p.candidateRules[0].requiredInputs=[]; }],
  ['score overflow', p => { Object.assign(p.candidateRules[0], { category:'score',score:10,maxScore:9 }); }],
  ['first home invented points', p => { Object.assign(p.candidateRules[0], { supplyType:'FIRST_TIME',category:'score',score:3,maxScore:9 }); }],
  ['lottery points', p => { Object.assign(p.candidateRules[0], { stage:'LOTTERY',category:'score',score:3,maxScore:9 }); }],
  ['verification escalation', p => { (p as any).sourceStatus='DRAFT_SOURCE_VERIFIED'; }],
  ['official escalation', p => { (p as any).sourceStatus='OFFICIAL_VERIFIED'; }],
  ['activation field', p => { (p as any).isActive=true; }],
  ['approval field', p => { (p as any).approvedAt='2026-09-14'; }],
  ['review bypass', p => { (p.candidateRules[0] as any).reviewStatus='APPROVED'; }],
  ['document mismatch', p => { p.document.sha256='c'.repeat(64); }],
  ['announcement swap', p => { p.announcement.canonicalId='c'.repeat(64); }],
  ['duplicate rule', p => { p.candidateRules.push(structuredClone(p.candidateRules[0])); }],
];
for (const [name, mutate] of mutations) test(`reject ${name}`, async () => { const p = await candidate(); mutate(p); assert.throws(() => validateCandidatePackage(p, document())); });
test('conflicts and unsupported exceptions remain unresolved', async () => {
  const p=await candidate(); p.conflicts=[{ description:'two dates', alternatives:[{ value:'A',evidence:p.candidateRules[0].evidence },{ value:'B',evidence:p.candidateRules[0].evidence }],resolution:null,requiresReview:true }];
  p.unresolvedItems.push({ type:'UNSUPPORTED_EXCEPTION',description:'manual assessment required',evidence:p.candidateRules[0].evidence }); validateCandidatePackage(p,document());
  (p.conflicts[0] as any).resolution='A'; assert.throws(()=>validateCandidatePackage(p,document()));
});
test('table cell grounding and merged spans', async () => {
  const d=document(), locator={...d.blocks[0].sourceLocator,tableId:'t00000',row:0,column:0};
  d.tables=[{id:'t00000',caption:null,rowCount:1,columnCount:2,rows:[[{row:0,column:0,rowSpan:1,columnSpan:2,text:'130% 이하',blockIds:[],sourceLocator:locator}]],fidelity:'STRUCTURAL',warnings:['MERGED_CELLS_PRESERVED'],sourceLocator:d.blocks[0].sourceLocator}]; d.quality.tableCount=1;
  const p=await candidate(d); p.candidateRules[0].evidence=[{documentId:d.documentId,blockId:null,tableId:'t00000',row:0,column:0,snippet:'130% 이하',locator}]; validateCandidatePackage(p,d);
  p.candidateRules[0].evidence[0].column=1; assert.throws(()=>validateCandidatePackage(p,d));
});
test('quality gate prevents extraction',()=>{const d=document();d.status='UNREADABLE';d.quality.extractionAllowed=false;assert.throws(()=>buildExtractionPlan(d));});
test('forged quality counts rejected',()=>{const d=document();d.quality.characterCount=1;assert.throws(()=>validateParsedDocument(d));});
test('deterministic chunks retain oversized blocks without truncation',()=>{const d=document();d.blocks[0].text=d.blocks[0].text.repeat(10);d.quality.characterCount=[...d.blocks[0].text].length;const p=buildExtractionPlan(d,500);assert.deepEqual(p,buildExtractionPlan(d,500));assert.equal(p.chunks[0].oversized,true);assert.ok(p.chunks[0].text.includes(d.blocks[0].text));});
test('observations preserve operators and units without semantic rules',()=>{const facts=extractObservations(document());for(const literal of ['130%','이하','초과','362백만원','2026-09-14','2026000434'])assert.ok(facts.some(f=>f.literal===literal));});
test('mock never claims real semantic extraction',async()=>{const p=await new MockRuleExtractor().extract({manifest,document:document()});assert.equal(p.candidateRules.length,0);assert.equal(p.reviewStatus,'REVIEW_REQUIRED');});
test('oracle runs after extraction and reports missing/extra/mismatch',async()=>{const p=await candidate();const r=compareWithOracle(p,[{ruleKey:'income',condition:{wrong:1},score:null},{ruleKey:'age',condition:{},score:null}]);assert.deepEqual(r.mismatched,['income']);assert.deepEqual(r.missing,['age']);});
test('HTML Content-Type rejects before persisting even misleading magic',async()=>{const dir=await mkdtemp(join(tmpdir(),'extraction-'));try{await assert.rejects(()=>storeDocument(new LocalIngestionStore(dir),Buffer.from('%PDF-1.7 fake'),'2026-09-14T00:00:00Z',null,new Headers({'content-type':'text/html'})));assert.deepEqual(await readdir(dir),[]);}finally{await rm(dir,{recursive:true,force:true});}});
test('missing parser executable is safe failure',async()=>{const dir=await mkdtemp(join(tmpdir(),'parser-'));try{const path=join(dir,'source');await writeFile(path,'abc');await assert.rejects(()=>new PythonDocumentParser('application/pdf','nonexistent-document-parser').parse({mimeType:'application/pdf',size:3,sha256:'a'.repeat(64)} as any,path,join(dir,'result')),/PARSER_PROCESS_UNAVAILABLE/);}finally{await rm(dir,{recursive:true,force:true});}});
test('pipeline rejects missing announcement without writing',async()=>{const dir=await mkdtemp(join(tmpdir(),'extract-'));try{await assert.rejects(()=>processAnnouncement({root:dir,id:'a'.repeat(64),python:'python',dryRun:true}),/ANNOUNCEMENT_NOT_FOUND/);assert.deepEqual(await readdir(dir),[]);}finally{await rm(dir,{recursive:true,force:true});}});
test('pipeline cached artifact, dry-run, hash mismatch and mock handoff',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'extract-'));try{
    const { identity, metadataHash, manifestVersion } = await import('../../announcementIngestion/server/domain.ts');
    const announcement={source:'MANUAL',externalId:'test',housingManagementNumber:null,title:'fixture',publisher:null,announcementDate:'2026-09-14',region:{code:null,name:null},detailUrl:null,documentUrls:[],rawMetadata:{},retrievedAt:'2026-09-14T00:00:00Z'};
    const store=new LocalIngestionStore(dir), doc=await storeDocument(store,Buffer.from('%PDF-1.7 fixture'),'2026-09-14T00:00:00Z',null);
    const m:Manifest={schemaVersion:1,...identity(announcement),metadataHash:metadataHash(announcement),version:manifestVersion(metadataHash(announcement),[doc],'DOWNLOADED',[]),sourceStatusCandidate:'REFERENCE',announcement,documents:[doc],status:'DOWNLOADED',errors:[]};
    const manifestPath=await store.saveManifest(m);await store.save({schemaVersion:1,cursors:{},entries:{[m.canonicalId]:{manifest:m,manifestPath,metadataHash:m.metadataHash,lastCheckedAt:announcement.retrievedAt}}});
    const d=document();d.sha256=doc.sha256;d.documentId='sha256:'+doc.sha256;
    await store.immutable(`announcements/${m.canonicalId}/parsed/${doc.sha256}/document-parser-v1/document.json`,Buffer.from(JSON.stringify(d)));
    const before=await readdir(dir,{recursive:true});
    const dry=await processAnnouncement({root:dir,id:m.canonicalId,python:'unused',dryRun:true});assert.equal(dry.aiCalls,0);assert.deepEqual(await readdir(dir,{recursive:true}),before);
    const result=await processAnnouncement({root:dir,id:m.canonicalId,python:'unused',extract:true});assert.equal(result.aiCalls,0);
    const artifact=JSON.parse(await readFile(store.path(`announcements/${m.canonicalId}/extraction/${m.version}/${doc.sha256}/assessment-rule-extraction-v1/candidate-rules.json`),'utf8'));validateCandidate(artifact,d,{canonicalId:m.canonicalId,title:announcement.title,announcementDate:announcement.announcementDate});
    await writeFile(store.path(doc.localPath),'tampered');await assert.rejects(()=>processAnnouncement({root:dir,id:m.canonicalId,python:'unused'}),/DOCUMENT_HASH_MISMATCH/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
