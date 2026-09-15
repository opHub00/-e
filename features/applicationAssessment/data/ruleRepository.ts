import type { AnnouncementRules, RuleSourceStatus } from '../types.ts';

export type RuleLookup = { announcementId: string; listingId?: never } | { listingId: string; announcementId?: never };
export type RuleReadResult =
  | { status: 'AVAILABLE'; rules: AnnouncementRules }
  | { status: 'RULE_NOT_AVAILABLE' | 'SERVICE_UNAVAILABLE' | 'INVALID_RULE_SET' | 'UNSUPPORTED_SCHEMA' };
export type AnnouncementSummary = { id: string; title: string; sourceStatus: RuleSourceStatus };
export type CatalogResult = { status: 'AVAILABLE'; items: AnnouncementSummary[]; nextCursor: string | null }
  | { status: 'SERVICE_UNAVAILABLE' | 'INVALID_RULE_SET' };
export interface AssessmentRuleRepository {
  getActiveRuleSet(lookup: RuleLookup): Promise<RuleReadResult>;
  listAnnouncements(after?: string): Promise<CatalogResult>;
}

export class StaticAssessmentRuleRepository implements AssessmentRuleRepository {
  private readonly rules: AnnouncementRules[];
  constructor(rules: readonly AnnouncementRules[]) { this.rules = structuredClone([...rules]); }
  async getActiveRuleSet(lookup: RuleLookup): Promise<RuleReadResult> {
    const rules = this.rules.find(r => lookup.listingId !== undefined ? r.listingId === lookup.listingId : (r.provenance?.announcementId ?? r.id) === lookup.announcementId);
    return rules ? { status: 'AVAILABLE', rules: structuredClone(rules) } : { status: 'RULE_NOT_AVAILABLE' };
  }
  async listAnnouncements(): Promise<CatalogResult> {
    return { status: 'AVAILABLE', items: this.rules.map(r => ({ id: r.provenance?.announcementId ?? r.id, title: r.title, sourceStatus: r.sourceStatus ?? 'REFERENCE' })), nextCursor: null };
  }
}
