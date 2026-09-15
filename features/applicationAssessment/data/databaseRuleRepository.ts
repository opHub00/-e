import { decodeRuleSet } from './ruleCodec.ts';
import type { AssessmentRuleRepository, CatalogResult, RuleLookup, RuleReadResult } from './ruleRepository.ts';
import * as v from './validation.ts';

/** Transport injection keeps all unit tests independent of Supabase and React Native. */
export type RuleDatabaseTransport = {
  read: (lookup: RuleLookup) => Promise<unknown>;
  catalog: (after?: string) => Promise<unknown>;
};
export class DatabaseAssessmentRuleRepository implements AssessmentRuleRepository {
  private readonly transport: RuleDatabaseTransport;
  constructor(transport: RuleDatabaseTransport) { this.transport = transport; }
  async getActiveRuleSet(lookup: RuleLookup): Promise<RuleReadResult> {
    try {
      if (lookup.announcementId !== undefined) v.uuid(lookup.announcementId);
      else v.string(lookup.listingId);
    } catch { return { status: 'RULE_NOT_AVAILABLE' }; }
    try { return decodeRuleSet(await this.transport.read(lookup), lookup); }
    catch { return { status: 'SERVICE_UNAVAILABLE' }; }
  }
  async listAnnouncements(after?: string): Promise<CatalogResult> {
    let raw: unknown;
    try { raw = await this.transport.catalog(after); } catch { return { status: 'SERVICE_UNAVAILABLE' }; }
    try {
      const items = v.array(raw).map(value => {
        const row = v.object(value);
        return { id: v.uuid(row.id), title: v.string(row.title), sourceStatus: v.sourceStatus(row.source_status) };
      });
      if (items.length > 51 || new Set(items.map(i => i.id)).size !== items.length) throw new Error('catalog');
      return { status: 'AVAILABLE', items: items.slice(0, 50), nextCursor: items.length > 50 ? items[49].id : null };
    } catch { return { status: 'INVALID_RULE_SET' }; }
  }
}
