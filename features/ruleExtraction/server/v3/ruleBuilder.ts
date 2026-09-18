import type { CandidateRule, Evidence } from '../candidate.ts';
import type { ParsedDocument } from '../parsedDocument.ts';
import { factEvidenceText,type ExtractedFact } from './facts.ts';
import type { SemanticBinding } from './contract.ts';
import type { SemanticTask } from './tasks.ts';

const category=(role:string):CandidateRule['category']=>role.includes('SCORELESS')?'lottery':role.includes('SCORE')?'score':role.includes('INCOME')?'incomeThreshold':role.includes('ASSET')?'assetThreshold':role.includes('AGE')?'age':role.includes('PAYMENT_COUNT')?'paymentCount':role.includes('SAVINGS')?'savingsAmount':role.includes('ACCOUNT')?'subscriptionAccount':role.includes('REGION')?'region':role.includes('EXCEPTION')?'exception':role.includes('SUPPLY_RATIO')?'supplyPercentage':role.includes('LOTTERY')?'lottery':role.includes('HOMELESS')?'housingOwnership':role.includes('MARRIAGE')?'maritalStatus':role.includes('DURATION')||role.includes('YEARS')?'residenceDuration':'eligibility';
const input=(role:string,fact:ExtractedFact)=>`${role.toLowerCase().replaceAll('.','_')}_${fact.unit.toLowerCase()}`;
const evidence=(document:ParsedDocument,fact:ExtractedFact):Evidence=>({documentId:document.documentId,blockId:fact.tableId===null?fact.sourceId:null,tableId:fact.tableId,row:fact.row,column:fact.column,snippet:factEvidenceText(document,fact).slice(0,8000),locator:fact.sourceLocator});
export type HostConfidence={level:'HIGH'|'MEDIUM'|'REVIEW_REQUIRED';reason:string};
export function deriveHostConfidence(document:ParsedDocument,binding:SemanticBinding,boundFacts:ExtractedFact[]):HostConfidence {
  const texts=[...new Set([...binding.sourceIds,...binding.qualifierSourceIds,...boundFacts.map(f=>f.sourceId)])].map(id=>id.startsWith('cell:')?boundFacts.find(f=>f.sourceId===id)?factEvidenceText(document,boundFacts.find(f=>f.sourceId===id)!):'':document.blocks.find(b=>b.id===id)?.text??'').join(' ');
  if(binding.qualifierSourceIds.length||/(단,|다만|제외|예외|특례|검토|확인 필요)/u.test(texts)||boundFacts.some(f=>f.bindingStatus!=='BOUND'))return {level:'REVIEW_REQUIRED',reason:'예외, 검토 문맥 또는 모호한 fact 결합이 있어 사람 검토가 필요합니다.'};
  if(new Set([...binding.sourceIds,...boundFacts.map(f=>f.sourceId)]).size>1||boundFacts.some(f=>f.tableId&&document.tables.find(t=>t.id===f.tableId)?.fidelity==='GEOMETRY_INFERRED'))return {level:'MEDIUM',reason:'여러 원문 위치 또는 재구성된 표를 결합했습니다.'};
  return {level:'HIGH',reason:'단일 원문 위치의 deterministic fact에 직접 연결했습니다.'};
}
export function buildCandidateRules(document:ParsedDocument,task:SemanticTask,binding:SemanticBinding,facts:ExtractedFact[]):{rules:CandidateRule[];unresolved:string[]} {
  const byId=new Map(facts.map(f=>[f.factId,f])),bound=binding.factIds.map(id=>byId.get(id)).filter((f):f is ExtractedFact=>!!f);
  if(!bound.length)return {rules:[],unresolved:[`NO_BOUND_FACT:${binding.bindingId}`]};
  if(bound.some(f=>f.bindingStatus!=='BOUND'))return {rules:[],unresolved:[`AMBIGUOUS_OPERATOR_BINDING:${binding.bindingId}`]};
  const confidence=deriveHostConfidence(document,binding,bound),point=bound.find(f=>f.type==='SCORE'&&f.unit==='POINT'),max=bound.find(f=>f.type==='SCORE'&&f.unit==='MAX_POINT'),isScore=binding.semanticRole.includes('SCORE')&&!binding.semanticRole.includes('SCORELESS');
  if(isScore&&(!point||!max))return {rules:[],unresolved:[`SCORE_POINT_AND_MAX_FACT_REQUIRED:${binding.bindingId}`]};
  const nonScore=bound.filter(f=>f.type!=='SCORE'),thresholdFacts=isScore&&nonScore.length?nonScore:bound.filter(f=>!(f.type==='SCORE'&&f.unit==='MAX_POINT'));
  const rules=thresholdFacts.map((fact,index):CandidateRule=>{
    const supplyType=task.scope==='COMMON'?'GENERAL':task.scope;
    return {candidateRuleId:`v3:${task.name}:${binding.bindingId}:${index}`,supplyType,stage:task.stage,category:category(binding.semanticRole),ruleKey:`${binding.semanticRole.toLowerCase()}.${fact.factId}`,
      condition:{input:input(binding.semanticRole,fact),operator:fact.operator??'eq',value:fact.normalizedValue,values:[]},score:isScore?Number(point?.normalizedValue??fact.normalizedValue):null,maxScore:isScore?Number(max?.normalizedValue??point?.normalizedValue??fact.normalizedValue):null,
      requiredInputs:[input(binding.semanticRole,fact)],relatedExceptionRuleKeys:[],evidence:[evidence(document,fact)],confidence:confidence.level==='REVIEW_REQUIRED'?'LOW':confidence.level,confidenceReason:confidence.reason,reviewStatus:'REVIEW_REQUIRED'};});
  return {rules,unresolved:[]};
}
