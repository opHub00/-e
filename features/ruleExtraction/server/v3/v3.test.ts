import test from 'node:test';
import assert from 'node:assert/strict';
import type { ParsedBlock,ParsedCell,ParsedDocument,ParsedTable,SourceLocator } from '../parsedDocument.ts';
import { validateCandidatePackage } from '../candidate.ts';
import { extractFacts,type ExtractedFact } from './facts.ts';
import { assertGeminiSafeSchema,GEMINI_SAFE_BINDING_SCHEMA,validateBindingResponse,V3_BINDING_PROMPT,type SemanticBinding } from './contract.ts';
import { buildCandidateRules,deriveHostConfidence } from './ruleBuilder.ts';
import { buildTaskInput,V3_TASKS } from './tasks.ts';
import { discoverExceptionSources,linkExceptionRelations,unresolvedExceptions } from './exceptions.ts';
import { scanFactConflicts,scanReviewNotes } from './conflicts.ts';
import { buildCallPlan,PLAN_A_16,PLAN_B_24 } from './plans.ts';
import { v3RetryDecision } from './retry.ts';
import { adminReviewReady,calculateV3Metrics,type V3MetricInput } from './metrics.ts';
import { runOfflineSimulation } from './simulator.ts';
import { runV3BindingBenchmark } from './runner.ts';

const snippets=[
 '청년은 만 19세 이상 39세 이하이며 혼인 중이 아님, 과거 주택 소유 사실이 없는 무주택자',
 '청년 주택청약종합저축 가입기간 6개월 이상, 월납입금 6회 이상',
 '청년 본인 월평균소득 140% 이하',
 '청년 신청자 본인 자산 276백만원 이하, 부모 자산 1,034백만원 이하',
 '청년 가점 소득 70% 초과 100% 이하 2점, 납입인정 12회 이상 24회 미만, 최대 9 / 12점',
 '신혼부부, 예비신혼부부, 6세 이하 자녀를 둔 한부모가족',
 '신혼부부 총자산 362백만원 이하, 외벌이 130% 이하, 맞벌이 140% 이하',
 '신혼부부 가점 미성년 자녀 3명 이상 3점, 최대 9 / 12점',
 '신혼부부 무주택기간은 만 30세가 되는 날 또는 혼인신고일부터 3년 이상',
 '생애최초 저축액은 선납금을 포함하여 600만원 이상',
 '생애최초 신청자 본인이 5년 이상 소득세를 납부',
 '생애최초 3단계 잔여물량은 추첨하며 가점 없음',
 '다만 해외체류가 계속 90일 초과 또는 연간 183일 초과이면 제한하되 생업 목적 국외체류는 예외',
 '배우자 혼인 전 주택소유 후 혼인 전 처분 예외',
 '2023-03-28 이후 출생 자녀에 대한 출산특례는 검토 필요',
 '지역우선은 제주특별자치도 1년 이상 계속 거주자 100% 이하',
] as const;
const tableIndexes=new Set([2,3,4,6,7,9,15]);
const locator=(index:number,table?:{id:string;row:number;column:number}):SourceLocator=>({kind:'HWP_RECORD',pageNumber:null,stream:'BodyText/Section0',recordOffset:index*10,recordLevel:0,paragraphIndex:index,...(table?{tableId:table.id,row:table.row,column:table.column}:{})});
function fixture():ParsedDocument{
 const blocks:ParsedBlock[]=snippets.map((text,index)=>{const inTable=tableIndexes.has(index),id=`b${String(index).padStart(6,'0')}`,table=inTable?{id:`t${String(index).padStart(5,'0')}`,row:0,column:0}:undefined;return {id,type:text.includes('검토')?'note':'paragraph',text,sectionPath:[index<5?'청년':index<9?'신혼부부':index<12?'생애최초':'공통'],sourceLocator:locator(index,table)};});
 const tables:ParsedTable[]=[...tableIndexes].map(index=>{const id=`t${String(index).padStart(5,'0')}`,cell:ParsedCell={row:0,column:0,rowSpan:1,columnSpan:1,text:snippets[index],blockIds:[blocks[index].id],sourceLocator:locator(index,{id,row:0,column:0})};return {id,caption:null,rows:[[cell]],rowCount:1,columnCount:1,fidelity:'STRUCTURAL',warnings:[],sourceLocator:locator(index)};});
 const text=blocks.map(b=>b.text).join('\n');return {schemaVersion:1,documentId:`sha256:${'a'.repeat(64)}`,sha256:'a'.repeat(64),mimeType:'application/x-hwp',parserVersion:'document-parser-v1',status:'PARSED',pages:null,blocks,tables,metadata:{},quality:{textBlockCount:blocks.length,tableCount:tables.length,characterCount:[...text].length,emptyBlockRatio:0,replacementCharacterCount:0,suspiciousEncoding:false,parserWarnings:[],extractionAllowed:true}};
}
const doc=fixture(),facts=extractFacts(doc);
const fromSource=(id:string,type?:ExtractedFact['type'])=>facts.filter(f=>f.sourceId===id&&(!type||f.type===type));
const task=(name:string)=>V3_TASKS.find(t=>t.name===name)!;
const binding=(role:string,selected:ExtractedFact[],sourceIds=[...new Set(selected.map(f=>f.sourceId))],qualifierSourceIds:string[]=[]):SemanticBinding=>({bindingId:`bind-${role}`,semanticRole:role,factIds:selected.map(f=>f.factId),sourceIds,qualifierSourceIds});

test('deterministic fact layer preserves Korean operators and units without AI',()=>{
 const score=fromSource('cell:t00004:0:0');
 assert.ok(score.some(f=>f.type==='PERCENT'&&f.normalizedValue===70&&f.operator==='gt'));
 assert.ok(score.some(f=>f.type==='PERCENT'&&f.normalizedValue===100&&f.operator==='lte'));
 assert.ok(score.some(f=>f.type==='COUNT'&&f.normalizedValue===12&&f.operator==='gte'));
 assert.ok(score.some(f=>f.type==='COUNT'&&f.normalizedValue===24&&f.operator==='lt'));
 assert.ok(score.some(f=>f.type==='SCORE'&&f.normalizedValue===9&&f.unit==='POINT'));
 assert.ok(score.some(f=>f.type==='SCORE'&&f.normalizedValue===12&&f.unit==='MAX_POINT'));
 assert.ok(fromSource('cell:t00003:0:0').some(f=>f.normalizedValue===276_000_000));
 assert.ok(fromSource('cell:t00009:0:0').some(f=>f.normalizedValue===6_000_000&&f.operator==='gte'));
});
test('ambiguous operator binding stays unresolved',()=>{const ambiguous={...doc,blocks:[...doc.blocks,{id:'b999999',type:'paragraph' as const,text:'소득 130% 이상 또는 이하',sectionPath:[],sourceLocator:locator(999)}]};const found=extractFacts(ambiguous).find(f=>f.sourceId==='b999999'&&f.type==='PERCENT');assert.equal(found?.bindingStatus,'AMBIGUOUS_OPERATOR_BINDING');const built=buildCandidateRules(ambiguous,task('youth.income'),binding('YOUTH.INCOME_LIMIT',[found!]),[found!]);assert.deepEqual(built.rules,[]);assert.match(built.unresolved[0],/AMBIGUOUS_OPERATOR_BINDING/);});
test('362백만원 is normalized to KRW',()=>{assert.ok(fromSource('cell:t00006:0:0').some(f=>f.normalizedValue===362_000_000&&f.operator==='lte'));});
test('ratio is extracted as a fact and an incomplete score never invents maxScore',()=>{const ratioDoc={...doc,blocks:[...doc.blocks,{id:'b999998',type:'paragraph' as const,text:'공급 비율 30:70, 가점 3점',sectionPath:[],sourceLocator:locator(998)}]},local=extractFacts(ratioDoc),ratio=local.find(f=>f.sourceId==='b999998'&&f.type==='RATIO'),point=local.find(f=>f.sourceId==='b999998'&&f.type==='SCORE');assert.equal(ratio?.normalizedValue,'30:70');const built=buildCandidateRules(ratioDoc,task('youth.score'),binding('YOUTH.SCORE.TOTAL',[point!]),local);assert.deepEqual(built.rules,[]);assert.match(built.unresolved[0],/SCORE_POINT_AND_MAX_FACT_REQUIRED/);});
test('minimal schema uses Gemini safe subset and prompt bans literal generation',()=>{assert.doesNotThrow(()=>assertGeminiSafeSchema(GEMINI_SAFE_BINDING_SCHEMA));assert.throws(()=>assertGeminiSafeSchema({type:'array',maxItems:2,items:{type:'string'}}),/UNSAFE_SCHEMA_KEY/);assert.match(V3_BINDING_PROMPT,/Never output a number/);});
test('binding contract rejects invented fact and source IDs',()=>{const t=task('youth.income'),input=buildTaskInput(doc,facts,t),role=t.allowedRoles[0];assert.throws(()=>validateBindingResponse({bindings:[{bindingId:'x',semanticRole:role,factIds:['invented'],sourceIds:[input.sources[0].sourceId],qualifierSourceIds:[]}],unresolved:[]},input.facts,new Set(input.sources.map(s=>s.sourceId)),new Set(t.allowedRoles)),/UNKNOWN_FACT_ID/);});

const cases=[
 ['청년 나이/통장','youth.basicEligibility','YOUTH.AGE_MIN','b000000','AGE'],['청년 소득','youth.income','YOUTH.INCOME_LIMIT','cell:t00002:0:0','PERCENT'],['청년 자산','youth.assets','YOUTH.APPLICANT_ASSET_LIMIT','cell:t00003:0:0','MONEY'],['청년 가점표','youth.score','YOUTH.SCORE.TOTAL','cell:t00004:0:0','SCORE'],
 ['신혼 applicant type','newlywed.applicantTypes','NEWLYWED.APPLICANT_TYPE','b000005','BOOLEAN_PHRASE'],['신혼 소득','newlywed.income','NEWLYWED.INCOME.SINGLE_LIMIT','cell:t00006:0:0','PERCENT'],['신혼 가점','newlywed.score','NEWLYWED.SCORE.TOTAL','cell:t00007:0:0','SCORE'],['신혼 무주택기간','newlywed.homelessDuration','NEWLYWED.HOMELESS_DURATION.START','b000008','DURATION_YEARS'],
 ['생애최초 600만원','firstTime.savings','FIRST_TIME.SAVINGS_MIN','cell:t00009:0:0','MONEY'],['생애최초 소득세 5년','firstTime.taxHistory','FIRST_TIME.TAX_YEARS_MIN','b000010','DURATION_YEARS'],['생애최초 무가점','firstTime.lotteryStage','FIRST_TIME.LOTTERY.SCORELESS','b000011','BOOLEAN_PHRASE'],
 ['해외체류','common.regionPriority','COMMON.REGION.RESIDENCE_MIN','b000012','COUNT'],['배우자 혼인 전 예외','firstTime.exceptions','FIRST_TIME.EXCEPTION','b000013','BOOLEAN_PHRASE'],['출산특례','firstTime.exceptions','FIRST_TIME.EXCEPTION','b000014','BOOLEAN_PHRASE'],['지역우선','common.regionPriority','COMMON.REGION.PRIORITY_RATIO','cell:t00015:0:0','PERCENT'],
] as const;
for(const [label,taskName,role,sourceId,type] of cases)test(`Samdo fixture pipeline: ${label}`,()=>{const selected=fromSource(sourceId,type as ExtractedFact['type']).slice(0,role.includes('SCORE.TOTAL')?2:1);assert.ok(selected.length,`${sourceId} ${type}`);const result=buildCandidateRules(doc,task(taskName),binding(role,selected),facts);assert.equal(result.unresolved.length,0);assert.ok(result.rules.length);const pack={schemaVersion:1 as const,promptVersion:'assessment-rule-extraction-v3' as const,sourceStatus:'REFERENCE' as const,reviewStatus:'REVIEW_REQUIRED' as const,announcement:{canonicalId:'b'.repeat(64),title:'Samdo fixture',announcementDate:'2026-09-14'},document:{documentId:doc.documentId,sha256:doc.sha256,parserVersion:doc.parserVersion},candidateRules:result.rules,unresolvedItems:[],conflicts:[],extractionWarnings:[]};assert.doesNotThrow(()=>validateCandidatePackage(pack,doc,pack.announcement));});

test('host assigns task stage and derives confidence without model confidence',()=>{const selected=fromSource('cell:t00015:0:0','PERCENT').slice(0,1),b=binding('COMMON.REGION.PRIORITY_RATIO',selected,selected.map(f=>f.sourceId),['b000012']);const built=buildCandidateRules(doc,task('common.regionPriority'),b,facts);assert.equal(built.rules[0].stage,'COMMON');assert.equal(deriveHostConfidence(doc,b,selected).level,'REVIEW_REQUIRED');});
test('exception discovery never silently drops unbound markers',()=>{const sources=discoverExceptionSources(doc),unresolved=unresolvedExceptions(sources,[]);assert.ok(unresolved.some(item=>item.reason.startsWith('EXCEPTION_UNRESOLVED')));const a=binding('COMMON.REGION.RESIDENCE_MIN',fromSource('b000012','COUNT').slice(0,1),['b000012'],['b000013']),e=binding('FIRST_TIME.EXCEPTION',fromSource('b000013','BOOLEAN_PHRASE').slice(0,1),['b000013']);assert.equal(linkExceptionRelations([a,e])[0].relation,'limitedBy');});
test('conflict scanner keeps alternatives unresolved and review notes independent',()=>{const selected=fromSource('b000012','COUNT').slice(0,2).map((f,index)=>index?{...f,factId:`${f.factId}-alternate`,sourceId:'b000013'}:f);assert.equal(scanFactConflicts(selected,[{semanticConcept:'OVERSEAS_LIMIT',factIds:selected.map(f=>f.factId)}]).length,1);assert.ok(scanReviewNotes(doc).some(c=>c.semanticConcept==='DOCUMENT_REVIEW_NOTE'));});
test('PLAN_A_16 and PLAN_B_24 are deterministic plan-only outputs',()=>{const a=buildCallPlan(doc,facts,'PLAN_A_16'),b=buildCallPlan(doc,facts,'PLAN_B_24');assert.equal(a.rows.length,16);assert.equal(b.rows.length,24);assert.equal(PLAN_A_16.length,16);assert.equal(PLAN_B_24.length,24);assert.ok([...a.rows,...b.rows].every(row=>row.estimatedOutputSchemaSize>0&&row.expectedBindings.max<=6));assert.deepEqual(buildCallPlan(doc,facts,'PLAN_A_16').rows,a.rows);});
test('retry policy limits provider blast radius',()=>{assert.equal(v3RetryDecision('HTTP_400',0).action,'FAIL');assert.equal(v3RetryDecision('HTTP_429',0).action,'SKIP_WITH_BACKOFF');assert.equal(v3RetryDecision('HTTP_503',0).action,'RETRY_ONCE');assert.equal(v3RetryDecision('HTTP_503',1).action,'FAIL');assert.equal(v3RetryDecision('INCOMPLETE_OUTPUT',0).action,'SPLIT_ONCE');});
test('offline simulator preserves successful task when sibling fails',()=>{const selected=fromSource('cell:t00002:0:0','PERCENT').slice(0,1),success=task('youth.income'),failed=task('youth.score');const result=runOfflineSimulation(doc,facts,[{task:success,status:'SUCCESS',response:{bindings:[binding('YOUTH.INCOME_LIMIT',selected)],unresolved:[]}},{task:failed,status:'FAILED',error:'HTTP_429'}]);assert.ok(result.rules.length);assert.equal(result.statuses['youth.score'],'FAILED');assert.ok(result.unresolved.some(x=>x.includes('HTTP_429')));});
test('benchmark runner uses minimal schema, keeps task failures isolated and never reads an oracle',async()=>{let calls=0;const result=await runV3BindingBenchmark(doc,facts,{generate:async(label,_prompt,payload,schema)=>{calls++;assert.deepEqual(schema,GEMINI_SAFE_BINDING_SCHEMA);assert.equal('operator' in (payload as any).facts[0],false);if(label==='youth.subscription')throw new Error('HTTP_429');const input=payload as any,role=input.allowedRoles[0],fact=input.facts[0];return fact?{bindings:[{bindingId:`b-${label}`,semanticRole:role,factIds:[fact.factId],sourceIds:[fact.sourceId],qualifierSourceIds:[]}],unresolved:[]}:{bindings:[],unresolved:[{reason:'NO_FACT',sourceIds:[]}]};}}, {plan:'PLAN_A_16',retryBudget:0});assert.equal(calls,16);assert.equal(result.runs.find(run=>run.taskName==='youth.subscription')?.status,'SKIPPED');assert.ok(result.rules.length);assert.equal(result.providerCallUpperBound,16);assert.equal('oracle' in result,false);});
const safeMetrics:V3MetricInput={oracleTargets:75,matchedTargets:70,candidateTargets:72,sourceSupportedExtras:2,confirmedHallucinations:0,unresolved:4,knownConflicts:7,detectedConflicts:7,locators:100,validLocators:100,semanticEvidence:100,supportedSemanticEvidence:99,preferredEvidence:75,matchedPreferredEvidence:70,criticalNumeric:{correct:20,total:20},criticalOperators:{correct:20,total:20},scores:{correct:10,total:10},stages:{correct:9,total:9},criticalHallucinations:0,highConfidenceCriticalErrors:0,silentExceptionDrops:0,coreCoverage:{YOUTH:true,NEWLYWED:true,FIRST_TIME:true}};
test('v3 metrics separate source-supported extras from hallucinations',()=>{const metrics=calculateV3Metrics(safeMetrics);assert.equal(metrics.sourceSupportedExtra,2);assert.equal(metrics.confirmedHallucination,0);assert.equal(metrics.oracleTargetPrecision,70/72);assert.equal(metrics.evidence.locatorValidity,1);assert.equal(metrics.evidence.semanticSupport,.99);});
test('admin review gate prioritizes safety and coverage',()=>{assert.equal(adminReviewReady(safeMetrics).ready,true);const unsafe=structuredClone(safeMetrics);unsafe.silentExceptionDrops=1;unsafe.coreCoverage.FIRST_TIME=false;assert.deepEqual(adminReviewReady(unsafe).blockers,['SILENT_EXCEPTION_DROP','CORE_COVERAGE_FIRST_TIME']);});
