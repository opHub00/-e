import { createHash } from 'node:crypto';
import type { ParsedDocument } from '../parsedDocument.ts';
import { GEMINI_SAFE_BINDING_SCHEMA, V3_BINDING_PROMPT, V3_PROMPT_VERSION, validateBindingResponse, type SemanticBindingResponse } from '../v3/contract.ts';
import type { ExtractedFact } from '../v3/facts.ts';
import { PLAN_A_16, buildCallPlan } from '../v3/plans.ts';
import { providerTaskPayload } from '../v3/tasks.ts';
import type { V3BindingProvider } from '../v3/runner.ts';

export const BENCHMARK_PACK_VERSION='samdo-semantic-binding-v4.1' as const;
export const SMALL_PROFILE=['youth.income','youth.assets','newlywed.financial','newlywed.score','firstTime.coreEligibility','firstTime.financial'] as const;
export const FULL_PLAN_A_PROFILE=[...PLAN_A_16] as const;
export type BenchmarkProfile='SMALL'|'FULL_PLAN_A';
export type FrozenTask={taskId:string;scope:string;payload:ReturnType<typeof providerTaskPayload>;schema:typeof GEMINI_SAFE_BINDING_SCHEMA};
export type FrozenBenchmarkPack={schemaVersion:1;packVersion:typeof BENCHMARK_PACK_VERSION;document:{documentId:string;sha256:string;parserVersion:string};promptVersion:typeof V3_PROMPT_VERSION;tasks:FrozenTask[];profiles:{SMALL:string[];FULL_PLAN_A:string[]};hash:string};
export interface BenchmarkProvider{id:string;model:string;bind(task:FrozenTask):Promise<SemanticBindingResponse>}
export type ProviderTaskResult={taskId:string;status:'SUCCESS'|'FAILED'|'PROVIDER_NOT_RUN';response:SemanticBindingResponse|null;error:string|null};
export type ProviderBenchmarkRun={packHash:string;provider:{id:string;model:string};profile:BenchmarkProfile;results:ProviderTaskResult[]};

const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`:JSON.stringify(value);
const digest=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
export function verifyFrozenBenchmarkPack(pack:FrozenBenchmarkPack):boolean{const {hash,...unsigned}=pack;return digest(unsigned)===hash;}
export function buildFrozenBenchmarkPack(document:ParsedDocument,facts:ExtractedFact[]):FrozenBenchmarkPack{
  const plan=buildCallPlan(document,facts,'PLAN_A_16');
  const unsigned={schemaVersion:1 as const,packVersion:BENCHMARK_PACK_VERSION,document:{documentId:document.documentId,sha256:document.sha256,parserVersion:document.parserVersion},promptVersion:V3_PROMPT_VERSION,tasks:plan.inputs.map(input=>({taskId:input.task.name,scope:input.task.scope,payload:providerTaskPayload(input),schema:GEMINI_SAFE_BINDING_SCHEMA})),profiles:{SMALL:[...SMALL_PROFILE],FULL_PLAN_A:[...FULL_PLAN_A_PROFILE]}};
  return {...unsigned,hash:digest(unsigned)};
}
export function createStructuredBenchmarkProvider(id:string,model:string,provider:V3BindingProvider):BenchmarkProvider{return {id,model,async bind(task){
  const raw=await provider.generate(task.taskId,V3_BINDING_PROMPT,task.payload,task.schema),payload=task.payload as ReturnType<typeof providerTaskPayload>;
  return validateBindingResponse(raw,payload.facts as unknown as ExtractedFact[],new Set(payload.sources.map(source=>source.sourceId)),new Set(payload.allowedRoles));
}};}
export async function runFrozenBenchmark(pack:FrozenBenchmarkPack,profile:BenchmarkProfile,provider:BenchmarkProvider):Promise<ProviderBenchmarkRun>{
  if(!verifyFrozenBenchmarkPack(pack))throw new Error('FROZEN_PACK_HASH_MISMATCH');
  const ids=new Set(pack.profiles[profile]),tasks=pack.tasks.filter(task=>ids.has(task.taskId)),results:ProviderTaskResult[]=[];
  if(tasks.length!==ids.size)throw new Error('PROFILE_TASK_MISSING');
  for(const task of tasks){try{results.push({taskId:task.taskId,status:'SUCCESS',response:await provider.bind(structuredClone(task)),error:null});}catch(error){results.push({taskId:task.taskId,status:'FAILED',response:null,error:error instanceof Error?error.message:'PROVIDER_ERROR'});}}
  if(!verifyFrozenBenchmarkPack(pack))throw new Error('PROVIDER_MUTATED_FROZEN_PACK');
  return {packHash:pack.hash,provider:{id:provider.id,model:provider.model},profile,results};
}
