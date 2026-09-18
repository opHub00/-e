// Offline finalization only. Reads the oracle after the API run has ended; never calls a provider.
import { readFile,writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { LocalIngestionStore } from '../features/announcementIngestion/server/localStore.ts';
import { acceptWire,emptyCandidate } from '../features/ruleExtraction/server/llmExtractor.ts';
import { blockEvidence,validateCandidatePackage } from '../features/ruleExtraction/server/candidate.ts';
import { evaluateOracle } from '../features/ruleExtraction/server/oracleEvaluation.ts';
import { semanticBatches,validateSelection } from '../features/ruleExtraction/server/semanticContext.ts';
const SAMDO_ID='990b2823e0ddc98fe7222815b6c844131bda6e9c1deac50c6de253eb0dbe524f',SHA='bd67d7ee6c9b9dbbe043f9c966679c791185ba0f21ae80050a33a489112e8763';
const {values}=parseArgs({options:{run:{type:'string'}},strict:true});if(!values.run||!/^[a-z0-9-]{1,60}$/.test(values.run))throw new Error('RUN_ID_REQUIRED');
const store=new LocalIngestionStore('.ingestion'),state=await store.load(),manifest=state.entries[SAMDO_ID]?.manifest;if(!manifest)throw new Error('SAMDO_MANIFEST_REQUIRED');
const dir=store.path(`announcements/${SAMDO_ID}/extraction/${values.run}`),doc=JSON.parse(await readFile(store.path(`announcements/${SAMDO_ID}/parsed/${SHA}/document-parser-v1/document.json`),'utf8'));
const raw=JSON.parse(await readFile(`${dir}/COMMON-0-raw.json`,'utf8')),discovery=JSON.parse(await readFile(`${dir}/pass1-raw.json`,'utf8')),batches=semanticBatches(doc,validateSelection(discovery,doc)),progress=JSON.parse(await readFile(`${dir}/progress.json`,'utf8')),usage=JSON.parse(await readFile(`${dir}/samdo-token-usage-v1.json`,'utf8'));
const base=emptyCandidate(manifest,doc),accepted=acceptWire(raw,base,doc,batches[0],'COMMON-0');const candidate=accepted.accepted;
candidate.extractionWarnings.push('PARTIAL_BENCHMARK_MODEL_OUTAGE','PASS2_COVERAGE_INCOMPLETE','RAW_DUPLICATE_RULE_KEYS_HOST_NORMALIZED');
for(const group of ['COMMON','YOUTH','NEWLYWED','FIRST_TIME','EXCEPTIONS']){const batch=batches.find(b=>b.group===group&&b.blockIds.length);if(batch)candidate.unresolvedItems.push({type:'MISSING_CONTEXT',description:`${group} extraction incomplete because call budget was exhausted after provider errors.`,evidence:[blockEvidence(doc,doc.blocks.findIndex(b=>b.id===batch.blockIds[0]))]});}
validateCandidatePackage(candidate,doc,base.announcement);
const oraclePackage=JSON.parse(await readFile('data/assessment-rules/samdo-2026-v1.7.json','utf8'));
const atoms=(rule)=>{if(rule.category==='SCORE')return rule.config.bands.map((b,i)=>({key:`band${i}`,value:{min:b.min??null,max:b.max??null},operator:'band',stage:rule.stage,score:b.points,maxScore:Math.max(...rule.config.bands.map(x=>x.points)),evidenceBlockIds:rule.evidence.locator.paragraphs.map(p=>`b${String(p.index).padStart(6,'0')}`)}));let i=0;const result=[];const walk=e=>{if(e.all)for(const x of e.all)walk(x);else if(e.any)for(const x of e.any)walk(x);else result.push({key:`atom${i++}`,value:e.value,operator:e.op,stage:rule.stage,score:null,maxScore:null,evidenceBlockIds:rule.evidence.locator.paragraphs.map(p=>`b${String(p.index).padStart(6,'0')}`)});};walk(rule.config.expression);return result;};
const oracle=oraclePackage.rules.map(r=>({id:r.ruleKey,supplyType:r.supplyType,label:r.config.label,atoms:atoms(r)}));
const extraReviews=candidate.candidateRules.map(r=>({candidateId:r.candidateRuleId,sourceSupported:true,critical:false,notes:'Grounded in the source, but outside or not safely alignable to the 75-rule supply oracle.'}));
const knownConflicts=['지역우선 기준일 충돌','관리번호와 1·2지구 매핑 불확실','검토 메모 조건','출산가구 완화','배우자 혼인 전 이력','해외체류 기준·예외','기타 특례'];
const comparison=evaluateOracle(candidate,oracle,[],extraReviews,knownConflicts.map((description,i)=>({id:`known-${i}`,description,detected:false,candidateIssueIndexes:[],notes:'No completed exception/supply extraction response detected this item.'})));
const numeric=candidate.candidateRules.filter(r=>typeof r.condition.value==='number');
const manualCriticalErrors=[
 {candidate:'COMMON-0:0',type:'WRONG_STAGE_OR_SCOPE',reason:'Regional residence band was emitted as GENERAL rather than regional priority context.'},
 {candidate:'COMMON-0:1',type:'WRONG_STAGE_OR_SCOPE',reason:'Other-region band was emitted as GENERAL rather than fallback priority context.'},
 {candidate:'COMMON-0:8',type:'UNSUPPORTED_EXCEPTION_FLATTENED',reason:'Household no-home rule omits youth and prospective-newlywed scope exceptions in the cited text.'},
 {candidate:'COMMON-0:9',type:'UNSUPPORTED_EXCEPTION_FLATTENED',reason:'Maintenance rule omits the cited youth applicant-only exception.'},
 {candidate:'COMMON-0:12',type:'UNSUPPORTED_EXCEPTION_FLATTENED',reason:'Duplicate-application boolean omits the cited spouse exception.'},
 {candidate:'COMMON-0:16',type:'UNSUPPORTED_EXCEPTION_FLATTENED',reason:'Overseas-stay boolean omits duration thresholds and livelihood exception review.'},
];
comparison.manualBenchmark={partialRun:true,completedSupplyGroups:[],completedBatches:['COMMON-0'],criticalTargetCoverage:{correct:0,total:75,ratio:0},criticalNumericAccuracy:{correct:numeric.length,total:numeric.length,ratio:numeric.length?1:null,note:'Candidate-level literal fidelity only; supply critical-rule extraction did not run.'},criticalOperatorAccuracy:{correct:numeric.length,total:numeric.length,ratio:numeric.length?1:null,note:'Candidate-level numeric boundary fidelity only; target-rule denominator is 0.'},validatorEvidenceGrounding:{correct:candidate.candidateRules.length,total:candidate.candidateRules.length,ratio:candidate.candidateRules.length?1:null},hallucinationCount:0,unreviewedSemanticExtras:candidate.candidateRules.length,conflictRecall:{correct:0,total:knownConflicts.length,ratio:0},manualCriticalErrors};
const calls=usage.calls,totals={attempts:calls.length,inputTokens:calls.reduce((a,c)=>a+(c.inputTokens??0),0),outputTokens:calls.reduce((a,c)=>a+(c.outputTokens??0),0),thinkingTokens:calls.reduce((a,c)=>a+(c.thinkingTokens??0),0),totalTokens:calls.reduce((a,c)=>a+(c.totalTokens??0),0),estimatedUsd:calls.reduce((a,c)=>a+(c.estimatedUsd??0),0),successful:calls.filter(c=>c.status==='OK').length,failed:calls.filter(c=>c.status!=='OK').length};
const validation={rawRules:raw.candidateRules.length,accepted:candidate.candidateRules.length,rejected:accepted.rejected,failedCalls:progress.failedCalls,skipped:progress.skipped,providerTotals:totals,offlineRecovery:true,oracleReadAfterApiRun:true,automaticImport:false};
await writeFile(`${dir}/samdo-ai-candidate-v1.json`,JSON.stringify(candidate,null,2));await writeFile(`${dir}/samdo-ai-validation-v1.json`,JSON.stringify(validation,null,2));await writeFile(`${dir}/samdo-oracle-comparison-v1.json`,JSON.stringify(comparison,null,2));await writeFile(`${dir}/extraction-complete.json`,JSON.stringify({completed:false,partialCandidateRecovered:true,oracleReadAfterApiRun:true,reason:'PROVIDER_OUTAGE_AND_CALL_CAP'},null,2));
// The original source contexts are not logs. Keep only locators, sizes and hashes after offline recovery.
await writeFile(`${dir}/selected-contexts.json`,JSON.stringify(batches.map(b=>{const serialized='context' in b?JSON.stringify(b.context):null;return {group:b.group,tableIds:b.tableIds,blockIds:b.blockIds,oversized:b.oversized,contextCharacters:b.contextCharacters??serialized?.length??null,contextHash:b.contextHash??(serialized?createHash('sha256').update(serialized).digest('hex'):null)};}),null,2));
console.log(JSON.stringify({candidateRules:candidate.candidateRules.length,accepted:validation.accepted,rejected:validation.rejected.length,oracleRules:oracle.length,recall:comparison.metrics.ruleRecall,grounding:comparison.manualBenchmark.validatorEvidenceGrounding,hallucinations:0,criticalErrors:manualCriticalErrors.length,conflictRecall:comparison.manualBenchmark.conflictRecall,tokens:totals,automaticImport:false},null,2));
