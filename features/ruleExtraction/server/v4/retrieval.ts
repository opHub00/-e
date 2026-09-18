import type { ParsedDocument } from '../parsedDocument.ts';
import type { ApplicantScope,ExtractedFact,FactContextTag,FactType,TableIdentity } from '../v3/facts.ts';
import type { SemanticTask,TaskSource } from '../v3/tasks.ts';

export type FactContract={
  role:string; allowedTypes:FactType[]; allowedUnits:string[]; requiredTags:FactContextTag[]; forbiddenTags:FactContextTag[];
  requiredTerms:string[]; forbiddenTerms:string[]; preferredTables:TableIdentity[]; applicantScopes:ApplicantScope[];
  requiresOperator:boolean; allowsDeterministicEquality:boolean; topK:number;
};
export type RankedFact={fact:ExtractedFact;score:number;reasons:string[]};
export type CoverageStatus='READY'|'NOT_READY_MISSING_FACT'|'NOT_READY_MISSING_OPERATOR';
export type SelectionTelemetry={factsAvailable:number;factsAfterTypeFilter:number;factsAfterContextFilter:number;factsSelected:number;sourcesAvailable:number;sourcesSelected:number;truncated:boolean;droppedFactCount:number;roleCoverage:Record<string,CandidateCoverage>};
export type CandidateCoverage={status:CoverageStatus;candidateCount:number;operatorMissingCount:number};
export type RetrievalResult={facts:ExtractedFact[];sources:TaskSource[];rankedByRole:Record<string,RankedFact[]>;telemetry:SelectionTelemetry};

const numericTypes=new Set<FactType>(['PERCENT','MONEY','DURATION_MONTHS','DURATION_YEARS','COUNT','AGE']);
const includesAny=(text:string,terms:string[])=>terms.some(term=>text.includes(term));
const typeUnits=(role:string):Pick<FactContract,'allowedTypes'|'allowedUnits'>=>{
  if(/(?:^|\.)AGE_/u.test(role)||role.includes('CHILD_AGE'))return {allowedTypes:['AGE'],allowedUnits:['AGE_YEAR']};
  if(role.includes('ACCOUNT_MONTHS'))return {allowedTypes:['DURATION_MONTHS'],allowedUnits:['MONTH']};
  if(role.includes('PAYMENT_COUNT'))return {allowedTypes:['COUNT'],allowedUnits:['PAYMENT_COUNT']};
  if(role.includes('SAVINGS'))return {allowedTypes:['MONEY'],allowedUnits:['KRW']};
  if(role.includes('ASSET'))return {allowedTypes:['MONEY'],allowedUnits:['KRW']};
  if(role.includes('INCOME'))return {allowedTypes:['PERCENT','MONEY','RANGE'],allowedUnits:['PERCENT','KRW']};
  if(role.includes('TAX_YEARS'))return {allowedTypes:['DURATION_YEARS'],allowedUnits:['YEAR']};
  if(role.includes('MARRIAGE_YEARS')||role.includes('HOMELESS_DURATION')||role.includes('RESIDENCE_MIN'))return {allowedTypes:['DURATION_YEARS','DURATION_MONTHS'],allowedUnits:['YEAR','MONTH']};
  if(role.includes('CHILD_AGE'))return {allowedTypes:['AGE'],allowedUnits:['AGE_YEAR']};
  if(role.includes('SUPPLY_RATIO')||role.includes('PRIORITY_RATIO'))return {allowedTypes:['PERCENT'],allowedUnits:['PERCENT']};
  if(role.includes('SCORE.TOTAL'))return {allowedTypes:['SCORE'],allowedUnits:['SCORE_VALUE','MAX_SCORE']};
  if(role.includes('SCORE.INCOME'))return {allowedTypes:['SCORE','RANGE','PERCENT'],allowedUnits:['SCORE_VALUE','MAX_SCORE','PERCENT']};
  if(role.includes('SCORE.PAYMENT'))return {allowedTypes:['SCORE','RANGE','COUNT'],allowedUnits:['SCORE_VALUE','MAX_SCORE','PAYMENT_COUNT']};
  if(role.includes('SCORE.CHILDREN'))return {allowedTypes:['SCORE','COUNT'],allowedUnits:['SCORE_VALUE','MAX_SCORE','PERSON']};
  if(role.includes('SCORE.HOMELESS')||role.includes('SCORE.RESIDENCE')||role.includes('SCORE.TAX'))return {allowedTypes:['SCORE','RANGE','DURATION_YEARS'],allowedUnits:['SCORE_VALUE','MAX_SCORE','YEAR']};
  if(role.includes('SCORE'))return {allowedTypes:['SCORE','RANGE','PERCENT','COUNT','DURATION_YEARS'],allowedUnits:['SCORE_VALUE','MAX_SCORE','PERCENT','PAYMENT_COUNT','PERSON','YEAR']};
  if(role.includes('EXCEPTION'))return {allowedTypes:['BOOLEAN_PHRASE','PERCENT','MONEY','DATE','DURATION_MONTHS','DURATION_YEARS','COUNT','AGE','RANGE'],allowedUnits:['BOOLEAN','PERCENT','KRW','DATE','MONTH','YEAR','PAYMENT_COUNT','DAY','PERSON','AGE_YEAR']};
  return {allowedTypes:['BOOLEAN_PHRASE'],allowedUnits:['BOOLEAN']};
};

export function factContractForRole(role:string):FactContract{
  const typed=typeUnits(role),requiredTags:FactContextTag[]=[],forbiddenTags:FactContextTag[]=[],requiredTerms:string[]=[],forbiddenTerms:string[]=[],preferredTables:TableIdentity[]=[],applicantScopes:ApplicantScope[]=[];
  if(role.startsWith('YOUTH.'))requiredTags.push('YOUTH');
  if(role.startsWith('NEWLYWED.'))requiredTags.push('NEWLYWED');
  if(role.startsWith('FIRST_TIME.'))requiredTags.push('FIRST_TIME');
  if(role.includes('INCOME')){requiredTags.push('INCOME');requiredTerms.push('소득');forbiddenTags.push('CHILDBIRTH_RELAXATION','ASSET','SUBSCRIPTION');preferredTables.push('INCOME_TABLE');}
  if(role.includes('ASSET')){requiredTags.push('ASSET');requiredTerms.push('자산');forbiddenTags.push('SUBSCRIPTION');forbiddenTerms.push('청약저축','예치금','선납금','600만원');preferredTables.push('ASSET_TABLE');}
  if(role.includes('SAVINGS')){requiredTags.push('SUBSCRIPTION');requiredTerms.push('저축','선납','600만원');forbiddenTags.push('ASSET');preferredTables.push('SUBSCRIPTION_TABLE');}
  if(role.includes('ACCOUNT')||role.includes('PAYMENT')){requiredTags.push('SUBSCRIPTION');requiredTerms.push('청약','가입','납입');preferredTables.push('SUBSCRIPTION_TABLE');}
  if(role.includes('TAX')){requiredTags.push('TAX');requiredTerms.push('소득세','근로기간');}
  if(/(?:^|\.)AGE_/u.test(role)||role.includes('CHILD_AGE')){requiredTags.push('AGE');requiredTerms.push('세','연령');}
  if(role.includes('SCORE')){requiredTags.push('SCORE');requiredTerms.push('가점','점');preferredTables.push(role.startsWith('YOUTH.')?'YOUTH_SCORE_TABLE':'NEWLYWED_SCORE_TABLE');}
  if(role.includes('SCORE.INCOME'))requiredTerms.push('월평균소득','소득');
  if(role.includes('SCORE.PAYMENT'))requiredTerms.push('납입인정','청약저축');
  if(role.includes('SCORE.RESIDENCE'))requiredTerms.push('거주기간','연속 거주');
  if(role.includes('SCORE.TAX'))requiredTerms.push('소득세','근로기간');
  if(role.includes('SCORE.CHILDREN'))requiredTerms.push('자녀');
  if(role.includes('SCORE.HOMELESS'))requiredTerms.push('무주택기간');
  if(role.includes('APPLICANT_ASSET'))requiredTerms.push('신청자 본인','본인');
  if(role.includes('PARENT_ASSET'))requiredTerms.push('부모');
  if(role.includes('INCOME.DUAL'))requiredTerms.push('맞벌이');
  if(role.includes('.PRIORITY.'))requiredTerms.push('우선공급','1단계');
  if(role.includes('.GENERAL.'))requiredTerms.push('일반공급','2단계');
  if(role.includes('.LOTTERY.'))requiredTerms.push('추첨공급','3단계','추첨');
  if(role.startsWith('YOUTH.')&&/(?:^|\.)AGE_/u.test(role))requiredTerms.push('혼인 중','과거 주택');
  if(role.includes('SUPPLY_RATIO')||role.includes('PRIORITY_RATIO'))forbiddenTags.push('CHILDBIRTH_RELAXATION');
  if(role.includes('SUPPLY_RATIO')||role.includes('PRIORITY_RATIO')){requiredTags.push('STAGE');requiredTerms.push('공급','단계');preferredTables.push('SUPPLY_STAGE_TABLE');}
  if(role.includes('EXCEPTION')){requiredTags.push('EXCEPTION');requiredTerms.push('예외','특례','다만','제외','해외체류','혼인 전');}
  if(role.includes('PARENT'))applicantScopes.push('PARENT');else if(role.startsWith('YOUTH.'))applicantScopes.push('APPLICANT');
  if(role.startsWith('NEWLYWED.'))applicantScopes.push('HOUSEHOLD','FUTURE_HOUSEHOLD');
  if(role.startsWith('FIRST_TIME.'))applicantScopes.push('HOUSEHOLD');
  const equality=role.includes('SUPPLY_RATIO')||role.includes('PRIORITY_RATIO')||role.includes('SCORE')||role.includes('ELIGIBILITY')||role.includes('APPLICANT_TYPE')||role.includes('SCORELESS')||role.includes('EXCEPTION');
  return {role,...typed,requiredTags:[...new Set(requiredTags)],forbiddenTags:[...new Set(forbiddenTags)],requiredTerms:[...new Set(requiredTerms)],forbiddenTerms:[...new Set(forbiddenTerms)],preferredTables:[...new Set(preferredTables)],applicantScopes:[...new Set(applicantScopes)],requiresOperator:typed.allowedTypes.some(type=>numericTypes.has(type))&&!equality,allowsDeterministicEquality:equality,topK:role.includes('SCORE')?8:role.includes('INCOME')?6:4};
}

function scopeCompatible(task:SemanticTask,fact:ExtractedFact){if(task.scope==='COMMON')return true;return fact.primarySupplyScope?fact.primarySupplyScope===task.scope:fact.contextTags.includes(task.scope);}
function compatible(fact:ExtractedFact,contract:FactContract,task:SemanticTask){
  if(!contract.allowedTypes.includes(fact.type)||!contract.allowedUnits.includes(fact.unit))return false;
  if(!scopeCompatible(task,fact))return false;
  if(contract.forbiddenTags.some(tag=>fact.contextTags.includes(tag))||includesAny(fact.contextText,contract.forbiddenTerms))return false;
  if(contract.requiredTags.length&&!contract.requiredTags.some(tag=>fact.contextTags.includes(tag)))return false;
  if(contract.requiredTerms.length&&!includesAny(fact.contextText,contract.requiredTerms)&&!contract.preferredTables.some(table=>fact.tableIdentities.includes(table)))return false;
  return true;
}
function rank(fact:ExtractedFact,contract:FactContract,task:SemanticTask):RankedFact{
  let score=100;const reasons=['TYPE_UNIT_MATCH'];
  if(scopeCompatible(task,fact)){score+=40;reasons.push('SUPPLY_SCOPE_MATCH');}
  const tagMatches=contract.requiredTags.filter(tag=>fact.contextTags.includes(tag)).length;score+=tagMatches*25;if(tagMatches)reasons.push('CONTEXT_TAG_MATCH');
  const termMatches=contract.requiredTerms.filter(term=>fact.contextText.includes(term)).length;score+=termMatches*15;if(termMatches)reasons.push('KEYWORD_MATCH');
  if(contract.preferredTables.some(table=>fact.tableIdentities.includes(table))){score+=35;reasons.push('TABLE_IDENTITY_MATCH');}
  if(contract.role.includes('SCORE')&&fact.type==='SCORE'){score+=60;reasons.push('SCORE_FACT_PRIORITY');}
  if(contract.role.includes('SCORE.TOTAL')&&fact.unit==='MAX_SCORE'){score+=100;reasons.push('MAX_SCORE_PRIORITY');}
  if((contract.role.includes('SUPPLY_RATIO')||contract.role.includes('PRIORITY_RATIO'))){if(/공급량|공급\s*\(?\s*\d+\s*%/u.test(fact.localContextText)){score+=100;reasons.push('SUPPLY_RATIO_CONTEXT');}if(/월평균소득|소득액/u.test(fact.localContextText))score-=120;}
  if(contract.role.includes('.PRIORITY.')&&/우선공급|1단계/u.test(fact.localContextText))score+=70;
  if(contract.role.includes('.GENERAL.')&&/일반공급|2단계/u.test(fact.localContextText))score+=70;
  if(contract.role.includes('.LOTTERY.')&&/추첨공급|3단계|추첨/u.test(fact.localContextText))score+=70;
  if(contract.role.includes('EXCEPTION')&&fact.type==='BOOLEAN_PHRASE'){score+=50;reasons.push('EXCEPTION_MARKER_PRIORITY');}
  if(contract.role.endsWith('MIN')&&fact.operator==='gte')score+=45;
  if(contract.role.endsWith('MAX')&&fact.operator==='lte')score+=45;
  if(contract.applicantScopes.some(scope=>fact.applicantScopes.includes(scope))){score+=10;reasons.push('APPLICANT_SCOPE_MATCH');}
  if(fact.operator!==null||fact.type==='RANGE'){score+=8;reasons.push('OPERATOR_BOUND');}
  if(fact.bindingStatus!=='BOUND')score-=100;
  return {fact,score,reasons};
}
function sourceFor(document:ParsedDocument,sourceId:string):TaskSource|null{
  if(sourceId.startsWith('cell:')){const [,tableId,row,column]=sourceId.split(':');const cell=document.tables.find(table=>table.id===tableId)?.rows[Number(row)]?.find(item=>item.column===Number(column));return cell?{sourceId,text:cell.text,kind:'CELL',tableId,excerpted:false}:null;}
  const block=document.blocks.find(item=>item.id===sourceId);return block?{sourceId,text:block.text,kind:'BLOCK',tableId:block.sourceLocator.tableId??null,excerpted:false}:null;
}
export function retrieveTaskCandidates(document:ParsedDocument,facts:ExtractedFact[],task:SemanticTask):RetrievalResult{
  const rankedByRole:Record<string,RankedFact[]>={},selected=new Map<string,ExtractedFact>(),roleCoverage:Record<string,CandidateCoverage>={};let afterType=0,afterContext=0;
  for(const role of task.allowedRoles){const contract=factContractForRole(role),typed=facts.filter(fact=>contract.allowedTypes.includes(fact.type)&&contract.allowedUnits.includes(fact.unit));afterType+=typed.length;const contextual=typed.filter(fact=>compatible(fact,contract,task));afterContext+=contextual.length;
    const operatorMissing=contextual.filter(fact=>contract.requiresOperator&&numericTypes.has(fact.type)&&fact.operator===null).length;
    const valid=contextual.filter(fact=>!(contract.requiresOperator&&numericTypes.has(fact.type)&&fact.operator===null)).map(fact=>rank(fact,contract,task)).sort((a,b)=>b.score-a.score||a.fact.sourceId.localeCompare(b.fact.sourceId)||a.fact.characterOffset-b.fact.characterOffset).slice(0,contract.topK);
    rankedByRole[role]=valid;for(const item of valid)selected.set(item.fact.factId,item.fact);
    roleCoverage[role]={status:valid.length?'READY':operatorMissing?'NOT_READY_MISSING_OPERATOR':'NOT_READY_MISSING_FACT',candidateCount:valid.length,operatorMissingCount:operatorMissing};
  }
  const selectedFacts=[...selected.values()],sourceIds=[...new Set(selectedFacts.map(fact=>fact.sourceId))],sources=sourceIds.map(id=>sourceFor(document,id)).filter((source):source is TaskSource=>source!==null);
  return {facts:selectedFacts,sources,rankedByRole,telemetry:{factsAvailable:facts.length,factsAfterTypeFilter:afterType,factsAfterContextFilter:afterContext,factsSelected:selectedFacts.length,sourcesAvailable:document.blocks.length+document.tables.reduce((sum,table)=>sum+table.rows.flat().length,0),sourcesSelected:sources.length,truncated:Object.values(rankedByRole).some(items=>items.length>0)&&selectedFacts.length<afterContext,droppedFactCount:Math.max(0,afterContext-selectedFacts.length),roleCoverage}};
}
