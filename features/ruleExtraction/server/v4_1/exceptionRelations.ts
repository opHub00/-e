export const EXCEPTION_RELATION_TYPES=['LIMITED_BY','EXEMPTED_BY','OVERRIDDEN_BY','QUALIFIED_BY','APPLIES_ONLY_IF'] as const;
export type ExceptionRelationType=typeof EXCEPTION_RELATION_TYPES[number];
export type ExceptionRelation={baseRuleKey:string;exceptionRuleKey:string;type:ExceptionRelationType};
export type ExceptionRelationStatus='PRESERVED'|'LINKED'|'ORPHAN_EXCEPTION'|'MISSING_EXCEPTION'|'WRONG_RELATION';
export type ExceptionRelationResult={exceptionRuleKey:string|null;baseRuleKey:string|null;status:ExceptionRelationStatus;relationType:ExceptionRelationType|null;reason:string};

const permitted=(base:string,exception:string,type:ExceptionRelationType)=>{
  if(/overseas|국외|해외/iu.test(exception))return type==='LIMITED_BY'||type==='EXEMPTED_BY';
  if(/spouse|배우자|혼인/iu.test(exception))return type==='EXEMPTED_BY'||type==='QUALIFIED_BY';
  if(/childbirth|출산/iu.test(exception))return type==='QUALIFIED_BY'||type==='APPLIES_ONLY_IF';
  return type==='LIMITED_BY'||type==='EXEMPTED_BY'||type==='OVERRIDDEN_BY'||type==='QUALIFIED_BY'||type==='APPLIES_ONLY_IF';
};

export function validateExceptionRelations(baseRuleKeys:string[],exceptionRuleKeys:string[],relations:ExceptionRelation[],expectedExceptionKeys:string[]=[]):ExceptionRelationResult[]{
  const bases=new Set(baseRuleKeys),exceptions=new Set(exceptionRuleKeys),results:ExceptionRelationResult[]=[];
  for(const key of expectedExceptionKeys)if(!exceptions.has(key))results.push({exceptionRuleKey:key,baseRuleKey:null,status:'MISSING_EXCEPTION',relationType:null,reason:'expected exception candidate was not preserved'});
  for(const key of exceptionRuleKeys){
    const linked=relations.filter(relation=>relation.exceptionRuleKey===key);
    if(!linked.length){results.push({exceptionRuleKey:key,baseRuleKey:null,status:'ORPHAN_EXCEPTION',relationType:null,reason:'exception exists without a base relation'});continue;}
    for(const relation of linked){
      const status=!bases.has(relation.baseRuleKey)||!exceptions.has(relation.exceptionRuleKey)||!permitted(relation.baseRuleKey,relation.exceptionRuleKey,relation.type)?'WRONG_RELATION':'LINKED';
      results.push({exceptionRuleKey:key,baseRuleKey:relation.baseRuleKey,status,relationType:relation.type,reason:status==='LINKED'?'base, exception and semantic relation are valid':'relation endpoint or semantic type is invalid'});
    }
  }
  for(const relation of relations)if(!exceptions.has(relation.exceptionRuleKey))results.push({exceptionRuleKey:relation.exceptionRuleKey,baseRuleKey:relation.baseRuleKey,status:'WRONG_RELATION',relationType:relation.type,reason:'relation points to an absent exception'});
  return results;
}
