import type { ExtractedFact,FactOperator } from '../v3/facts.ts';
import { buildCallPlan,PLAN_A_16,PLAN_B_24 } from '../v3/plans.ts';
import type { ParsedDocument } from '../parsedDocument.ts';

export type ExpectedFact={label:string;value:number;unit:string;operator?:Exclude<FactOperator,null>};
export type RetrievalScoreRow={taskName:string;scope:'YOUTH'|'NEWLYWED'|'FIRST_TIME';expected:number;retrieved:number;wrongHighRanked:number;coverage:number;precisionProxy:number;missing:string[]};
const expected:Record<string,{scope:RetrievalScoreRow['scope'];facts:ExpectedFact[]}>= {
  'youth.coreEligibility':{scope:'YOUTH',facts:[{label:'19세 이상',value:19,unit:'AGE_YEAR',operator:'gte'},{label:'39세 이하',value:39,unit:'AGE_YEAR',operator:'lte'},{label:'가입 6개월',value:6,unit:'MONTH',operator:'gte'},{label:'납입 6회',value:6,unit:'PAYMENT_COUNT',operator:'gte'}]},
  'youth.income':{scope:'YOUTH',facts:[{label:'소득 140%',value:140,unit:'PERCENT',operator:'lte'}]},
  'youth.assets':{scope:'YOUTH',facts:[{label:'본인 276백만원',value:276_000_000,unit:'KRW',operator:'lte'},{label:'부모 1,034백만원',value:1_034_000_000,unit:'KRW',operator:'lte'}]},
  'youth.score':{scope:'YOUTH',facts:[{label:'가점 1점',value:1,unit:'SCORE_VALUE'},{label:'가점 2점',value:2,unit:'SCORE_VALUE'},{label:'가점 3점',value:3,unit:'SCORE_VALUE'},{label:'우선 최대 9점',value:9,unit:'MAX_SCORE'},{label:'일반 최대 12점',value:12,unit:'MAX_SCORE'}]},
  'newlywed.coreEligibility':{scope:'NEWLYWED',facts:[{label:'혼인 7년',value:7,unit:'YEAR',operator:'lte'},{label:'혼인 2년',value:2,unit:'YEAR',operator:'lte'},{label:'가입 6개월',value:6,unit:'MONTH',operator:'gte'},{label:'납입 6회',value:6,unit:'PAYMENT_COUNT',operator:'gte'}]},
  'newlywed.financial':{scope:'NEWLYWED',facts:[{label:'외벌이 130%',value:130,unit:'PERCENT',operator:'lte'},{label:'맞벌이 200%',value:200,unit:'PERCENT',operator:'lte'},{label:'총자산 362백만원',value:362_000_000,unit:'KRW',operator:'lte'}]},
  'newlywed.stages':{scope:'NEWLYWED',facts:[{label:'우선 30%',value:30,unit:'PERCENT'},{label:'일반 60%',value:60,unit:'PERCENT'},{label:'단계 소득 140%',value:140,unit:'PERCENT'}]},
  'newlywed.score':{scope:'NEWLYWED',facts:[{label:'가점 1점',value:1,unit:'SCORE_VALUE'},{label:'가점 2점',value:2,unit:'SCORE_VALUE'},{label:'가점 3점',value:3,unit:'SCORE_VALUE'},{label:'우선 최대 9점',value:9,unit:'MAX_SCORE'},{label:'일반 최대 12점',value:12,unit:'MAX_SCORE'}]},
  'firstTime.coreEligibility':{scope:'FIRST_TIME',facts:[{label:'가입 6개월',value:6,unit:'MONTH',operator:'gte'},{label:'납입 6회',value:6,unit:'PAYMENT_COUNT',operator:'gte'},{label:'저축 600만원',value:6_000_000,unit:'KRW',operator:'gte'},{label:'소득세 5년',value:5,unit:'YEAR',operator:'gte'}]},
  'firstTime.financial':{scope:'FIRST_TIME',facts:[{label:'소득 130%',value:130,unit:'PERCENT',operator:'lte'},{label:'맞벌이 200%',value:200,unit:'PERCENT',operator:'lte'},{label:'총자산 362백만원',value:362_000_000,unit:'KRW',operator:'lte'}]},
  'firstTime.stages':{scope:'FIRST_TIME',facts:[{label:'1단계 70%',value:70,unit:'PERCENT'},{label:'2단계 20%',value:20,unit:'PERCENT'},{label:'소득 100%',value:100,unit:'PERCENT'},{label:'소득 120%',value:120,unit:'PERCENT'},{label:'소득 130%',value:130,unit:'PERCENT'},{label:'소득 140%',value:140,unit:'PERCENT'},{label:'소득 200%',value:200,unit:'PERCENT'}]},
};
const matches=(fact:ExtractedFact,item:ExpectedFact)=>fact.normalizedValue===item.value&&fact.unit===item.unit&&(item.operator===undefined||fact.operator===item.operator);
function wrongFor(taskName:string,facts:ExtractedFact[]){
  if(taskName==='youth.income')return facts.filter(fact=>fact.contextTags.includes('CHILDBIRTH_RELAXATION')&&(fact.normalizedValue===10||fact.normalizedValue===20)).length;
  if(taskName==='firstTime.financial')return facts.filter(fact=>fact.normalizedValue===6_000_000&&fact.contextTags.includes('SUBSCRIPTION')).length;
  if(taskName==='newlywed.financial')return facts.filter(fact=>fact.contextTags.includes('SUBSCRIPTION')&&/예치금|선납금|청약저축/u.test(fact.contextText)).length;
  if(taskName==='firstTime.coreEligibility')return facts.filter(fact=>fact.type==='DATE').length;
  return 0;
}
export function buildOfflineRetrievalScorecard(document:ParsedDocument,facts:ExtractedFact[]){
  const plan=buildCallPlan(document,facts,'PLAN_A_16'),rows:RetrievalScoreRow[]=[];
  for(const [taskName,spec] of Object.entries(expected)){const input=plan.inputs.find(item=>item.task.name===taskName);if(!input)throw new Error(`SCORECARD_TASK_MISSING:${taskName}`);const missing=spec.facts.filter(item=>!input.facts.some(fact=>matches(fact,item))).map(item=>item.label),wrong=wrongFor(taskName,input.facts),retrieved=spec.facts.length-missing.length;rows.push({taskName,scope:spec.scope,expected:spec.facts.length,retrieved,wrongHighRanked:wrong,coverage:retrieved/spec.facts.length,precisionProxy:retrieved/Math.max(retrieved+wrong,1),missing});}
  const planBSuperset=PLAN_A_16.every(task=>PLAN_B_24.includes(task));
  const exceptionTasks=['youth.exceptions','newlywed.exceptions','firstTime.exceptions'].every(task=>PLAN_A_16.includes(task as never)&&PLAN_B_24.includes(task as never));
  const scoreValues=new Set(facts.filter(fact=>fact.type==='SCORE').map(fact=>`${fact.normalizedValue}:${fact.unit}`)),scoreTableCoverage=['1:SCORE_VALUE','2:SCORE_VALUE','3:SCORE_VALUE','9:MAX_SCORE','12:MAX_SCORE'].every(value=>scoreValues.has(value));
  const missingOperatorFallback=plan.inputs.flatMap(input=>Object.values(input.selection.roleCoverage)).filter(item=>item.status==='NOT_READY_MISSING_OPERATOR'&&item.candidateCount===0).length;
  const ready=rows.every(row=>row.coverage===1&&row.wrongHighRanked===0)&&missingOperatorFallback===0&&scoreTableCoverage&&planBSuperset&&exceptionTasks;
  return {rows,byScope:{YOUTH:rows.filter(row=>row.scope==='YOUTH'),NEWLYWED:rows.filter(row=>row.scope==='NEWLYWED'),FIRST_TIME:rows.filter(row=>row.scope==='FIRST_TIME')},wrongFactCount:rows.reduce((sum,row)=>sum+row.wrongHighRanked,0),missingOperatorFallback,scoreTableCoverage,planBSuperset,exceptionTasks,ready};
}
