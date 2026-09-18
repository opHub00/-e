import { GROUPS,type Group } from './semanticContract.ts';
import type { SemanticBatch } from './semanticContext.ts';

export const DEFAULT_CALL_POLICY={totalHttpAttempts:16,discoveryCalls:1,retryReserve:2,scopeQuotas:{COMMON:2,YOUTH:3,NEWLYWED:3,FIRST_TIME:3,EXCEPTIONS:2} satisfies Record<Group,number>};
export type PlannedBatch={label:string;group:Group;scopeIndex:number;batch:SemanticBatch};
export function buildExtractionPlan(batches:SemanticBatch[],policy=DEFAULT_CALL_POLICY){
  const semanticCapacity=policy.totalHttpAttempts-policy.discoveryCalls-policy.retryReserve;
  const queues=Object.fromEntries(GROUPS.map(group=>[group,batches.filter(b=>b.group===group&&!b.oversized).slice(0,policy.scopeQuotas[group])])) as Record<Group,SemanticBatch[]>;
  const schedule:PlannedBatch[]=[];let round=0;
  while(schedule.length<semanticCapacity){let added=false;for(const group of GROUPS){const batch=queues[group][round];if(batch&&schedule.length<semanticCapacity){schedule.push({label:`${group}-${round}`,group,scopeIndex:round,batch});added=true;}}if(!added)break;round++;}
  const counts=Object.fromEntries(GROUPS.map(group=>[group,schedule.filter(x=>x.group===group).length])) as Record<Group,number>;
  const available=Object.fromEntries(GROUPS.map(group=>[group,batches.filter(b=>b.group===group&&!b.oversized).length])) as Record<Group,number>;
  const missingGuaranteedScopes=GROUPS.filter(group=>available[group]>0&&counts[group]===0);
  return {policy,schedule,counts,available,semanticCapacity,totalPlannedHttpAttempts:policy.discoveryCalls+schedule.length+policy.retryReserve,missingGuaranteedScopes};
}
