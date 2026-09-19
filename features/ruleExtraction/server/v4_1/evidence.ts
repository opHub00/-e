import type { Evidence } from '../candidate.ts';

export type PreferredEvidenceClass='EXACT_LOCATOR_MATCH'|'EQUIVALENT_SOURCE_SUPPORT'|'DIFFERENT_BUT_VALID'|'SEMANTIC_MISMATCH';
const sameLocator=(left:Evidence,right:Evidence)=>JSON.stringify(left.locator)===JSON.stringify(right.locator);
export function classifyPreferredEvidence(candidate:Evidence[],preferred:Evidence[],semanticSupported:boolean):PreferredEvidenceClass{
  if(!semanticSupported)return 'SEMANTIC_MISMATCH';
  if(candidate.some(a=>preferred.some(b=>sameLocator(a,b))))return 'EXACT_LOCATOR_MATCH';
  if(candidate.some(a=>preferred.some(b=>(a.tableId!==null&&a.tableId===b.tableId)||(a.blockId!==null&&a.blockId===b.blockId))))return 'EQUIVALENT_SOURCE_SUPPORT';
  return 'DIFFERENT_BUT_VALID';
}
