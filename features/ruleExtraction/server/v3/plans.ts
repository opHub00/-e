import type { ParsedDocument } from '../parsedDocument.ts';
import type { ExtractedFact } from './facts.ts';
import { GEMINI_SAFE_BINDING_SCHEMA } from './contract.ts';
import { buildTaskInput,V3_TASKS,type SemanticTaskInput } from './tasks.ts';

export const PLAN_A_16=['common.regionPriority','youth.basicEligibility','youth.subscription','youth.income','youth.assets','youth.score','newlywed.applicantTypes','newlywed.basicEligibility','newlywed.income','newlywed.assets','newlywed.score','firstTime.basicEligibility','firstTime.savings','firstTime.taxHistory','firstTime.income','firstTime.assets'] as const;
export const PLAN_B_24=['common.regionPriority','youth.basicEligibility','youth.subscription','youth.income','youth.assets','youth.priorityStage','youth.generalStage','youth.score','newlywed.applicantTypes','newlywed.basicEligibility','newlywed.income','newlywed.assets','newlywed.priorityStage','newlywed.generalStage','newlywed.lotteryStage','newlywed.score','newlywed.homelessDuration','firstTime.basicEligibility','firstTime.savings','firstTime.taxHistory','firstTime.assets','firstTime.priorityStage','firstTime.generalStage','firstTime.lotteryStage'] as const;
export type PlanRow={taskName:string;scope:string;stage:string;inputChars:number;tableCount:number;blockCount:number;factCount:number;expectedBindings:{min:number;max:number};estimatedOutputSchemaSize:number;status:'READY'|'NO_CONTEXT'};
export function buildCallPlan(document:ParsedDocument,facts:ExtractedFact[],plan:'PLAN_A_16'|'PLAN_B_24'):{name:string;rows:PlanRow[];inputs:SemanticTaskInput[]} {
  const names=plan==='PLAN_A_16'?PLAN_A_16:PLAN_B_24,schemaBytes=JSON.stringify(GEMINI_SAFE_BINDING_SCHEMA).length;
  const inputs=names.map(name=>{const definition=V3_TASKS.find(task=>task.name===name);if(!definition)throw new Error(`UNKNOWN_TASK:${name}`);const input=buildTaskInput(document,facts,definition);input.schemaBytes=schemaBytes;return input;});
  return {name:plan,inputs,rows:inputs.map(input=>({taskName:input.task.name,scope:input.task.scope,stage:input.task.stage,inputChars:input.inputChars,tableCount:input.tableCount,blockCount:input.blockCount,factCount:input.facts.length,expectedBindings:input.task.expectedBindings,estimatedOutputSchemaSize:schemaBytes,status:input.sources.length?'READY':'NO_CONTEXT'}))};
}
