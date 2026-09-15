import type { AnnouncementRules } from '../types.ts';
import { decodeRuleSet } from '../data/ruleCodec.ts';
import { object, string, uuid } from '../data/validation.ts';
import { validateImportPackage } from './importPackage.ts';

export type TrustedRpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
export function createRuleLifecycle(rpc: TrustedRpc) {
  async function review(ruleSetId: string) {
    uuid(ruleSetId);
    const response = object(await rpc('get_assessment_review_snapshot', { p_rule_set_id: ruleSetId }));
    const snapshot = object(response.snapshot), set = object(snapshot.rule_set);
    if (set.id !== ruleSetId) throw new Error('Review identity mismatch');
    const announcementId = uuid(set.announcement_id);
    const decoded = decodeRuleSet({ ...snapshot, rule_set: { ...set, is_active: true, is_public: true, approved_at: '2000-01-01T00:00:00Z' } }, { announcementId });
    if (decoded.status !== 'AVAILABLE') throw new Error(`Stored rules cannot be reviewed: ${decoded.status}`);
    return { snapshot, fingerprint: string(response.fingerprint), rules: decoded.rules };
  }
  return {
    async import(raw: unknown) {
      const validated = validateImportPackage(raw); // All config validation before the first write.
      const response = await rpc('import_assessment_rule_package', { p_package: validated.package });
      return { receipt: response, expectedRules: validated.rules };
    },
    review,
    async approve(ruleSetId: string, fingerprint: string, reviewer: string) {
      const current = await review(ruleSetId);
      if (current.fingerprint !== fingerprint) throw new Error('Review is stale; inspect the new snapshot');
      return rpc('approve_assessment_rule_set', { p_rule_set_id: ruleSetId, p_fingerprint: string(fingerprint), p_reviewer: string(reviewer) });
    },
    async activate(ruleSetId: string, expectedActiveId: string | null) {
      uuid(ruleSetId); if (expectedActiveId !== null) uuid(expectedActiveId);
      await review(ruleSetId); // Refuse malformed stored versions before requesting activation.
      return rpc('activate_assessment_rule_set', { p_rule_set_id: ruleSetId, p_expected_active_id: expectedActiveId });
    },
  };
}

/** Compare content independently of approval/visibility flags and generated row UUIDs. */
export function ruleSemantics(rules: AnnouncementRules) {
  return { title: rules.title, version: rules.version, sourceStatus: rules.sourceStatus, announcementDate: rules.announcementDate,
    parameters: rules.parameters, supplies: rules.supplies, provenance: rules.provenance };
}
