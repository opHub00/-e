import type { ParsedDocument } from '../parsedDocument.ts';
import { factEvidenceText, type ApplicantScope, type ExtractedFact } from '../v3/facts.ts';
import type { SemanticBinding } from '../v3/contract.ts';
import type { SemanticTask } from '../v3/tasks.ts';
import { assertRoleFactContract } from '../v4/retrieval.ts';

export const CRITICAL_ROLES = ['AGE','HOUSING','SUBSCRIPTION','INCOME','ASSET','TAX_HISTORY','SAVINGS','STAGE','SCORE','SCOPE','EXCEPTION'] as const;
export type CriticalRole = typeof CRITICAL_ROLES[number];
export type SemanticErrorCategory = 'WRONG_SEMANTIC_ROLE'|'WRONG_FACT_BINDING'|'WRONG_SCOPE'|'WRONG_EXCEPTION_RELATION'|'WRONG_CATEGORY'|'WRONG_STAGE'|'EVIDENCE_SEMANTIC_MISMATCH';
export type GuardStatus = 'ACCEPTED'|'REVIEW_REQUIRED'|'REJECTED';
export type GuardIssue = { code:string; category:SemanticErrorCategory; severity:'REVIEW'|'REJECT'; message:string; factIds:string[] };
export type V41Confidence = { level:'HIGH'|'MEDIUM'|'REVIEW_REQUIRED'; reason:string };
export type SemanticGuardResult = { status:GuardStatus; criticalRole:CriticalRole; issues:GuardIssue[]; confidence:V41Confidence };

const numeric = (fact:ExtractedFact) => typeof fact.normalizedValue === 'number' ? fact.normalizedValue : null;
const anyTag = (facts:ExtractedFact[], tag:string) => facts.some(fact=>fact.contextTags.includes(tag as never));
const anyTable = (facts:ExtractedFact[], table:string) => facts.some(fact=>fact.tableIdentities.includes(table as never));
const issue = (code:string, category:SemanticErrorCategory, severity:'REVIEW'|'REJECT', facts:ExtractedFact[], message=code):GuardIssue => ({code,category,severity,message,factIds:facts.map(f=>f.factId)});
const supplyOf = (role:string) => role.split('.')[0] as 'COMMON'|'YOUTH'|'NEWLYWED'|'FIRST_TIME';
const expectedStage = (task:SemanticTask, role:string) => task.stageByRole?.[role] ?? task.stage;

export function criticalRoleFor(role:string):CriticalRole {
  if(role.includes('SCORE'))return 'SCORE';
  if(role.includes('INCOME'))return 'INCOME';
  if(role.includes('ASSET'))return 'ASSET';
  if(role.includes('TAX'))return 'TAX_HISTORY';
  if(role.includes('SAVINGS'))return 'SAVINGS';
  if(role.includes('AGE'))return 'AGE';
  if(role.includes('ACCOUNT')||role.includes('PAYMENT_COUNT'))return 'SUBSCRIPTION';
  if(role.includes('HOME')||role.includes('HOUSING'))return 'HOUSING';
  if(role.includes('EXCEPTION'))return 'EXCEPTION';
  if(role.includes('SUPPLY_RATIO')||role.includes('PRIORITY')||role.includes('GENERAL')||role.includes('LOTTERY'))return 'STAGE';
  return 'SCOPE';
}

export type LiteralExpectation = { values:number[]; operator?:ExtractedFact['operator']; unit?:string; scope?:ApplicantScope };
/**
 * Literal values one announcement states (annual asset limits, won income amounts,
 * regional-priority residence rules). They are supplied by the caller for that
 * announcement; the guard itself only knows values fixed by the national supply rules.
 */
export type AnnouncementLiteralExpectations = { exact?:Record<string,LiteralExpectation>; income?:Record<string,number[]> };
/** Values fixed by the national public-sale supply rules, identical for every announcement. */
const exactExpectations:Record<string,LiteralExpectation> = {
  'YOUTH.AGE_MIN':{values:[19],operator:'gte',unit:'AGE_YEAR',scope:'APPLICANT'},
  'YOUTH.AGE_MAX':{values:[39],operator:'lte',unit:'AGE_YEAR',scope:'APPLICANT'},
  'YOUTH.ACCOUNT_MONTHS_MIN':{values:[6],operator:'gte',unit:'MONTH',scope:'APPLICANT'},
  'YOUTH.PAYMENT_COUNT_MIN':{values:[6],operator:'gte',unit:'PAYMENT_COUNT',scope:'APPLICANT'},
  'YOUTH.INCOME_LIMIT':{values:[140],operator:'lte',scope:'APPLICANT'},
  'YOUTH.PRIORITY.SUPPLY_RATIO':{values:[30],operator:'eq',unit:'PERCENT'},
  'YOUTH.PRIORITY.TAX_YEARS_MIN':{values:[5],operator:'gte',unit:'YEAR',scope:'APPLICANT'},
  'NEWLYWED.MARRIAGE_YEARS_MAX':{values:[7],operator:'lte',unit:'YEAR'},
  'NEWLYWED.CHILD_AGE_MAX':{values:[6],operator:'lte',unit:'AGE_YEAR',scope:'CHILD'},
  'NEWLYWED.ACCOUNT_MONTHS_MIN':{values:[6],operator:'gte',unit:'MONTH'},
  'NEWLYWED.PAYMENT_COUNT_MIN':{values:[6],operator:'gte',unit:'PAYMENT_COUNT'},
  'NEWLYWED.PRIORITY.SUPPLY_RATIO':{values:[30],operator:'eq',unit:'PERCENT'},
  'NEWLYWED.GENERAL.SUPPLY_RATIO':{values:[60],operator:'eq',unit:'PERCENT'},
  'FIRST_TIME.ACCOUNT_MONTHS_MIN':{values:[6],operator:'gte',unit:'MONTH'},
  'FIRST_TIME.PAYMENT_COUNT_MIN':{values:[6],operator:'gte',unit:'PAYMENT_COUNT'},
  'FIRST_TIME.SAVINGS_MIN':{values:[6_000_000],operator:'gte',unit:'KRW'},
  'FIRST_TIME.TAX_YEARS_MIN':{values:[5],operator:'gte',unit:'YEAR',scope:'APPLICANT'},
  'FIRST_TIME.PRIORITY.SUPPLY_RATIO':{values:[70],operator:'eq',unit:'PERCENT'},
  'FIRST_TIME.GENERAL.SUPPLY_RATIO':{values:[20],operator:'eq',unit:'PERCENT'},
};
function mergeExpectation(base:LiteralExpectation|undefined,extra:LiteralExpectation|undefined):LiteralExpectation|undefined{
  if(!base||!extra)return base??extra;
  return {...extra,...base,values:[...new Set([...base.values,...extra.values])]};
}
const incomeValues:Record<string,number[]> = {
  'YOUTH.INCOME_LIMIT':[140],
  'NEWLYWED.INCOME.SINGLE_LIMIT':[70,100,130],
  'NEWLYWED.INCOME.DUAL_LIMIT':[80,110,140,200],
  'FIRST_TIME.INCOME.SINGLE_LIMIT':[100,130],
  'FIRST_TIME.INCOME.DUAL_LIMIT':[120,140,200],
  'FIRST_TIME.PRIORITY.INCOME_LIMIT':[100,120],
  'FIRST_TIME.GENERAL.INCOME_LIMIT':[130,140],
  'FIRST_TIME.LOTTERY.INCOME_LIMIT':[130,200],
};

function semanticEvidenceIssues(role:string,facts:ExtractedFact[]):GuardIssue[]{
  const out:GuardIssue[]=[];
  if(role.includes('INCOME')&&(!anyTag(facts,'INCOME')||anyTag(facts,'ASSET')||anyTag(facts,'SUBSCRIPTION')||anyTag(facts,'CHILDBIRTH_RELAXATION')))
    out.push(issue('INCOME_EVIDENCE_CONTEXT_MISMATCH','EVIDENCE_SEMANTIC_MISMATCH','REJECT',facts));
  if(role.includes('ASSET')&&(!anyTag(facts,'ASSET')||anyTag(facts,'SUBSCRIPTION')||facts.some(f=>f.type!=='MONEY')))
    out.push(issue('ASSET_EVIDENCE_CONTEXT_MISMATCH','EVIDENCE_SEMANTIC_MISMATCH','REJECT',facts));
  if(role.includes('SAVINGS')&&(!anyTag(facts,'SUBSCRIPTION')||anyTag(facts,'ASSET')))
    out.push(issue('SAVINGS_EVIDENCE_CONTEXT_MISMATCH','EVIDENCE_SEMANTIC_MISMATCH','REJECT',facts));
  if(role.includes('TAX')&&!anyTag(facts,'TAX'))out.push(issue('TAX_EVIDENCE_CONTEXT_MISMATCH','EVIDENCE_SEMANTIC_MISMATCH','REJECT',facts));
  if(role.includes('SCORE')&&!role.includes('SCORELESS')&&(!anyTag(facts,'SCORE')||!facts.every(f=>f.type==='SCORE'&&(f.unit==='SCORE_VALUE'||f.unit==='MAX_SCORE'))))
    out.push(issue('SCORE_FACT_TYPE_REQUIRED','WRONG_CATEGORY','REJECT',facts));
  return out;
}

function rangeIssues(role:string,boundFacts:ExtractedFact[],allFacts:ExtractedFact[]):GuardIssue[]{
  const out:GuardIssue[]=[];
  for(const fact of boundFacts){
    if(fact.type==='RANGE')continue;
    const value=numeric(fact);if(value===null)continue;
    const enclosing=allFacts.find(candidate=>candidate.type==='RANGE'&&candidate.sourceId===fact.sourceId&&candidate.range?.unit===fact.unit&&(candidate.range.lowerValue===value||candidate.range.upperValue===value));
    if(enclosing&&!boundFacts.some(item=>item.factId===enclosing.factId))out.push(issue(`PARTIAL_RANGE_BINDING:${role}`,'WRONG_FACT_BINDING','REJECT',[fact]));
  }
  return out;
}

/** Whose value a role describes. Generic: the scope of an asset limit does not depend on its amount. */
const roleScopes:Record<string,ApplicantScope>={
  'YOUTH.APPLICANT_ASSET_LIMIT':'APPLICANT','YOUTH.PARENT_ASSET_LIMIT':'PARENT','NEWLYWED.ASSET_LIMIT':'HOUSEHOLD','FIRST_TIME.ASSET_LIMIT':'HOUSEHOLD',
};
function scopeIssues(role:string,facts:ExtractedFact[]):GuardIssue[]{
  const expectation=exactExpectations[role]?.scope??roleScopes[role];
  if(expectation&&!facts.every(f=>f.applicantScopes.includes(expectation)))return [issue(`SCOPE_MISMATCH:${expectation}`,'WRONG_SCOPE','REJECT',facts)];
  if(role==='NEWLYWED.APPLICANT_TYPE'&&facts.some(f=>f.rawValue.includes('예비신혼')&&!f.applicantScopes.includes('FUTURE_HOUSEHOLD')))return [issue('FUTURE_HOUSEHOLD_SCOPE_REQUIRED','WRONG_SCOPE','REJECT',facts)];
  return [];
}

export function deriveHostConfidenceV41(document:ParsedDocument,binding:SemanticBinding,facts:ExtractedFact[],issues:GuardIssue[]):V41Confidence{
  if(issues.length||binding.qualifierSourceIds.length||facts.some(f=>f.contextTags.includes('EXCEPTION')||f.contextTags.includes('CHILDBIRTH_RELAXATION')||f.bindingStatus!=='BOUND'||f.type==='RANGE'))return {level:'REVIEW_REQUIRED',reason:'semantic guard, 예외, 범위 또는 모호성 때문에 검토가 필요합니다.'};
  const sourceCount=new Set([...binding.sourceIds,...facts.map(f=>f.sourceId)]).size;
  const reconstructed=facts.some(f=>f.tableId&&document.tables.find(t=>t.id===f.tableId)?.fidelity==='GEOMETRY_INFERRED');
  if(sourceCount!==1||reconstructed)return {level:'MEDIUM',reason:'복수 근거 또는 재구성된 표를 사용했습니다.'};
  const role=criticalRoleFor(binding.semanticRole),recognizedTable=!facts.some(f=>f.tableId!==null)||facts.some(f=>f.tableIdentities.some(identity=>identity!=='UNKNOWN_TABLE'));
  const evidenceExact=recognizedTable&&(!['INCOME','ASSET','SCORE'].includes(role)||anyTable(facts,role==='INCOME'?'INCOME_TABLE':role==='ASSET'?'ASSET_TABLE':supplyOf(binding.semanticRole)==='YOUTH'?'YOUTH_SCORE_TABLE':'NEWLYWED_SCORE_TABLE'));
  if(!evidenceExact)return {level:'REVIEW_REQUIRED',reason:'critical role의 표/문맥 근거가 충분하지 않습니다.'};
  return {level:'HIGH',reason:'단일 deterministic fact, 정확한 scope와 semantic evidence guard를 모두 통과했습니다.'};
}

export function validateSemanticBindingV41(document:ParsedDocument,task:SemanticTask,binding:SemanticBinding,taskFacts:ExtractedFact[],allFacts:ExtractedFact[]=taskFacts,announcement:AnnouncementLiteralExpectations={}):SemanticGuardResult{
  const byId=new Map(taskFacts.map(f=>[f.factId,f])),facts=binding.factIds.map(id=>byId.get(id)).filter((f):f is ExtractedFact=>!!f),issues:GuardIssue[]=[];
  const criticalRole=criticalRoleFor(binding.semanticRole);
  if(!facts.length)issues.push(issue('NO_BOUND_FACT','WRONG_FACT_BINDING','REJECT',facts));
  try{assertRoleFactContract(binding.semanticRole,facts,task);}catch(error){issues.push(issue(error instanceof Error?error.message:'ROLE_FACT_CONTRACT_VIOLATION','WRONG_FACT_BINDING','REJECT',facts));}
  if(supplyOf(binding.semanticRole)!==task.scope&&task.scope!=='COMMON')issues.push(issue('SUPPLY_SCOPE_MISMATCH','WRONG_SCOPE','REJECT',facts));
  if(binding.semanticRole.startsWith('FIRST_TIME.')&&binding.semanticRole.includes('SCORE')&&!binding.semanticRole.includes('SCORELESS'))issues.push(issue('CRITICAL_SCORE_VIOLATION','WRONG_CATEGORY','REJECT',facts));
  const expected=mergeExpectation(exactExpectations[binding.semanticRole],announcement.exact?.[binding.semanticRole]);
  if(expected)for(const fact of facts){const value=numeric(fact),operatorMatches=!expected.operator||(expected.operator==='eq'?(fact.operator===null||fact.operator==='eq'):fact.operator===expected.operator);if(value!==null&&(!expected.values.includes(value)||(expected.unit&&fact.unit!==expected.unit)||!operatorMatches))issues.push(issue(`EXACT_ROLE_LITERAL_MISMATCH:${binding.semanticRole}`,'WRONG_SEMANTIC_ROLE','REJECT',[fact]));}
  const statutoryIncome=incomeValues[binding.semanticRole],announcedIncome=announcement.income?.[binding.semanticRole];
  const allowedIncome=statutoryIncome||announcedIncome?[...new Set([...(statutoryIncome??[]),...(announcedIncome??[])])]:undefined;
  if(allowedIncome)for(const fact of facts){const value=numeric(fact);if(value!==null&&!allowedIncome.includes(value))issues.push(issue(`INCOME_LITERAL_MISMATCH:${binding.semanticRole}`,'WRONG_SEMANTIC_ROLE','REJECT',[fact]));}
  if(binding.semanticRole.includes('SUPPLY_RATIO')&&expectedStage(task,binding.semanticRole)==='COMMON')issues.push(issue('SUPPLY_RATIO_STAGE_MISSING','WRONG_STAGE','REJECT',facts));
  issues.push(...semanticEvidenceIssues(binding.semanticRole,facts),...scopeIssues(binding.semanticRole,facts),...rangeIssues(binding.semanticRole,facts,allFacts));
  const unique=[...new Map(issues.map(item=>[`${item.code}|${item.factIds.join(',')}`,item])).values()];
  const confidence=deriveHostConfidenceV41(document,binding,facts,unique);
  const status:GuardStatus=unique.some(item=>item.severity==='REJECT')?'REJECTED':unique.length||confidence.level==='REVIEW_REQUIRED'?'REVIEW_REQUIRED':'ACCEPTED';
  return {status,criticalRole,issues:unique,confidence};
}

export function semanticEvidenceText(document:ParsedDocument,facts:ExtractedFact[]):string{return facts.map(f=>factEvidenceText(document,f)).join('\n');}
