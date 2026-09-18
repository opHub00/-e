import { createHash } from 'node:crypto';
import { array,object,exact,string,validateParsedDocument,type ParsedDocument } from './parsedDocument.ts';
import { blockEvidence,SEMANTIC_PROMPT_VERSION,validateCandidatePackage,type CandidateRulePackage,type CandidateRule } from './candidate.ts';
import type { Manifest } from '../../announcementIngestion/server/model.ts';
import type { RuleExtractor } from './extraction.ts';
import type { StructuredProvider } from './geminiProvider.ts';
import { DISCOVERY_PROMPT,DISCOVERY_SCHEMA,SEMANTIC_PROMPT,SEMANTIC_SCHEMA } from './semanticContract.ts';
import { sourceIndex,validateSelection,semanticBatches,type SemanticBatch } from './semanticContext.ts';

export type RejectedCandidate={batch:string;kind:string;reason:string;raw:unknown};
export function emptyCandidate(manifest:Manifest,d:ParsedDocument):CandidateRulePackage{return {schemaVersion:1,promptVersion:SEMANTIC_PROMPT_VERSION,sourceStatus:'REFERENCE',reviewStatus:'REVIEW_REQUIRED',announcement:{canonicalId:manifest.canonicalId,title:manifest.announcement.title,announcementDate:manifest.announcement.announcementDate},document:{documentId:d.documentId,sha256:d.sha256,parserVersion:d.parserVersion},candidateRules:[],unresolvedItems:[],conflicts:[],extractionWarnings:[]};}
export function hydrateEvidence(raw:unknown,d:ParsedDocument,allowed:Set<string>){return array(raw,50).map(value=>{const e=object(value);exact(e,['blockId','snippet']);const id=string(e.blockId);if(!allowed.has(id))throw new Error('EVIDENCE_OUTSIDE_SELECTED_CONTEXT');const index=d.blocks.findIndex(b=>b.id===id);return {...blockEvidence(d,index),snippet:string(e.snippet,8000)};});}
export function acceptWire(raw:unknown,base:CandidateRulePackage,d:ParsedDocument,batch:SemanticBatch,label:string){
  const accepted=structuredClone(base);accepted.candidateRules=[];accepted.unresolvedItems=[];accepted.conflicts=[];accepted.extractionWarnings=[];
  const rejected:RejectedCandidate[]=[];const o=object(raw);exact(o,['candidateRules','unresolvedItems','conflicts','extractionWarnings']);const allowed=new Set(batch.blockIds);
  for(const kind of ['candidateRules','unresolvedItems','conflicts'] as const){
    for(const [i,rawItem] of array(o[kind],1000).entries()){
      try{const item={...object(rawItem)};
        if(kind==='conflicts')item.alternatives=array(item.alternatives,30).map(a=>({...object(a),evidence:hydrateEvidence(object(a).evidence,d,allowed)}));
        else item.evidence=hydrateEvidence(item.evidence,d,allowed);
        if(kind==='candidateRules'){string(item.candidateRuleId);item.candidateRuleId=`${label}:${i}`;item.ruleKey=`${label}:${string(item.ruleKey,180)}`;}
        const probe={...base,candidateRules:[],unresolvedItems:[],conflicts:[],extractionWarnings:[],[kind]:[item]};
        validateCandidatePackage(probe,d,base.announcement);(accepted[kind] as unknown[]).push(item);
      }catch(error){rejected.push({batch:label,kind,reason:error instanceof Error?error.message:'INVALID_CANDIDATE',raw:rawItem});}
    }
  }
  accepted.extractionWarnings=array(o.extractionWarnings,1000).map(x=>string(x));return {accepted,rejected};
}
export function mergeCandidates(packages:CandidateRulePackage[]){
  if(!packages.length)throw new Error('NO_PACKAGES');const result=structuredClone(packages[0]);result.candidateRules=[];result.unresolvedItems=[];result.conflicts=[];result.extractionWarnings=[];
  const seen=new Map<string,CandidateRule>();const duplicates:{kept:string;duplicate:string}[]=[];
  for(const p of packages){
    if(JSON.stringify(p.document)!==JSON.stringify(result.document)||JSON.stringify(p.announcement)!==JSON.stringify(result.announcement))throw new Error('MERGE_CONTEXT_MISMATCH');
    for(const r of p.candidateRules){const signature=JSON.stringify([r.supplyType,r.stage,r.category,r.condition,r.score,r.maxScore,[...r.requiredInputs].sort()]);const prior=seen.get(signature);
      if(prior){duplicates.push({kept:prior.candidateRuleId,duplicate:r.candidateRuleId});for(const e of r.evidence)if(!prior.evidence.some(x=>JSON.stringify(x)===JSON.stringify(e)))prior.evidence.push(e);}
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
    await this.record('input-provenance',{document:d.sha256,parserVersion:d.parserVersion,promptVersion:SEMANTIC_PROMPT_VERSION,indexHash:createHash('sha256').update(JSON.stringify(index)).digest('hex'),oracleRead:false});
    const discovered=await this.provider.generate('pass1',DISCOVERY_PROMPT,index,DISCOVERY_SCHEMA);await this.record('pass1-raw',discovered);
    const selection=validateSelection(discovered,d),batches=semanticBatches(d,selection);await this.record('selected-contexts',batches);
    const packages=[base],rejected:RejectedCandidate[]=[],failedCalls:unknown[]=[],skipped:unknown[]=[],repeats:Record<string,number>={};let rawRuleCount=0;
    for(const [i,batch] of batches.entries()){
      const label=`${batch.group}-${i}`;
      if(batch.oversized){skipped.push({label,reason:'OVERSIZED_CONTEXT',tableIds:batch.tableIds});base.unresolvedItems.push({type:'OVERSIZED_CONTEXT',description:label,evidence:[blockEvidence(d,d.blocks.findIndex(b=>b.id===batch.blockIds[0]))]});continue;}
      for(const id of batch.blockIds)repeats[id]=(repeats[id]??0)+1;
      try{
        const raw=await this.provider.generate(label,SEMANTIC_PROMPT,{group:batch.group,context:batch.context},SEMANTIC_SCHEMA);await this.record(`${label}-raw`,raw);
        if(Array.isArray((raw as any)?.candidateRules))rawRuleCount+=(raw as any).candidateRules.length;
        const a=acceptWire(raw,base,d,batch,label);packages.push(a.accepted);rejected.push(...a.rejected);
      }catch(error){failedCalls.push({label,error:error instanceof Error?error.message:'UNKNOWN'});}
      await this.record('progress',{rawRuleCount,rejected,failedCalls,skipped,completedBatch:i});
    }
    const {result,duplicates}=mergeCandidates(packages);validateCandidatePackage(result,d,base.announcement);
    await this.record('samdo-ai-validation-v1',{rawRuleCount,acceptedBeforeMerge:packages.reduce((a,p)=>a+p.candidateRules.length,0),acceptedAfterMerge:result.candidateRules.length,rejectedCandidates:rejected,duplicates,failedCalls,skipped,
      blockExposureCounts:repeats,maxBlockExposure:Math.max(0,...Object.values(repeats)),repeatedBlockCount:Object.values(repeats).filter(x=>x>1).length});
    await this.record('samdo-ai-candidate-v1',result);
    await this.record('extraction-complete',{completed:true,allCallsSucceeded:failedCalls.length===0,oracleRead:false,promptVersion:SEMANTIC_PROMPT_VERSION});
    return result;
  }
}
