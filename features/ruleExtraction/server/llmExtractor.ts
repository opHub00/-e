import { createHash } from 'node:crypto';
import { array,object,exact,string,validateParsedDocument,type ParsedDocument } from './parsedDocument.ts';
import { blockEvidence,SEMANTIC_PROMPT_VERSION_V3,validateCandidatePackage,type CandidateRulePackage,type CandidateRule } from './candidate.ts';
import type { Manifest } from '../../announcementIngestion/server/model.ts';
import type { RuleExtractor } from './extraction.ts';
import type { StructuredProvider } from './geminiProvider.ts';
import { DISCOVERY_PROMPT,DISCOVERY_SCHEMA,SEMANTIC_PROMPT,SEMANTIC_SCHEMA } from './semanticContract.ts';
import { sourceIndex,validateSelection,applySelectionPolicy,semanticBatches,selectionQuality,type SemanticBatch } from './semanticContext.ts';
import { buildExtractionPlan } from './extractionPlan.ts';

export type RejectedCandidate={batch:string;kind:string;reason:string;raw:unknown};
export function emptyCandidate(manifest:Manifest,d:ParsedDocument):CandidateRulePackage{return {schemaVersion:1,promptVersion:SEMANTIC_PROMPT_VERSION_V3,sourceStatus:'REFERENCE',reviewStatus:'REVIEW_REQUIRED',announcement:{canonicalId:manifest.canonicalId,title:manifest.announcement.title,announcementDate:manifest.announcement.announcementDate},document:{documentId:d.documentId,sha256:d.sha256,parserVersion:d.parserVersion},candidateRules:[],unresolvedItems:[],conflicts:[],extractionWarnings:[]};}
export function hydrateEvidence(raw:unknown,d:ParsedDocument,allowed:Set<string>){return array(raw,50).map(value=>{const e=object(value);exact(e,['blockId','snippet']);const id=string(e.blockId);if(!allowed.has(id))throw new Error('EVIDENCE_OUTSIDE_SELECTED_CONTEXT');const index=d.blocks.findIndex(b=>b.id===id);return {...blockEvidence(d,index),snippet:string(e.snippet,8000)};});}
export function acceptWire(raw:unknown,base:CandidateRulePackage,d:ParsedDocument,batch:SemanticBatch,label:string){
  const accepted=structuredClone(base);accepted.candidateRules=[];accepted.unresolvedItems=[];accepted.conflicts=[];accepted.extractionWarnings=[];
  const rejected:RejectedCandidate[]=[];const o=object(raw);exact(o,['candidateRules','unresolvedItems','conflicts','extractionWarnings']);const allowed=new Set(batch.blockIds);
  const rawRules=array(o.candidateRules,1000),hostKeys=rawRules.map((value,i)=>{const key=string(object(value).ruleKey,160);return `${label}:${i}:${key}`;}),rawKeyMap=new Map<string,string>();for(const [i,value] of rawRules.entries()){const key=string(object(value).ruleKey,160);if(!rawKeyMap.has(key))rawKeyMap.set(key,hostKeys[i]);}
  const pendingRelations=new Map<string,string[]>();
  for(const kind of ['candidateRules','unresolvedItems','conflicts'] as const){
    for(const [i,rawItem] of array(o[kind],1000).entries()){
      try{const item={...object(rawItem)};
        if(kind==='conflicts')item.alternatives=array(item.alternatives,30).map(a=>({...object(a),evidence:hydrateEvidence(object(a).evidence,d,allowed)}));
        else item.evidence=hydrateEvidence(item.evidence,d,allowed);
        if(kind==='candidateRules'){string(item.candidateRuleId);string(item.ruleKey,160);item.candidateRuleId=`${label}:${i}`;item.ruleKey=hostKeys[i];pendingRelations.set(item.candidateRuleId as string,array(item.relatedExceptionRuleKeys??[],30).map(v=>string(v,160)));item.relatedExceptionRuleKeys=[];}
        const probe={...base,candidateRules:[],unresolvedItems:[],conflicts:[],extractionWarnings:[],[kind]:[item]};
        validateCandidatePackage(probe,d,base.announcement);(accepted[kind] as unknown[]).push(item);
      }catch(error){rejected.push({batch:label,kind,reason:error instanceof Error?error.message:'INVALID_CANDIDATE',raw:rawItem});}
    }
  }
  accepted.extractionWarnings=array(o.extractionWarnings,1000).map(x=>string(x));
  for(const rule of accepted.candidateRules){const relations=pendingRelations.get(rule.candidateRuleId)??[];rule.relatedExceptionRuleKeys=relations.flatMap(key=>rawKeyMap.has(key)?[rawKeyMap.get(key)!]:[]);if(relations.length!==rule.relatedExceptionRuleKeys.length)accepted.extractionWarnings.push(`UNKNOWN_EXCEPTION_RELATION:${rule.candidateRuleId}`);}
  applyBatchSafety(accepted,rejected,d,batch,label);const validExceptionKeys=new Set(accepted.candidateRules.filter(r=>r.category==='exception').map(r=>r.ruleKey));for(const rule of accepted.candidateRules){const before=rule.relatedExceptionRuleKeys.length;rule.relatedExceptionRuleKeys=rule.relatedExceptionRuleKeys.filter(key=>validExceptionKeys.has(key));if(before!==rule.relatedExceptionRuleKeys.length)accepted.extractionWarnings.push(`DROPPED_REJECTED_EXCEPTION_RELATION:${rule.candidateRuleId}`);}validateCandidatePackage(accepted,d,base.announcement);return {accepted,rejected};
}
function applyBatchSafety(p:CandidateRulePackage,rejected:RejectedCandidate[],d:ParsedDocument,batch:SemanticBatch,label:string){
  const tableWarning=batch.tableIds.some(id=>(d.tables.find(t=>t.id===id)?.warnings.length??0)>0),exceptionIds=new Set(batch.exceptionBlockIds);
  const hasExceptionOutput=p.candidateRules.some(r=>r.category==='exception'||r.relatedExceptionRuleKeys.length)||p.unresolvedItems.length>0||p.conflicts.length>0;
  if(batch.group==='COMMON'||batch.group==='EXCEPTIONS')for(const rule of [...p.candidateRules])if(rule.stage!=='COMMON'){p.candidateRules.splice(p.candidateRules.indexOf(rule),1);rejected.push({batch:label,kind:'candidateRules',reason:batch.group==='COMMON'?'COMMON_STAGE_MISMATCH':'EXCEPTION_STAGE_MISMATCH',raw:rule});}
  if(batch.hasExceptionContext&&!hasExceptionOutput){
    for(const rule of [...p.candidateRules])if(rule.evidence.some(e=>e.blockId!==null&&exceptionIds.has(e.blockId))){p.candidateRules.splice(p.candidateRules.indexOf(rule),1);rejected.push({batch:label,kind:'candidateRules',reason:'EXCEPTION_DROPPED',raw:rule});}
    const first=batch.exceptionBlockIds[0];if(first)p.unresolvedItems.push({type:'UNSUPPORTED_EXCEPTION',description:`${label}: source exception context was not preserved by the model.`,evidence:[blockEvidence(d,d.blocks.findIndex(b=>b.id===first))]});p.extractionWarnings.push(`EXCEPTION_DROPPED:${label}`);
  }
  for(const rule of p.candidateRules){const exceptionEvidence=rule.evidence.some(e=>e.blockId!==null&&exceptionIds.has(e.blockId));if(rule.confidence==='HIGH'&&(exceptionEvidence||rule.evidence.length>1||tableWarning||p.conflicts.length>0)){rule.confidence='MEDIUM';rule.confidenceReason=`Host-downgraded: exception/multi-source/table-warning context requires review. ${rule.confidenceReason}`;p.extractionWarnings.push(`HIGH_CONFIDENCE_DOWNGRADED:${rule.candidateRuleId}`);}}
}
export function mergeCandidates(packages:CandidateRulePackage[]){
  if(!packages.length)throw new Error('NO_PACKAGES');const result=structuredClone(packages[0]);result.candidateRules=[];result.unresolvedItems=[];result.conflicts=[];result.extractionWarnings=[];
  const seen=new Map<string,CandidateRule>();const duplicates:{kept:string;duplicate:string}[]=[];
  for(const p of packages){
    if(JSON.stringify(p.document)!==JSON.stringify(result.document)||JSON.stringify(p.announcement)!==JSON.stringify(result.announcement))throw new Error('MERGE_CONTEXT_MISMATCH');
    for(const r of p.candidateRules){const signature=JSON.stringify([r.supplyType,r.stage,r.category,r.condition,r.score,r.maxScore,[...r.requiredInputs].sort()]);const prior=seen.get(signature);
      if(prior){duplicates.push({kept:prior.candidateRuleId,duplicate:r.candidateRuleId});for(const e of r.evidence)if(!prior.evidence.some(x=>JSON.stringify(x)===JSON.stringify(e)))prior.evidence.push(e);prior.relatedExceptionRuleKeys=[...new Set([...prior.relatedExceptionRuleKeys,...r.relatedExceptionRuleKeys])];}
      else{const copy=structuredClone(r);seen.set(signature,copy);result.candidateRules.push(copy);}
    }
    result.unresolvedItems.push(...p.unresolvedItems);result.conflicts.push(...p.conflicts);result.extractionWarnings.push(...p.extractionWarnings);
  }
  result.extractionWarnings=[...new Set(result.extractionWarnings)];return {result,duplicates};
}
export class LLMRuleExtractor implements RuleExtractor {
  private provider:StructuredProvider;private record:(name:string,value:unknown)=>Promise<void>;
  constructor(provider:StructuredProvider,record:(name:string,value:unknown)=>Promise<void>){this.provider=provider;this.record=record;}
  async extract({manifest,document:d}:{manifest:Manifest;document:ParsedDocument}){
    validateParsedDocument(d);if(!d.quality.extractionAllowed)throw new Error('DOCUMENT_QUALITY_GATE');
    const base=emptyCandidate(manifest,d);const index=sourceIndex(d);
    await this.record('input-provenance',{document:d.sha256,parserVersion:d.parserVersion,promptVersion:SEMANTIC_PROMPT_VERSION_V3,indexHash:createHash('sha256').update(JSON.stringify(index)).digest('hex'),oracleRead:false});
    const discovered=await this.provider.generate('pass1',DISCOVERY_PROMPT,index,DISCOVERY_SCHEMA);await this.record('pass1-raw',discovered);
    const rawSelection=validateSelection(discovered,d),policyResult=applySelectionPolicy(d,rawSelection),selection=policyResult.selection,batches=semanticBatches(d,selection,14000),plan=buildExtractionPlan(batches),quality=selectionQuality(d,selection,batches);
    await this.record('selection-policy',{...policyResult.report,quality});await this.record('call-plan',{policy:plan.policy,counts:plan.counts,available:plan.available,totalPlannedHttpAttempts:plan.totalPlannedHttpAttempts,missingGuaranteedScopes:plan.missingGuaranteedScopes,schedule:plan.schedule.map(x=>({label:x.label,group:x.group,tableIds:x.batch.tableIds,blockIds:x.batch.blockIds,hasExceptionContext:x.batch.hasExceptionContext,contextHash:x.batch.contextHash}))});
    // Persist provenance and exposure sizes, never the original source context sent to the provider.
    await this.record('selected-contexts',batches.map(b=>({group:b.group,tableIds:b.tableIds,blockIds:b.blockIds,oversized:b.oversized,hasExceptionContext:b.hasExceptionContext,exceptionBlockIds:b.exceptionBlockIds,
      contextCharacters:JSON.stringify(b.context).length,contextHash:b.contextHash})));
    const packages=[base],rejected:RejectedCandidate[]=[],failedCalls:unknown[]=[],skipped:unknown[]=[],repeats:Record<string,number>={};let rawRuleCount=0;
    for(const batch of batches.filter(b=>b.oversized)){const label=`${batch.group}-oversized`;skipped.push({label,reason:'OVERSIZED_CONTEXT',tableIds:batch.tableIds});base.unresolvedItems.push({type:'OVERSIZED_CONTEXT',description:label,evidence:[blockEvidence(d,d.blocks.findIndex(b=>b.id===batch.blockIds[0]))]});}
    const successfulGroups=new Set<string>();
    for(const [i,item] of plan.schedule.entries()){
      const {batch,label}=item;
      for(const id of batch.blockIds)repeats[id]=(repeats[id]??0)+1;
      try{
        const raw=await this.provider.generate(label,SEMANTIC_PROMPT,{group:batch.group,context:batch.context},SEMANTIC_SCHEMA);await this.record(`${label}-raw`,raw);
        if(Array.isArray((raw as any)?.candidateRules))rawRuleCount+=(raw as any).candidateRules.length;
        const a=acceptWire(raw,base,d,batch,label);packages.push(a.accepted);rejected.push(...a.rejected);successfulGroups.add(batch.group);
      }catch(error){failedCalls.push({label,error:error instanceof Error?error.message:'UNKNOWN'});}
      await this.record('progress',{rawRuleCount,rejected,failedCalls,skipped,completedBatch:i});
    }
    const {result,duplicates}=mergeCandidates(packages);validateCandidatePackage(result,d,base.announcement);
    addCompletenessWarnings(result,successfulGroups);
    await this.record('samdo-ai-validation-v1',{rawRuleCount,acceptedBeforeMerge:packages.reduce((a,p)=>a+p.candidateRules.length,0),acceptedAfterMerge:result.candidateRules.length,rejectedCandidates:rejected,duplicates,failedCalls,skipped,
      blockExposureCounts:repeats,maxBlockExposure:Math.max(0,...Object.values(repeats)),repeatedBlockCount:Object.values(repeats).filter(x=>x>1).length});
    await this.record('samdo-ai-candidate-v1',result);
    await this.record('extraction-complete',{completed:true,allCallsSucceeded:failedCalls.length===0,oracleRead:false,promptVersion:SEMANTIC_PROMPT_VERSION_V3});
    return result;
  }
}
const REQUIRED_CATEGORY_GROUPS:Record<string,string[][]>={YOUTH:[['age','eligibility'],['incomeThreshold'],['assetThreshold'],['subscriptionAccount','paymentCount'],['stage']],NEWLYWED:[['maritalStatus','eligibility'],['incomeThreshold'],['assetThreshold'],['subscriptionAccount','paymentCount'],['stage']],FIRST_TIME:[['housingOwnership','eligibility'],['incomeThreshold'],['assetThreshold'],['savingsAmount'],['stage','lottery']]};
function addCompletenessWarnings(p:CandidateRulePackage,groups:Set<string>){for(const [group,alternatives] of Object.entries(REQUIRED_CATEGORY_GROUPS))if(groups.has(group)){const present=new Set(p.candidateRules.filter(r=>r.supplyType===group).map(r=>r.category));const missing=alternatives.filter(options=>!options.some(x=>present.has(x as any))).map(x=>x.join('|'));if(missing.length)p.extractionWarnings.push(`INCOMPLETE_SCOPE_EXTRACTION:${group}:${missing.join(',')}`);}}
