import { isDeepStrictEqual } from 'node:util';
import { array, exact, integer, object, string, validateParsedDocument, type ParsedDocument, type SourceLocator } from './parsedDocument.ts';

export const PROMPT_VERSION = 'assessment-rule-extraction-v1';
export const SUPPLIES = ['YOUTH','NEWLYWED','FIRST_TIME','NEWBORN','GENERAL','INSTITUTIONAL'] as const;
export const KINDS = ['eligibility','age','maritalStatus','housingOwnership','region','residenceDuration','subscriptionAccount','paymentCount','savingsAmount','incomeThreshold','assetThreshold','stage','score','lottery','supplyPercentage','exception'] as const;
export type Evidence = { documentId: string; blockId: string | null; tableId: string | null; row: number | null; column: number | null; snippet: string; locator: SourceLocator };
export type Condition = { input: string; operator: 'eq'|'neq'|'gt'|'gte'|'lt'|'lte'|'in'|'exists'; value: string|number|boolean|null; values: (string|number|boolean)[] };
export type CandidateRule = {
  candidateRuleId: string; supplyType: typeof SUPPLIES[number]; stage: 'COMMON'|'PRIORITY'|'GENERAL'|'LOTTERY';
  category: typeof KINDS[number]; ruleKey: string; condition: Condition; score: number|null; maxScore: number|null;
  requiredInputs: string[]; evidence: Evidence[]; confidence: 'HIGH'|'MEDIUM'|'LOW'; confidenceReason: string; reviewStatus: 'REVIEW_REQUIRED';
};
export const ISSUE_TYPES = ['CONFLICTING_VALUES','MISSING_CONTEXT','UNCLEAR_TABLE_STRUCTURE','DRAFT_NOTE','REVIEW_MEMO','UNSUPPORTED_EXCEPTION','AMBIGUOUS_REGION_MAPPING','AMBIGUOUS_HOUSING_MANAGEMENT_NUMBER','AMBIGUOUS_THRESHOLD','OVERSIZED_CONTEXT'] as const;
export type UnresolvedItem = { type: typeof ISSUE_TYPES[number]; description: string; evidence: Evidence[] };
export type CandidateRulePackage = {
  schemaVersion: 1; promptVersion: typeof PROMPT_VERSION; sourceStatus: 'REFERENCE'; reviewStatus: 'REVIEW_REQUIRED';
  announcement: { canonicalId: string; title: string; announcementDate: string };
  document: { documentId: string; sha256: string; parserVersion: string };
  candidateRules: CandidateRule[]; unresolvedItems: UnresolvedItem[];
  conflicts: { description: string; alternatives: { value: string; evidence: Evidence[] }[]; resolution: null; requiresReview: true }[];
  extractionWarnings: string[];
};
const textNormalized = (s: string) => s.replace(/\s+/gu, ' ').trim();
const member = (value: unknown, choices: readonly string[]) => { if (!choices.includes(string(value))) throw new Error('UNKNOWN_ENUM_VALUE'); };
const primitive = (v: unknown) => { if (!(typeof v === 'string' && v.length > 0 && v.length < 2000) && typeof v !== 'boolean' && !(typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER)) throw new Error('INVALID_SCALAR'); };

export function validateEvidence(raw: unknown, doc: ParsedDocument): asserts raw is Evidence {
  const e = object(raw); exact(e, ['documentId','blockId','tableId','row','column','snippet','locator']);
  if (e.documentId !== doc.documentId) throw new Error('UNKNOWN_DOCUMENT');
  let source: { text: string; sourceLocator: SourceLocator } | undefined;
  if (e.blockId !== null) {
    if (e.tableId !== null || e.row !== null || e.column !== null) throw new Error('AMBIGUOUS_EVIDENCE');
    source = doc.blocks.find(b => b.id === string(e.blockId));
  } else {
    const t = doc.tables.find(t => t.id === string(e.tableId));
    source = t?.rows[integer(e.row)]?.find(c => c.column === integer(e.column));
  }
  if (!source || !isDeepStrictEqual(e.locator, source.sourceLocator)) throw new Error('UNKNOWN_OR_CHANGED_LOCATOR');
  if (!textNormalized(source.text).includes(textNormalized(string(e.snippet, 8000)))) throw new Error('UNGROUNDED_EVIDENCE_TEXT');
}
function evidenceList(v: unknown, d: ParsedDocument) { const es = array(v, 50); if (!es.length) throw new Error('EVIDENCE_REQUIRED'); es.forEach(e => validateEvidence(e, d)); }

export function validateCandidatePackage(raw: unknown, doc: ParsedDocument, expectedAnnouncement: CandidateRulePackage['announcement']): asserts raw is CandidateRulePackage {
  validateParsedDocument(doc);
  if (!doc.quality.extractionAllowed) throw new Error('DOCUMENT_QUALITY_GATE');
  const p = object(raw); exact(p, ['schemaVersion','promptVersion','sourceStatus','reviewStatus','announcement','document','candidateRules','unresolvedItems','conflicts','extractionWarnings']);
  if (p.schemaVersion !== 1 || p.promptVersion !== PROMPT_VERSION || p.sourceStatus !== 'REFERENCE' || p.reviewStatus !== 'REVIEW_REQUIRED') throw new Error('CANDIDATE_ONLY');
  const a = object(p.announcement); exact(a, ['canonicalId','title','announcementDate']);
  if (!isDeepStrictEqual(a, expectedAnnouncement)) throw new Error('ANNOUNCEMENT_CONTEXT_MISMATCH');
  if (!/^[a-f0-9]{64}$/.test(string(a.canonicalId)) || !/^\d{4}-\d{2}-\d{2}$/.test(string(a.announcementDate)) || new Date(a.announcementDate as string).toISOString().slice(0,10) !== a.announcementDate) throw new Error('INVALID_ANNOUNCEMENT'); string(a.title);
  const d = object(p.document); exact(d, ['documentId','sha256','parserVersion']);
  if (d.documentId !== doc.documentId || d.sha256 !== doc.sha256 || d.parserVersion !== doc.parserVersion) throw new Error('DOCUMENT_VERSION_MISMATCH');
  const ids = new Set<string>(), keys = new Set<string>();
  for (const rawRule of array(p.candidateRules, 1000)) {
    const r = object(rawRule); exact(r, ['candidateRuleId','supplyType','stage','category','ruleKey','condition','score','maxScore','requiredInputs','evidence','confidence','confidenceReason','reviewStatus']);
    const id = string(r.candidateRuleId, 200), key = string(r.ruleKey, 200);
    if (ids.has(id) || keys.has(key)) throw new Error('DUPLICATE_RULE'); ids.add(id); keys.add(key);
    member(r.supplyType, SUPPLIES); member(r.stage, ['COMMON','PRIORITY','GENERAL','LOTTERY']); member(r.category, KINDS);
    member(r.confidence, ['HIGH','MEDIUM','LOW']); string(r.confidenceReason); if (r.reviewStatus !== 'REVIEW_REQUIRED') throw new Error('CANDIDATE_ONLY');
    const c = object(r.condition); exact(c, ['input','operator','value','values']); string(c.input, 200);
    member(c.operator, ['eq','neq','gt','gte','lt','lte','in','exists']); const values = array(c.values, 100); values.forEach(primitive);
    if (c.operator === 'in') { if (!values.length || c.value !== null) throw new Error('INVALID_IN_CONDITION'); }
    else if (c.operator === 'exists') { if (values.length || typeof c.value !== 'boolean') throw new Error('INVALID_EXISTS_CONDITION'); }
    else { primitive(c.value); if (values.length) throw new Error('INVALID_VALUES'); }
    if (['gt','gte','lt','lte'].includes(c.operator as string) && typeof c.value !== 'number') throw new Error('NUMERIC_THRESHOLD_REQUIRED');
    const inputs = array(r.requiredInputs, 100).map(v => string(v, 200)); if (!inputs.includes(c.input as string)) throw new Error('MISSING_REQUIRED_INPUT');
    if (r.score !== null || r.maxScore !== null) {
      if (r.category !== 'score' || integer(r.score) > integer(r.maxScore) || Number(r.maxScore) === 0 || r.supplyType === 'FIRST_TIME' || r.stage === 'LOTTERY') throw new Error('INVALID_SCORE');
    } else if (r.category === 'score') throw new Error('SCORE_REQUIRED');
    evidenceList(r.evidence, doc);
  }
  for (const issue of array(p.unresolvedItems, 1000)) { const i = object(issue); exact(i, ['type','description','evidence']); member(i.type, ISSUE_TYPES); string(i.description); evidenceList(i.evidence, doc); }
  for (const conflict of array(p.conflicts, 1000)) {
    const c = object(conflict); exact(c, ['description','alternatives','resolution','requiresReview']); string(c.description);
    if (c.resolution !== null || c.requiresReview !== true) throw new Error('CONFLICT_MUST_REMAIN_UNRESOLVED');
    const alts = array(c.alternatives, 30); if (alts.length < 2) throw new Error('CONFLICT_ALTERNATIVES_REQUIRED');
    for (const alt of alts) { const a = object(alt); exact(a, ['value','evidence']); string(a.value); evidenceList(a.evidence, doc); }
  }
  array(p.extractionWarnings, 1000).forEach(x => string(x));
}

export function blockEvidence(d: ParsedDocument, index: number): Evidence {
  const b = d.blocks[index]; if (!b) throw new Error('UNKNOWN_BLOCK');
  return { documentId: d.documentId, blockId: b.id, tableId: null, row: null, column: null, snippet: b.text.slice(0, 8000), locator: b.sourceLocator };
}
