// Evaluation-only module. Never imported by the extraction runner or provider.
import { isDeepStrictEqual } from 'node:util';
import type { CandidateRulePackage } from './candidate.ts';
export type MatchCategory='EXACT_MATCH'|'PARTIAL_MATCH'|'WRONG_VALUE'|'WRONG_OPERATOR'|'WRONG_STAGE'|'WRONG_SCORE'|'EVIDENCE_MISMATCH'|'EXTRA_RULE'|'MISSING_RULE'|'NEEDS_HUMAN_REVIEW';
export type OracleAtom={key:string;value:unknown;operator:string|null;stage:string|null;score:number|null;maxScore:number|null;evidenceBlockIds:string[]};
export type OracleRule={id:string;supplyType:string;label:string;atoms:OracleAtom[]};
export type Alignment={oracleRuleId:string;atomKey:string;candidateId:string;scopeVerified:boolean;notes:string};
export type ExtraReview={candidateId:string;sourceSupported:boolean|null;critical:boolean;notes:string};
export type ConflictReview={id:string;description:string;detected:boolean|null;candidateIssueIndexes:number[];notes:string};
const ratio=(correct:number,total:number)=>({correct,total,ratio:total?correct/total:null});
export function evaluateOracle(p:CandidateRulePackage,oracle:OracleRule[],alignments:Alignment[],extraReviews:ExtraReview[],conflicts:ConflictReview[]){
  const candidateIds=new Set(p.candidateRules.map(r=>r.candidateRuleId)),oracleIds=new Set(oracle.map(r=>r.id));
  if(candidateIds.size!==p.candidateRules.length||oracleIds.size!==oracle.length)throw new Error('DUPLICATE_EVALUATION_ID');
  if(new Set(extraReviews.map(r=>r.candidateId)).size!==extraReviews.length||extraReviews.some(r=>!candidateIds.has(r.candidateId)))throw new Error('INVALID_EXTRA_REVIEW');
  if(new Set(conflicts.map(r=>r.id)).size!==conflicts.length||conflicts.some(r=>r.detected===true&&(!r.candidateIssueIndexes.length||r.candidateIssueIndexes.some(i=>!Number.isSafeInteger(i)||i<0||i>=p.unresolvedItems.length+p.conflicts.length))))throw new Error('INVALID_CONFLICT_REVIEW');
  const mapped=new Set<string>(),atomRows:{oracleId:string;atomKey:string;candidateId:string|null;categories:MatchCategory[]}[]=[];
  let numericN=0,numericOK=0,operatorN=0,operatorOK=0,scoreN=0,scoreOK=0,stageN=0,stageOK=0,evidenceN=0,evidenceOK=0;
  const seenAtoms=new Set<string>();
  for(const a of alignments){if(!candidateIds.has(a.candidateId)||!oracleIds.has(a.oracleRuleId)||!oracle.find(o=>o.id===a.oracleRuleId)!.atoms.some(x=>x.key===a.atomKey))throw new Error('INVALID_ALIGNMENT');const key=a.oracleRuleId+':'+a.atomKey;if(seenAtoms.has(key))throw new Error('DUPLICATE_ATOM_ALIGNMENT');seenAtoms.add(key);}
  for(const o of oracle)for(const expected of o.atoms){
    const link=alignments.find(a=>a.oracleRuleId===o.id&&a.atomKey===expected.key);
    if(!link){atomRows.push({oracleId:o.id,atomKey:expected.key,candidateId:null,categories:['MISSING_RULE']});continue;}
    mapped.add(link.candidateId);const candidate=p.candidateRules.find(r=>r.candidateRuleId===link.candidateId)!;const categories:MatchCategory[]=[];
    if(!link.scopeVerified){atomRows.push({oracleId:o.id,atomKey:expected.key,candidateId:link.candidateId,categories:['NEEDS_HUMAN_REVIEW']});continue;}
    if(!isDeepStrictEqual(candidate.condition.operator==='in'?candidate.condition.values:candidate.condition.value,expected.value))categories.push('WRONG_VALUE');
    if(typeof expected.value==='number'){numericN++;if(isDeepStrictEqual(candidate.condition.value,expected.value))numericOK++;}
    if(expected.operator!==null){operatorN++;if(candidate.condition.operator===expected.operator)operatorOK++;else categories.push('WRONG_OPERATOR');}
    if(expected.stage!==null){stageN++;if(candidate.stage===expected.stage)stageOK++;else categories.push('WRONG_STAGE');}
    if(expected.score!==null||expected.maxScore!==null){scoreN++;if(candidate.score===expected.score&&candidate.maxScore===expected.maxScore)scoreOK++;else categories.push('WRONG_SCORE');}
    if(expected.evidenceBlockIds.length){evidenceN++;if(candidate.evidence.some(e=>e.blockId!==null&&expected.evidenceBlockIds.includes(e.blockId)))evidenceOK++;else categories.push('EVIDENCE_MISMATCH');}
    else categories.push('NEEDS_HUMAN_REVIEW');
    atomRows.push({oracleId:o.id,atomKey:expected.key,candidateId:link.candidateId,categories:categories.length?categories:['EXACT_MATCH']});
  }
  const ruleRows=oracle.map(o=>{const atoms=atomRows.filter(a=>a.oracleId===o.id);const exact=o.atoms.length>0&&atoms.every(a=>a.categories.length===1&&a.categories[0]==='EXACT_MATCH');const missing=atoms.length>0&&atoms.every(a=>a.candidateId===null);return {oracleId:o.id,supplyType:o.supplyType,label:o.label,category:(exact?'EXACT_MATCH':missing?'MISSING_RULE':o.atoms.length===0?'NEEDS_HUMAN_REVIEW':'PARTIAL_MATCH') as MatchCategory,atoms};});
  const extraRows=p.candidateRules.filter(r=>!mapped.has(r.candidateRuleId)).map(r=>{const review=extraReviews.find(x=>x.candidateId===r.candidateRuleId);return {candidateId:r.candidateRuleId,category:(review?.sourceSupported===null||!review?'NEEDS_HUMAN_REVIEW':'EXTRA_RULE') as MatchCategory,hallucination:review?.sourceSupported===false,critical:review?.critical===true,notes:review?.notes??'Not in oracle does not establish hallucination.'};});
  const criticalErrors:unknown[]=atomRows.filter(a=>a.categories.some(c=>['WRONG_VALUE','WRONG_OPERATOR','WRONG_SCORE','WRONG_STAGE'].includes(c))).map(a=>({type:'CRITICAL_EXTRACTION_ERROR',...a}));
  criticalErrors.push(...extraRows.filter(r=>r.hallucination&&r.critical).map(r=>({type:'CRITICAL_EXTRACTION_ERROR',...r})));
  const ambiguousBlocks=new Set(p.unresolvedItems.flatMap(i=>i.evidence.map(e=>e.blockId)).filter(Boolean));
  const potentialFalseConfidence=p.candidateRules.filter(r=>r.confidence==='HIGH'&&r.evidence.some(e=>ambiguousBlocks.has(e.blockId))).map(r=>({candidateId:r.candidateRuleId,category:'NEEDS_HUMAN_REVIEW',reason:'HIGH candidate shares evidence with unresolved source context.'}));
  const exactRuleCount=ruleRows.filter(r=>r.category==='EXACT_MATCH').length;
  const semanticMappedCandidates=new Set(alignments.filter(a=>a.scopeVerified).map(a=>a.candidateId));
  return {ruleRows,atomRows,extraRows,criticalErrors,potentialFalseConfidence,conflicts,
    metrics:{oracleRules:oracle.length,candidates:p.candidateRules.length,ruleRecall:ratio(exactRuleCount,oracle.length),
      semanticCorrespondencePrecision:ratio(semanticMappedCandidates.size,p.candidateRules.length),
      numericAccuracy:ratio(numericOK,numericN),operatorAccuracy:ratio(operatorOK,operatorN),scoreAccuracy:ratio(scoreOK,scoreN),stageAccuracy:ratio(stageOK,stageN),evidenceGrounding:ratio(evidenceOK,evidenceN),
      hallucinationCount:extraRows.filter(r=>r.hallucination).length,unreviewedExtras:extraRows.filter(r=>r.category==='NEEDS_HUMAN_REVIEW').length,
      conflictRecall:ratio(conflicts.filter(c=>c.detected===true).length,conflicts.length),unreviewedConflicts:conflicts.filter(c=>c.detected===null).length,
      mappedOracleAtoms:atomRows.filter(a=>a.candidateId!==null).length,totalOracleAtoms:atomRows.length},
    acceptance:{automaticApproval:false,readyForAutomaticImport:false,reason:'Single benchmark cannot authorize automatic approval; unresolved coverage and critical errors require review.'}};
}
