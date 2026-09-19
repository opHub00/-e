import type { CandidateRule } from '../candidate.ts';
import type { ParsedDocument } from '../parsedDocument.ts';
import type { SemanticBindingResponse } from '../v3/contract.ts';
import type { ExtractedFact } from '../v3/facts.ts';
import { buildTaskInput,V3_TASKS } from '../v3/tasks.ts';
import { validateSemanticBindingV41,type GuardStatus,type SemanticErrorCategory } from './semanticSafety.ts';

export type ReplayResponse={taskName:string;response:SemanticBindingResponse};
export type ReplayRule={candidateRuleId:string;taskName:string;bindingId:string;status:GuardStatus;confidence:'HIGH'|'MEDIUM'|'REVIEW_REQUIRED';issues:{code:string;category:SemanticErrorCategory;severity:'REVIEW'|'REJECT'}[]};
export type V41Replay={existingRules:number;accepted:number;reviewRequired:number;rejected:number;highCriticalErrorsBefore:number;highCriticalErrorsRemaining:number;highCriticalErrorsHandled:number;taxonomy:Record<SemanticErrorCategory,number>;rules:ReplayRule[];ready:boolean};
const categories:SemanticErrorCategory[]=['WRONG_SEMANTIC_ROLE','WRONG_FACT_BINDING','WRONG_SCOPE','WRONG_EXCEPTION_RELATION','WRONG_CATEGORY','WRONG_STAGE','EVIDENCE_SEMANTIC_MISMATCH'];
const identity=(candidateRuleId:string)=>{const parts=candidateRuleId.split(':');return {taskName:parts[1]??'',bindingId:parts[2]??''};};

export function replayV41(document:ParsedDocument,facts:ExtractedFact[],responses:ReplayResponse[],existingRules:CandidateRule[],highCriticalErrorIds:string[]):V41Replay{
  const responseByTask=new Map(responses.map(item=>[item.taskName,item.response])),guardByBinding=new Map<string,ReturnType<typeof validateSemanticBindingV41>>();
  for(const [taskName,response] of responseByTask){const task=V3_TASKS.find(item=>item.name===taskName);if(!task)continue;const input=buildTaskInput(document,facts,task);for(const binding of response.bindings)guardByBinding.set(`${taskName}:${binding.bindingId}`,validateSemanticBindingV41(document,task,binding,input.facts,facts));}
  const rules:ReplayRule[]=existingRules.map(rule=>{const id=identity(rule.candidateRuleId),guard=guardByBinding.get(`${id.taskName}:${id.bindingId}`);return {candidateRuleId:rule.candidateRuleId,taskName:id.taskName,bindingId:id.bindingId,status:guard?.status??'REVIEW_REQUIRED',confidence:guard?.confidence.level??'REVIEW_REQUIRED',issues:(guard?.issues??[]).map(({code,category,severity})=>({code,category,severity}))};});
  const taxonomy=Object.fromEntries(categories.map(category=>[category,rules.filter(rule=>rule.issues.some(item=>item.category===category)).length])) as Record<SemanticErrorCategory,number>;
  const highSet=new Set(highCriticalErrorIds),remaining=rules.filter(rule=>highSet.has(rule.candidateRuleId)&&rule.status==='ACCEPTED'&&rule.confidence==='HIGH').length;
  const accepted=rules.filter(rule=>rule.status==='ACCEPTED').length,reviewRequired=rules.filter(rule=>rule.status==='REVIEW_REQUIRED').length,rejected=rules.filter(rule=>rule.status==='REJECTED').length;
  return {existingRules:rules.length,accepted,reviewRequired,rejected,highCriticalErrorsBefore:highCriticalErrorIds.length,highCriticalErrorsRemaining:remaining,highCriticalErrorsHandled:highCriticalErrorIds.length-remaining,taxonomy,rules,ready:rules.length===existingRules.length&&remaining===0};
}
