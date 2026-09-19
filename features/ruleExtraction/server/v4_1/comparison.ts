import type { BenchmarkProfile,ProviderBenchmarkRun } from './benchmarkPack.ts';

export type CriticalCoverageStatus='MATCHED'|'REVIEW_REQUIRED'|'MISSING'|'WRONG'|'PROVIDER_NOT_RUN';
export type ModelSafetyClass='SEMANTIC_SAFE'|'SEMANTIC_UNSAFE'|'PROVIDER_UNSTABLE'|'INSUFFICIENT_SAMPLE';
export type AuditMetric={numerator:number|null;denominator:number|null;measured:boolean;coverage:{evaluated:number;universe:number|null;ratio:number|null};methodology:string;value:number|null};
export type SafetyBlockers={criticalHallucination:number;wrongNumericBinding:number;wrongOperatorBinding:number;wrongScore:number;wrongScope:number;silentExceptionLoss:number;highConfidenceCriticalError:number};
export type ModelComparisonInput={run:ProviderBenchmarkRun;oraclePrecision:AuditMetric;oracleRecall:AuditMetric;numericFidelity:AuditMetric;operatorFidelity:AuditMetric;scoreFidelity:AuditMetric;stageFidelity:AuditMetric;semanticEvidenceSupport:AuditMetric;scopeFidelity:AuditMetric;exceptionRelationAccuracy:AuditMetric;hallucinationCount:number;highCriticalErrors:number;tokens:number|null;costUsd:number|null;safety:SafetyBlockers};
export type ModelComparisonRow={packHash:string;providerId:string;model:string;profile:BenchmarkProfile;classification:ModelSafetyClass;providerErrorRate:number;taskCompletion:number;metrics:Omit<ModelComparisonInput,'run'>};
const blockerCount=(value:SafetyBlockers)=>Object.values(value).reduce((sum,item)=>sum+item,0);
export function notMeasuredMetric(universe:number|null,methodology:string):AuditMetric{return {numerator:null,denominator:null,measured:false,value:null,coverage:{evaluated:0,universe,ratio:universe===null?null:0},methodology};}
export function compareModelResult(input:ModelComparisonInput):ModelComparisonRow{
  const total=input.run.results.length,failed=input.run.results.filter(row=>row.status==='FAILED').length,completed=input.run.results.filter(row=>row.status==='SUCCESS').length;
  const classification:ModelSafetyClass=total===0||completed<Math.ceil(total*.5)?'INSUFFICIENT_SAMPLE':failed/total>.1?'PROVIDER_UNSTABLE':blockerCount(input.safety)>0?'SEMANTIC_UNSAFE':'SEMANTIC_SAFE';
  const {run,...metrics}=input;return {packHash:run.packHash,providerId:run.provider.id,model:run.provider.model,profile:run.profile,classification,providerErrorRate:total?failed/total:1,taskCompletion:total?completed/total:0,metrics};
}
