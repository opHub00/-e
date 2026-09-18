import type { CandidateRule } from '../candidate.ts';
import type { ParsedDocument } from '../parsedDocument.ts';
import type { ExtractedFact } from './facts.ts';
import type { SemanticBindingResponse } from './contract.ts';
import { buildCandidateRules } from './ruleBuilder.ts';
import type { SemanticTask,TaskStatus } from './tasks.ts';

export type MockTaskResult={task:SemanticTask;status:TaskStatus;response?:SemanticBindingResponse;error?:string};
export function runOfflineSimulation(document:ParsedDocument,facts:ExtractedFact[],results:MockTaskResult[]){const rules:CandidateRule[]=[],unresolved:string[]=[],statuses:Record<string,TaskStatus>={};
  for(const result of results){statuses[result.task.name]=result.status;if(result.status!=='SUCCESS'||!result.response){if(result.error)unresolved.push(`${result.task.name}:${result.error}`);continue;}for(const item of result.response.unresolved)unresolved.push(`${result.task.name}:${item.reason}`);for(const binding of result.response.bindings){const built=buildCandidateRules(document,result.task,binding,facts);rules.push(...built.rules);unresolved.push(...built.unresolved);}}
  return {rules,unresolved,statuses};}
