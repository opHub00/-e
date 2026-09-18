import type { ParsedDocument } from '../parsedDocument.ts';
import type { ExtractedFact } from './facts.ts';

export type V3Stage='COMMON'|'PRIORITY'|'GENERAL'|'LOTTERY';
export type TaskStatus='SUCCESS'|'INCOMPLETE'|'FAILED'|'SKIPPED';
export type SemanticTask={name:string;scope:'COMMON'|'YOUTH'|'NEWLYWED'|'FIRST_TIME';stage:V3Stage;keywords:string[];allowedRoles:string[];expectedBindings:{min:number;max:number}};
const task=(name:string,scope:SemanticTask['scope'],stage:V3Stage,keywords:string[],roles:string[],max=6):SemanticTask=>({name,scope,stage,keywords,allowedRoles:roles,expectedBindings:{min:1,max}});
export const V3_TASKS:SemanticTask[]=[
 task('common.regionPriority','COMMON','COMMON',['지역우선','해당지역','제주특별자치도'],['COMMON.REGION.RESIDENCE_MIN','COMMON.REGION.PRIORITY_RATIO']),
 task('youth.basicEligibility','YOUTH','COMMON',['청년','만 19세','39세','혼인 중이 아님','무주택'],['YOUTH.AGE_MIN','YOUTH.AGE_MAX','YOUTH.UNMARRIED','YOUTH.NEVER_OWNED_HOME']),
 task('youth.subscription','YOUTH','COMMON',['청년','청약','6개월','6회'],['YOUTH.ACCOUNT_MONTHS_MIN','YOUTH.PAYMENT_COUNT_MIN']),
 task('youth.income','YOUTH','COMMON',['청년','소득','140%'],['YOUTH.INCOME_LIMIT']),
 task('youth.assets','YOUTH','COMMON',['청년','자산','부모','276백만원','1,034백만원'],['YOUTH.APPLICANT_ASSET_LIMIT','YOUTH.PARENT_ASSET_LIMIT']),
 task('youth.priorityStage','YOUTH','PRIORITY',['청년','1단계','우선공급','30%'],['YOUTH.PRIORITY.SUPPLY_RATIO','YOUTH.PRIORITY.TAX_YEARS_MIN']),
 task('youth.generalStage','YOUTH','GENERAL',['청년','2단계','일반공급'],['YOUTH.GENERAL.ELIGIBILITY']),
 task('youth.score','YOUTH','GENERAL',['청년','가점','점','납입인정'],['YOUTH.SCORE.INCOME_BAND','YOUTH.SCORE.RESIDENCE_BAND','YOUTH.SCORE.PAYMENT_BAND','YOUTH.SCORE.TAX_BAND','YOUTH.SCORE.TOTAL']),
 task('youth.exceptions','YOUTH','COMMON',['청년','단,','다만','예외','특례'],['YOUTH.EXCEPTION']),
 task('newlywed.applicantTypes','NEWLYWED','COMMON',['신혼부부','예비신혼','한부모'],['NEWLYWED.APPLICANT_TYPE','NEWLYWED.MARRIAGE_YEARS_MAX','NEWLYWED.CHILD_AGE_MAX']),
 task('newlywed.basicEligibility','NEWLYWED','COMMON',['신혼부부','무주택세대구성원'],['NEWLYWED.HOUSEHOLD_HOMELESS']),
 task('newlywed.subscription','NEWLYWED','COMMON',['신혼부부','청약','6개월','6회'],['NEWLYWED.ACCOUNT_MONTHS_MIN','NEWLYWED.PAYMENT_COUNT_MIN']),
 task('newlywed.income','NEWLYWED','COMMON',['신혼부부','소득','외벌이','맞벌이'],['NEWLYWED.INCOME.SINGLE_LIMIT','NEWLYWED.INCOME.DUAL_LIMIT']),
 task('newlywed.assets','NEWLYWED','COMMON',['신혼부부','자산','362백만원'],['NEWLYWED.ASSET_LIMIT']),
 task('newlywed.priorityStage','NEWLYWED','PRIORITY',['신혼부부','1단계','우선공급','30%'],['NEWLYWED.PRIORITY.SUPPLY_RATIO','NEWLYWED.PRIORITY.ELIGIBILITY']),
 task('newlywed.generalStage','NEWLYWED','GENERAL',['신혼부부','2단계','일반공급','60%'],['NEWLYWED.GENERAL.SUPPLY_RATIO','NEWLYWED.GENERAL.ELIGIBILITY']),
 task('newlywed.lotteryStage','NEWLYWED','LOTTERY',['신혼부부','3단계','추첨'],['NEWLYWED.LOTTERY.ELIGIBILITY']),
 task('newlywed.score','NEWLYWED','GENERAL',['신혼부부','가점','미성년 자녀','무주택기간'],['NEWLYWED.SCORE.CHILDREN','NEWLYWED.SCORE.HOMELESS_YEARS','NEWLYWED.SCORE.RESIDENCE','NEWLYWED.SCORE.PAYMENT','NEWLYWED.SCORE.TOTAL']),
 task('newlywed.homelessDuration','NEWLYWED','GENERAL',['무주택기간','만 30세','혼인신고일','주택처분'],['NEWLYWED.HOMELESS_DURATION.START','NEWLYWED.HOMELESS_DURATION.RESET']),
 task('newlywed.exceptions','NEWLYWED','COMMON',['신혼부부','단,','다만','예외','특례','배우자'],['NEWLYWED.EXCEPTION']),
 task('firstTime.basicEligibility','FIRST_TIME','COMMON',['생애최초','주택소유','혼인 중','미혼 자녀','1인 가구'],['FIRST_TIME.NEVER_OWNED_HOME','FIRST_TIME.FAMILY_REQUIRED']),
 task('firstTime.subscription','FIRST_TIME','COMMON',['생애최초','1순위','6개월','6회'],['FIRST_TIME.ACCOUNT_MONTHS_MIN','FIRST_TIME.PAYMENT_COUNT_MIN']),
 task('firstTime.savings','FIRST_TIME','COMMON',['생애최초','600만원','저축액'],['FIRST_TIME.SAVINGS_MIN']),
 task('firstTime.taxHistory','FIRST_TIME','COMMON',['생애최초','소득세','5년'],['FIRST_TIME.TAX_YEARS_MIN']),
 task('firstTime.income','FIRST_TIME','COMMON',['생애최초','소득','외벌이','맞벌이'],['FIRST_TIME.INCOME.SINGLE_LIMIT','FIRST_TIME.INCOME.DUAL_LIMIT']),
 task('firstTime.assets','FIRST_TIME','COMMON',['생애최초','자산','362백만원'],['FIRST_TIME.ASSET_LIMIT']),
 task('firstTime.priorityStage','FIRST_TIME','PRIORITY',['생애최초','1단계','우선공급','70%'],['FIRST_TIME.PRIORITY.SUPPLY_RATIO','FIRST_TIME.PRIORITY.INCOME_LIMIT']),
 task('firstTime.generalStage','FIRST_TIME','GENERAL',['생애최초','2단계','일반공급','20%'],['FIRST_TIME.GENERAL.SUPPLY_RATIO','FIRST_TIME.GENERAL.INCOME_LIMIT']),
 task('firstTime.lotteryStage','FIRST_TIME','LOTTERY',['생애최초','3단계','추첨','잔여'],['FIRST_TIME.LOTTERY.INCOME_LIMIT','FIRST_TIME.LOTTERY.SCORELESS']),
 task('firstTime.exceptions','FIRST_TIME','COMMON',['생애최초','배우자','혼인 전','출산','특례'],['FIRST_TIME.EXCEPTION']),
];

export type TaskSource={sourceId:string;text:string;kind:'BLOCK'|'CELL';tableId:string|null;excerpted:boolean};
export type SemanticTaskInput={task:SemanticTask;facts:ExtractedFact[];sources:TaskSource[];inputChars:number;tableCount:number;blockCount:number;schemaBytes:number};
export function buildTaskInput(document:ParsedDocument,facts:ExtractedFact[],task:SemanticTask):SemanticTaskInput {
  const matches=(text:string)=>task.keywords.some(keyword=>text.includes(keyword));
  const excerpt=(text:string)=>{if(text.length<=1200)return {text,excerpted:false};const positions=task.keywords.map(k=>text.indexOf(k)).filter(i=>i>=0),center=positions.length?Math.min(...positions):0,start=Math.max(0,center-300);return {text:text.slice(start,start+1200),excerpted:true};};
  const sources:TaskSource[]=[];
  for(const table of document.tables)for(const row of table.rows)for(const cell of row){const nearby=cell.blockIds.map(id=>document.blocks.find(b=>b.id===id)?.sectionPath.join(' ')??'').join(' '),full=`${nearby} ${cell.text}`;if(matches(full)){const part=excerpt(cell.text);sources.push({sourceId:`cell:${table.id}:${cell.row}:${cell.column}`,text:part.text,kind:'CELL',tableId:table.id,excerpted:part.excerpted});}}
  for(const block of document.blocks){const full=`${block.sectionPath.join(' ')} ${block.text}`;if(matches(full)){const part=excerpt(block.text);sources.push({sourceId:block.id,text:part.text,kind:'BLOCK',tableId:block.sourceLocator.tableId??null,excerpted:part.excerpted});}}
  const factCount=new Map<string,number>();for(const fact of facts)factCount.set(fact.sourceId,(factCount.get(fact.sourceId)??0)+1);
  const relevance=(source:TaskSource)=>task.keywords.reduce((score,keyword)=>score+(source.text.includes(keyword)?20+keyword.length:0),0)+Math.min(factCount.get(source.sourceId)??0,10);
  const unique=[...new Map(sources.map(source=>[source.sourceId,source])).values()].sort((a,b)=>relevance(b)-relevance(a)||a.sourceId.localeCompare(b.sourceId)).slice(0,6);
  const sourceIds=new Set(unique.map(source=>source.sourceId));
  const selectedFacts=facts.filter(fact=>sourceIds.has(fact.sourceId)).slice(0,12);
  return {task,facts:selectedFacts,sources:unique,inputChars:JSON.stringify({facts:selectedFacts.map(f=>({factId:f.factId,type:f.type,unit:f.unit,sourceId:f.sourceId})),sources:unique}).length,tableCount:new Set(unique.flatMap(s=>s.tableId?[s.tableId]:[])).size,blockCount:unique.filter(s=>s.kind==='BLOCK').length,schemaBytes:0};
}
