import type { AnnouncementRules, ConditionRule, ScoreRule, Scalar, SupplyType, Stage } from '../types.ts';
import type { RuleLookup, RuleReadResult } from './ruleRepository.ts';
import * as v from './validation.ts';

/** Wire schema 1 stores each condition/score separately. Layout is a completeness manifest. */
export function decodeRuleSet(payload: unknown, lookup: RuleLookup): RuleReadResult {
  if (payload === null) return { status: 'RULE_NOT_AVAILABLE' };
  try {
    if (JSON.stringify(payload).length > 2_000_000) throw new Error('payload too large');
    const p = v.object(payload), set = v.object(p.rule_set);
    if (set.schema_version !== 1) return { status: 'UNSUPPORTED_SCHEMA' };
    if (set.is_active !== true || set.is_public !== true || typeof set.approved_at !== 'string') return { status: 'RULE_NOT_AVAILABLE' };
    const announcementId = v.uuid(set.announcement_id), id = v.uuid(set.id);
    if (lookup.announcementId !== undefined && lookup.announcementId !== announcementId) throw new Error('announcement mismatch');
    const listingId = v.string(p.listing_id);
    if (lookup.listingId !== undefined && lookup.listingId !== listingId) throw new Error('listing mismatch');
    const status = v.sourceStatus(set.source_status);
    const documentId = set.document_id === null ? null : v.uuid(set.document_id);
    if (status !== 'REFERENCE' && documentId === null) throw new Error('missing document');
    const announcementDate = set.effective_date === null ? null : v.date(set.effective_date);
    if (status !== 'REFERENCE' && announcementDate === null) throw new Error('missing effective date');
    const config = v.object(set.config);
    if (Object.keys(config).some(k => !['parameters', 'supplies'].includes(k))) throw new Error('unknown set config');
    const parameters = Object.fromEntries(Object.entries(v.object(config.parameters)).map(([key, value]) => [key, value === null ? null : v.scalar(value)])) as Record<string, Scalar | null>;
    const rows = v.array(p.rules).map(v.object);
    const byKey = new Map(rows.map(row => [v.string(row.rule_key), row]));
    if (byKey.size !== rows.length) throw new Error('duplicate rules');
    const used = new Set<string>();
    const evidenceById = new Map<string, string>();
    function read(keyValue: unknown, supply: string, stage: string | null, category: string) {
      const key = v.string(keyValue), row = byKey.get(key);
      if (!row || used.has(key) || row.rule_set_id !== id || row.supply_type !== supply || row.stage !== stage || row.category !== category) throw new Error('rule manifest mismatch');
      used.add(key);
      const evidences = v.array(row.evidence);
      if (evidences.length !== 1) throw new Error('schema 1 requires one evidence per rule');
      const ev = v.evidence(evidences[0], documentId);
      const fingerprint = JSON.stringify(ev);
      if (evidenceById.has(ev.id) && evidenceById.get(ev.id) !== fingerprint) throw new Error('conflicting evidence identity');
      evidenceById.set(ev.id, fingerprint);
      return category === 'SCORE' ? v.score(key, row.config, ev) : v.condition(key, row.config, ev, parameters);
    }
    const types = new Set<string>();
    const supplies = v.array(config.supplies).map(raw => {
      const s = v.object(raw), type = v.string(s.type);
      if (Object.keys(s).some(k => !['type', 'eligibility', 'stages'].includes(k))) throw new Error('unknown supply config');
      if (!['youth', 'newlywed', 'firstHome'].includes(type) || types.has(type)) throw new Error('unsupported/duplicate supply');
      types.add(type);
      const eligibility = v.array(s.eligibility).map(key => read(key, type, null, 'ELIGIBILITY') as ConditionRule);
      if (!eligibility.length) throw new Error('empty eligibility');
      let last = -1;
      const stages = v.array(s.stages).map(rawStage => {
        const st = v.object(rawStage), stage = v.string(st.stage);
        if (Object.keys(st).some(k => !['stage', 'conditions', 'scores'].includes(k))) throw new Error('unknown stage config');
        const order = ['PRIORITY', 'GENERAL', 'LOTTERY'].indexOf(stage);
        if (order <= last) throw new Error('stage order');
        last = order;
        const conditions = v.array(st.conditions).map(key => read(key, type, stage, 'STAGE') as ConditionRule);
        const scores = st.scores === null ? null : v.array(st.scores).map(key => read(key, type, stage, 'SCORE') as ScoreRule);
        if (scores?.length === 0 || ((type === 'firstHome' || stage === 'LOTTERY') && scores !== null)) throw new Error('invalid scoring mode');
        return { stage: stage as Stage, conditions, scores };
      });
      if (!stages.length) throw new Error('empty stages');
      return { type: type as SupplyType, eligibility, stages };
    });
    if (!supplies.length || used.size !== rows.length) throw new Error('unused or absent rules');
    return { status: 'AVAILABLE', rules: { id, version: v.string(set.version), listingId, title: v.string(p.title),
      verification: status === 'REFERENCE' ? 'REFERENCE_ONLY' : 'VERIFIED', sourceStatus: status,
      provenance: { announcementId, documentId, schemaVersion: 1 }, announcementDate, parameters, supplies } };
  } catch { return { status: 'INVALID_RULE_SET' }; }
}

/** Offline import payload only: never approves, activates, publishes, or infers provenance. */
export function serializeRuleSet(rules: AnnouncementRules, ids: { announcementId: string; ruleSetId: string; documentId: string | null }) {
  v.uuid(ids.announcementId); v.uuid(ids.ruleSetId); if (ids.documentId !== null) v.uuid(ids.documentId);
  const rows: Record<string, unknown>[] = [];
  const put = (rule: ConditionRule | ScoreRule, type: string, stage: string | null, category: string) => {
    const { id, evidence: e, ...config } = rule;
    rows.push({ rule_key: id, rule_set_id: ids.ruleSetId, supply_type: type, stage, category, config,
      evidence: [{ evidence_key: e.id, document_id: ids.documentId, source: e.source, section: e.section,
        evidence_label: e.label, source_url: e.url ?? null, page_number: e.page ?? null,
        table_label: e.tableLabel ?? null, text_excerpt: e.textExcerpt ?? null, locator: e.locator ?? {} }] });
    return id;
  };
  const supplies = rules.supplies.map(s => ({ type: s.type, eligibility: s.eligibility.map(r => put(r, s.type, null, 'ELIGIBILITY')),
    stages: s.stages.map(st => ({ stage: st.stage, conditions: st.conditions.map(r => put(r, s.type, st.stage, 'STAGE')),
      scores: st.scores?.map(r => put(r, s.type, st.stage, 'SCORE')) ?? null })) }));
  return { title: rules.title, listing_id: rules.listingId, rule_set: { id: ids.ruleSetId, announcement_id: ids.announcementId,
    document_id: ids.documentId, version: rules.version, source_status: rules.sourceStatus ?? 'REFERENCE', schema_version: 1,
    effective_date: rules.announcementDate, is_active: false, is_public: false, approved_at: null, config: { parameters: rules.parameters, supplies } }, rules: rows };
}
