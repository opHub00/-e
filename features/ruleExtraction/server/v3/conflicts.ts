import type { ExtractedFact } from './facts.ts';
import type { ParsedDocument } from '../parsedDocument.ts';

export type ConceptFacts={semanticConcept:string;factIds:string[]};
export type FactConflict={semanticConcept:string;sourceA:string;sourceB:string;valueA:string;valueB:string;resolution:null;requiresReview:true};
export function scanFactConflicts(facts:ExtractedFact[],concepts:ConceptFacts[]):FactConflict[]{
  const byId=new Map(facts.map(f=>[f.factId,f])),out:FactConflict[]=[];
  for(const concept of concepts){const candidates=concept.factIds.map(id=>byId.get(id)).filter((f):f is ExtractedFact=>!!f);
    for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){const a=candidates[i],b=candidates[j];if(a.sourceId===b.sourceId||a.unit!==b.unit||a.operator!==b.operator||a.normalizedValue===b.normalizedValue)continue;out.push({semanticConcept:concept.semanticConcept,sourceA:a.sourceId,sourceB:b.sourceId,valueA:String(a.normalizedValue),valueB:String(b.normalizedValue),resolution:null,requiresReview:true});}}
  return out;
}
export function scanReviewNotes(document:ParsedDocument){return document.blocks.filter(block=>block.type==='note'||/(검토|확인 필요|수정 예정|삭제 예정)/u.test(block.text)).map(block=>({semanticConcept:'DOCUMENT_REVIEW_NOTE',sourceA:block.id,sourceB:block.id,valueA:block.text,valueB:block.text,resolution:null,requiresReview:true as const}));}
