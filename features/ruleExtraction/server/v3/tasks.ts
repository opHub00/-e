import type { ParsedDocument } from '../parsedDocument.ts';
import type { ExtractedFact } from './facts.ts';
import { retrieveTaskCandidates,type SelectionTelemetry } from '../v4/retrieval.ts';

export type V3Stage='COMMON'|'PRIORITY'|'GENERAL'|'LOTTERY';
export type TaskStatus='SUCCESS'|'INCOMPLETE'|'FAILED'|'SKIPPED';
export type SemanticTask={name:string;scope:'COMMON'|'YOUTH'|'NEWLYWED'|'FIRST_TIME';stage:V3Stage;stageByRole?:Readonly<Record<string,V3Stage>>;keywords:string[];allowedRoles:string[];expectedBindings:{min:number;max:number}};
const task=(name:string,scope:SemanticTask['scope'],stage:V3Stage,keywords:string[],roles:string[],max=6,stageByRole?:Readonly<Record<string,V3Stage>>):SemanticTask=>({name,scope,stage,...(stageByRole?{stageByRole}:{}),keywords,allowedRoles:roles,expectedBindings:{min:1,max}});
export const V3_TASKS:SemanticTask[]=[
 task('common.regionPriority','COMMON','COMMON',['지역우선','해당지역','제주특별자치도'],['COMMON.REGION.RESIDENCE_MIN','COMMON.REGION.PRIORITY_RATIO']),
 task('youth.basicEligibility','YOUTH','COMMON',['청년','만 19세','39세','혼인 중이 아님','무주택'],['YOUTH.AGE_MIN','YOUTH.AGE_MAX','YOUTH.UNMARRIED','YOUTH.NEVER_OWNED_HOME']),
 task('youth.coreEligibility','YOUTH','COMMON',['청년','만 19세','39세','혼인 중이 아님','무주택','청약','6개월','6회'],['YOUTH.AGE_MIN','YOUTH.AGE_MAX','YOUTH.UNMARRIED','YOUTH.NEVER_OWNED_HOME','YOUTH.ACCOUNT_MONTHS_MIN','YOUTH.PAYMENT_COUNT_MIN']),
 task('youth.subscription','YOUTH','COMMON',['청년','청약','6개월','6회'],['YOUTH.ACCOUNT_MONTHS_MIN','YOUTH.PAYMENT_COUNT_MIN']),
 task('youth.income','YOUTH','COMMON',['청년','소득','140%'],['YOUTH.INCOME_LIMIT']),
 task('youth.assets','YOUTH','COMMON',['청년','자산','부모','276백만원','1,034백만원'],['YOUTH.APPLICANT_ASSET_LIMIT','YOUTH.PARENT_ASSET_LIMIT']),
 task('youth.priorityStage','YOUTH','PRIORITY',['청년','1단계','우선공급','30%'],['YOUTH.PRIORITY.SUPPLY_RATIO','YOUTH.PRIORITY.TAX_YEARS_MIN']),
 task('youth.generalStage','YOUTH','GENERAL',['청년','2단계','일반공급'],['YOUTH.GENERAL.ELIGIBILITY']),
 task('youth.stages','YOUTH','COMMON',['청년','1단계','2단계','우선공급','일반공급','30%'],['YOUTH.PRIORITY.SUPPLY_RATIO','YOUTH.PRIORITY.TAX_YEARS_MIN','YOUTH.PRIORITY.ELIGIBILITY','YOUTH.GENERAL.ELIGIBILITY'],6,{'YOUTH.PRIORITY.SUPPLY_RATIO':'PRIORITY','YOUTH.PRIORITY.TAX_YEARS_MIN':'PRIORITY','YOUTH.PRIORITY.ELIGIBILITY':'PRIORITY','YOUTH.GENERAL.ELIGIBILITY':'GENERAL'}),
 task('youth.score','YOUTH','GENERAL',['청년','가점','점','납입인정'],['YOUTH.SCORE.INCOME_BAND','YOUTH.SCORE.RESIDENCE_BAND','YOUTH.SCORE.PAYMENT_BAND','YOUTH.SCORE.TAX_BAND','YOUTH.SCORE.TOTAL']),
 task('youth.exceptions','YOUTH','COMMON',['청년','단,','다만','예외','특례'],['YOUTH.EXCEPTION']),
 task('newlywed.applicantTypes','NEWLYWED','COMMON',['신혼부부','예비신혼','한부모'],['NEWLYWED.APPLICANT_TYPE','NEWLYWED.MARRIAGE_YEARS_MAX','NEWLYWED.CHILD_AGE_MAX']),
 task('newlywed.basicEligibility','NEWLYWED','COMMON',['신혼부부','무주택세대구성원'],['NEWLYWED.HOUSEHOLD_HOMELESS']),
 task('newlywed.applicantEligibility','NEWLYWED','COMMON',['신혼부부','예비신혼부부','한부모가족','무주택세대구성원','혼인기간'],['NEWLYWED.APPLICANT_TYPE','NEWLYWED.MARRIAGE_YEARS_MAX','NEWLYWED.CHILD_AGE_MAX','NEWLYWED.HOUSEHOLD_HOMELESS']),
 task('newlywed.coreEligibility','NEWLYWED','COMMON',['신혼부부','예비신혼부부','한부모가족','무주택세대구성원','혼인기간','청약','6개월','6회'],['NEWLYWED.APPLICANT_TYPE','NEWLYWED.MARRIAGE_YEARS_MAX','NEWLYWED.CHILD_AGE_MAX','NEWLYWED.HOUSEHOLD_HOMELESS','NEWLYWED.ACCOUNT_MONTHS_MIN','NEWLYWED.PAYMENT_COUNT_MIN']),
 task('newlywed.subscription','NEWLYWED','COMMON',['신혼부부','청약','6개월','6회'],['NEWLYWED.ACCOUNT_MONTHS_MIN','NEWLYWED.PAYMENT_COUNT_MIN']),
 task('newlywed.income','NEWLYWED','COMMON',['신혼부부','소득','외벌이','맞벌이'],['NEWLYWED.INCOME.SINGLE_LIMIT','NEWLYWED.INCOME.DUAL_LIMIT']),
 task('newlywed.assets','NEWLYWED','COMMON',['신혼부부','자산','362백만원'],['NEWLYWED.ASSET_LIMIT']),
 task('newlywed.financial','NEWLYWED','COMMON',['신혼부부','소득','외벌이','맞벌이','자산','362백만원'],['NEWLYWED.INCOME.SINGLE_LIMIT','NEWLYWED.INCOME.DUAL_LIMIT','NEWLYWED.ASSET_LIMIT']),
 task('newlywed.priorityStage','NEWLYWED','PRIORITY',['신혼부부','1단계','우선공급','30%'],['NEWLYWED.PRIORITY.SUPPLY_RATIO','NEWLYWED.PRIORITY.ELIGIBILITY']),
 task('newlywed.generalStage','NEWLYWED','GENERAL',['신혼부부','2단계','일반공급','60%'],['NEWLYWED.GENERAL.SUPPLY_RATIO','NEWLYWED.GENERAL.ELIGIBILITY']),
 task('newlywed.lotteryStage','NEWLYWED','LOTTERY',['신혼부부','3단계','추첨'],['NEWLYWED.LOTTERY.ELIGIBILITY']),
 task('newlywed.stages','NEWLYWED','COMMON',['신혼부부','1단계','2단계','3단계','우선공급','일반공급','추첨','30%','60%'],['NEWLYWED.PRIORITY.SUPPLY_RATIO','NEWLYWED.PRIORITY.ELIGIBILITY','NEWLYWED.GENERAL.SUPPLY_RATIO','NEWLYWED.GENERAL.ELIGIBILITY','NEWLYWED.LOTTERY.ELIGIBILITY'],6,{'NEWLYWED.PRIORITY.SUPPLY_RATIO':'PRIORITY','NEWLYWED.PRIORITY.ELIGIBILITY':'PRIORITY','NEWLYWED.GENERAL.SUPPLY_RATIO':'GENERAL','NEWLYWED.GENERAL.ELIGIBILITY':'GENERAL','NEWLYWED.LOTTERY.ELIGIBILITY':'LOTTERY'}),
 task('newlywed.score','NEWLYWED','GENERAL',['신혼부부','가점','미성년 자녀','무주택기간'],['NEWLYWED.SCORE.CHILDREN','NEWLYWED.SCORE.HOMELESS_YEARS','NEWLYWED.SCORE.RESIDENCE','NEWLYWED.SCORE.PAYMENT','NEWLYWED.SCORE.TOTAL']),
 task('newlywed.homelessDuration','NEWLYWED','GENERAL',['무주택기간','만 30세','혼인신고일','주택처분'],['NEWLYWED.HOMELESS_DURATION.START','NEWLYWED.HOMELESS_DURATION.RESET']),
 task('newlywed.exceptions','NEWLYWED','COMMON',['신혼부부','단,','다만','예외','특례','배우자'],['NEWLYWED.EXCEPTION']),
 task('firstTime.basicEligibility','FIRST_TIME','COMMON',['생애최초','주택소유','혼인 중','미혼 자녀','1인 가구'],['FIRST_TIME.NEVER_OWNED_HOME','FIRST_TIME.FAMILY_REQUIRED']),
 task('firstTime.coreEligibility','FIRST_TIME','COMMON',['생애최초','주택소유','혼인 중','미혼 자녀','1인 가구','1순위','6개월','6회','600만원','저축액','소득세','5년'],['FIRST_TIME.NEVER_OWNED_HOME','FIRST_TIME.FAMILY_REQUIRED','FIRST_TIME.ACCOUNT_MONTHS_MIN','FIRST_TIME.PAYMENT_COUNT_MIN','FIRST_TIME.SAVINGS_MIN','FIRST_TIME.TAX_YEARS_MIN']),
 task('firstTime.subscription','FIRST_TIME','COMMON',['생애최초','1순위','6개월','6회'],['FIRST_TIME.ACCOUNT_MONTHS_MIN','FIRST_TIME.PAYMENT_COUNT_MIN']),
 task('firstTime.savings','FIRST_TIME','COMMON',['생애최초','600만원','저축액'],['FIRST_TIME.SAVINGS_MIN']),
 task('firstTime.subscriptionSavings','FIRST_TIME','COMMON',['생애최초','1순위','6개월','6회','600만원','저축액'],['FIRST_TIME.ACCOUNT_MONTHS_MIN','FIRST_TIME.PAYMENT_COUNT_MIN','FIRST_TIME.SAVINGS_MIN']),
 task('firstTime.taxHistory','FIRST_TIME','COMMON',['생애최초','소득세','5년'],['FIRST_TIME.TAX_YEARS_MIN']),
 task('firstTime.income','FIRST_TIME','COMMON',['생애최초','소득','외벌이','맞벌이'],['FIRST_TIME.INCOME.SINGLE_LIMIT','FIRST_TIME.INCOME.DUAL_LIMIT']),
 task('firstTime.assets','FIRST_TIME','COMMON',['생애최초','자산','362백만원'],['FIRST_TIME.ASSET_LIMIT']),
 task('firstTime.financial','FIRST_TIME','COMMON',['생애최초','소득','외벌이','맞벌이','자산','362백만원'],['FIRST_TIME.INCOME.SINGLE_LIMIT','FIRST_TIME.INCOME.DUAL_LIMIT','FIRST_TIME.ASSET_LIMIT']),
 task('firstTime.priorityStage','FIRST_TIME','PRIORITY',['생애최초','1단계','우선공급','70%'],['FIRST_TIME.PRIORITY.SUPPLY_RATIO','FIRST_TIME.PRIORITY.INCOME_LIMIT']),
 task('firstTime.generalStage','FIRST_TIME','GENERAL',['생애최초','2단계','일반공급','20%'],['FIRST_TIME.GENERAL.SUPPLY_RATIO','FIRST_TIME.GENERAL.INCOME_LIMIT']),
 task('firstTime.lotteryStage','FIRST_TIME','LOTTERY',['생애최초','3단계','추첨','잔여'],['FIRST_TIME.LOTTERY.INCOME_LIMIT','FIRST_TIME.LOTTERY.SCORELESS']),
 task('firstTime.stages','FIRST_TIME','COMMON',['생애최초','1단계','2단계','3단계','우선공급','일반공급','추첨','70%','20%','가점 없음'],['FIRST_TIME.PRIORITY.SUPPLY_RATIO','FIRST_TIME.PRIORITY.INCOME_LIMIT','FIRST_TIME.GENERAL.SUPPLY_RATIO','FIRST_TIME.GENERAL.INCOME_LIMIT','FIRST_TIME.LOTTERY.INCOME_LIMIT','FIRST_TIME.LOTTERY.SCORELESS'],6,{'FIRST_TIME.PRIORITY.SUPPLY_RATIO':'PRIORITY','FIRST_TIME.PRIORITY.INCOME_LIMIT':'PRIORITY','FIRST_TIME.GENERAL.SUPPLY_RATIO':'GENERAL','FIRST_TIME.GENERAL.INCOME_LIMIT':'GENERAL','FIRST_TIME.LOTTERY.INCOME_LIMIT':'LOTTERY','FIRST_TIME.LOTTERY.SCORELESS':'LOTTERY'}),
 task('firstTime.exceptions','FIRST_TIME','COMMON',['생애최초','배우자','혼인 전','출산','특례'],['FIRST_TIME.EXCEPTION']),
];

export type TaskSource={sourceId:string;text:string;kind:'BLOCK'|'CELL';tableId:string|null;excerpted:boolean};
export type SemanticTaskInput={task:SemanticTask;facts:ExtractedFact[];sources:TaskSource[];inputChars:number;tableCount:number;blockCount:number;schemaBytes:number;selection:SelectionTelemetry};
export function providerTaskPayload(input:SemanticTaskInput){return {promptVersion:'assessment-rule-extraction-v3',taskName:input.task.name,scope:input.task.scope,allowedRoles:input.task.allowedRoles,expectedBindings:input.task.expectedBindings,facts:input.facts.map(fact=>({factId:fact.factId,type:fact.type,rawValue:fact.rawValue,unit:fact.unit,sourceId:fact.sourceId,contextTags:fact.contextTags,tableIdentities:fact.tableIdentities})),sources:input.sources};}
export function buildTaskInput(document:ParsedDocument,facts:ExtractedFact[],task:SemanticTask):SemanticTaskInput {
  const retrieved=retrieveTaskCandidates(document,facts,task);
  const input:SemanticTaskInput={task,facts:retrieved.facts,sources:retrieved.sources,inputChars:0,tableCount:new Set(retrieved.sources.flatMap(source=>source.tableId?[source.tableId]:[])).size,blockCount:retrieved.sources.filter(source=>source.kind==='BLOCK').length,schemaBytes:0,selection:retrieved.telemetry};
  input.inputChars=JSON.stringify(providerTaskPayload(input)).length;return input;
}
