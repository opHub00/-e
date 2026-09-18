import type { CandidateRule } from '../candidate.ts';
import type { ParsedDocument } from '../parsedDocument.ts';
import { V3_BINDING_PROMPT,GEMINI_SAFE_BINDING_SCHEMA,validateBindingResponse,type SemanticBindingResponse } from './contract.ts';
import type { ExtractedFact } from './facts.ts';
import { unresolvedExceptions,discoverExceptionSources } from './exceptions.ts';
import { buildCallPlan } from './plans.ts';
import { v3RetryDecision } from './retry.ts';
import { buildCandidateRules } from './ruleBuilder.ts';
import { providerTaskPayload,type SemanticTaskInput,type TaskStatus } from './tasks.ts';

export interface V3BindingProvider { generate(label:string,system:string,input:unknown,schema:unknown):Promise<unknown> }
export type V3TaskRun={taskName:string;status:TaskStatus;attempts:number;bindingCount:number;unresolvedCount:number;error:string|null};
export type V3RunnerOptions={plan:'PLAN_A_16'|'PLAN_B_24';retryBudget?:number;rateLimitBackoffMs?:number};
const code=(error:unknown)=>error instanceof Error?(error.message.match(/HTTP_(?:400|401|403|429|503)|INCOMPLETE_OUTPUT/)?.[0]??error.message):'UNKNOWN_PROVIDER_ERROR';
const split=(input:SemanticTaskInput):SemanticTaskInput=>{const sources=input.sources.slice(0,Math.max(1,Math.ceil(input.sources.length/2))),ids=new Set(sources.map(source=>source.sourceId)),facts=input.facts.filter(fact=>ids.has(fact.sourceId));const next={...input,sources,facts,inputChars:0};next.inputChars=JSON.stringify(providerTaskPayload(next)).length;return next;};

export async function runV3BindingBenchmark(document:ParsedDocument,facts:ExtractedFact[],provider:V3BindingProvider,options:V3RunnerOptions){
  const plan=buildCallPlan(document,facts,options.plan),rules:CandidateRule[]=[],responses:{taskName:string;response:SemanticBindingResponse}[]=[],runs:V3TaskRun[]=[],warnings:string[]=[];let retryBudget=options.retryBudget??2;
  for(const original of plan.inputs){let input=original,attempt=0,response:SemanticBindingResponse|null=null,lastError:string|null=null,status:TaskStatus='FAILED';
    const notReady=Object.entries(input.selection.roleCoverage).filter(([,coverage])=>coverage.status!=='READY');if(notReady.length){const reason=notReady.map(([role,coverage])=>`${role}:${coverage.status}`).join(',');runs.push({taskName:input.task.name,status:'SKIPPED',attempts:0,bindingCount:0,unresolvedCount:notReady.length,error:reason});warnings.push(`${input.task.name}:${reason}`);continue;}
    while(true){try{const raw=await provider.generate(input.task.name,V3_BINDING_PROMPT,providerTaskPayload(input),GEMINI_SAFE_BINDING_SCHEMA);response=validateBindingResponse(raw,input.facts,new Set(input.sources.map(source=>source.sourceId)),new Set(input.task.allowedRoles));status=response.unresolved.length&&!response.bindings.length?'INCOMPLETE':'SUCCESS';break;}catch(error){lastError=code(error);const decision=v3RetryDecision(lastError,attempt);if(retryBudget>0&&decision.retryable){retryBudget--;attempt++;if(decision.action==='SPLIT_ONCE')input=split(input);continue;}if(decision.action==='SKIP_WITH_BACKOFF'&&(options.rateLimitBackoffMs??0)>0)await new Promise(resolve=>setTimeout(resolve,options.rateLimitBackoffMs));status=decision.action==='SKIP_WITH_BACKOFF'?'SKIPPED':lastError==='INCOMPLETE_OUTPUT'?'INCOMPLETE':'FAILED';break;}}
    if(response){responses.push({taskName:input.task.name,response});for(const binding of response.bindings){const built=buildCandidateRules(document,input.task,binding,input.facts);rules.push(...built.rules);warnings.push(...built.unresolved.map(item=>`${input.task.name}:${item}`));}warnings.push(...response.unresolved.map(item=>`${input.task.name}:${item.reason}`));}
    runs.push({taskName:input.task.name,status,attempts:attempt+1,bindingCount:response?.bindings.length??0,unresolvedCount:response?.unresolved.length??0,error:lastError});
  }
  const allBindings=responses.flatMap(item=>item.response.bindings),exceptionUnresolved=unresolvedExceptions(discoverExceptionSources(document),allBindings);warnings.push(...exceptionUnresolved.map(item=>item.reason));
  return {plan:plan.name,rules,responses,runs,warnings,retryBudgetRemaining:retryBudget,providerCallUpperBound:plan.rows.length+(options.retryBudget??2)};
}
