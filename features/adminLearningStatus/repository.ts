import { buildReviewSummary } from '../assessmentRuleReview/server/dto.ts';
import { normalizeReviewDbError, type SupabaseErrorLike } from '../assessmentRuleReview/repository/reviewDbErrorCodes.ts';
import type { AnnouncementRecord, LearningStatusInput, ReviewObservation, VisibleBinding, VisibleRuleSet } from './domain.ts';

/**
 * 학습 현황 화면의 읽기 전용 데이터 수집.
 *
 * 새 테이블도 새 RPC 도 만들지 않는다. 이미 있는 것만 쓴다:
 *  - announcements / assessment_rule_sets / announcement_listing_bindings 는 RLS 가 허용하는 select
 *  - 검수 상태는 reviewer·admin 전용 load_assessment_rule_review_workspace RPC
 * 쓰기는 한 곳도 호출하지 않는다.
 */
type QueryResult = { data: unknown; error: SupabaseErrorLike | null };
type QueryBuilder = { select: (columns: string) => PromiseLike<QueryResult> };
export type LearningStatusClient = {
  from: (table: string) => QueryBuilder;
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<QueryResult>;
};

export type LearningStatusAccess = { role: 'reviewer' | 'admin' | null };
export type LearningStatusLoad =
  | { status: 'READY'; role: 'reviewer' | 'admin'; input: LearningStatusInput }
  | { status: 'FAILED'; code: string };

const rows = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null) : []);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const optText = (value: unknown): string | null => (typeof value === 'string' && value.length ? value : null);

const toAnnouncement = (row: Record<string, unknown>): AnnouncementRecord => ({
  id: text(row.id),
  title: text(row.title),
  source: text(row.source),
  publisher: optText(row.publisher),
  announcementDate: optText(row.announcement_date),
  regionName: optText(row.region_name),
  updatedAt: text(row.updated_at) || text(row.created_at),
  createdAt: text(row.created_at),
});

const SOURCE_STATUSES = new Set(['REFERENCE', 'DRAFT_SOURCE_VERIFIED', 'OFFICIAL_VERIFIED']);
const toRuleSet = (row: Record<string, unknown>): VisibleRuleSet => ({
  id: text(row.id),
  announcementId: text(row.announcement_id),
  version: text(row.version),
  sourceStatus: (SOURCE_STATUSES.has(text(row.source_status)) ? text(row.source_status) : 'REFERENCE') as VisibleRuleSet['sourceStatus'],
  approvedAt: optText(row.approved_at),
  effectiveDate: optText(row.effective_date),
  isActive: row.is_active === true,
});

const toBinding = (row: Record<string, unknown>): VisibleBinding => ({
  listingId: text(row.listing_id),
  announcementId: text(row.announcement_id),
  boundRuleSetId: optText(row.bound_rule_set_id),
  updatedAt: text(row.updated_at),
});

export class LearningStatusRepository {
  private readonly client: LearningStatusClient;
  constructor(client: LearningStatusClient) { this.client = client; }

  /** 이 화면은 reviewer·admin 전용이다. 권한 판단은 서버 RPC 가 한다. */
  async access(): Promise<LearningStatusAccess> {
    const { data, error } = await this.client.rpc('get_assessment_review_access');
    if (error) throw new Error(normalizeReviewDbError(error));
    const role = typeof data === 'object' && data ? (data as { role?: unknown }).role : null;
    return { role: role === 'admin' || role === 'reviewer' ? role : null };
  }

  async load(): Promise<LearningStatusLoad> {
    let role: 'reviewer' | 'admin' | null = null;
    try {
      role = (await this.access()).role;
    } catch (error) {
      return { status: 'FAILED', code: error instanceof Error ? error.message : 'REVIEW_CONNECTION_REQUIRED' };
    }
    if (!role) return { status: 'FAILED', code: 'FORBIDDEN' };

    const announcements = await this.client.from('announcements').select('id,title,source,publisher,announcement_date,region_name,status,created_at,updated_at');
    if (announcements.error) return { status: 'FAILED', code: normalizeReviewDbError(announcements.error) };
    const ruleSets = await this.client.from('assessment_rule_sets').select('id,announcement_id,version,source_status,approved_at,effective_date,is_active');
    if (ruleSets.error) return { status: 'FAILED', code: normalizeReviewDbError(ruleSets.error) };
    const bindings = await this.client.from('announcement_listing_bindings').select('listing_id,announcement_id,bound_rule_set_id,updated_at');
    if (bindings.error) return { status: 'FAILED', code: normalizeReviewDbError(bindings.error) };

    const visibleRuleSets = rows(ruleSets.data).map(toRuleSet).filter(set => set.id && set.announcementId);
    const reviews: ReviewObservation[] = [];
    // 검수 상태는 rule set 단위 RPC 로만 온다. 한 건이 실패해도 화면 전체를 막지 않는다.
    for (const set of visibleRuleSets.filter(item => item.isActive)) {
      reviews.push(await this.review(set.id));
    }
    return {
      status: 'READY',
      role,
      input: {
        announcements: rows(announcements.data).map(toAnnouncement).filter(item => item.id),
        ruleSets: visibleRuleSets,
        bindings: rows(bindings.data).map(toBinding).filter(item => item.listingId && item.announcementId),
        reviews,
      },
    };
  }

  private async review(ruleSetId: string): Promise<ReviewObservation> {
    try {
      const { data, error } = await this.client.rpc('load_assessment_rule_review_workspace', { p_rule_set_id: ruleSetId });
      if (error) return { ruleSetId, observable: false, reason: normalizeReviewDbError(error) };
      if (!data || typeof data !== 'object' || !Array.isArray((data as { rules?: unknown }).rules)) {
        return { ruleSetId, observable: false, reason: 'RULE_REVIEW_WORKSPACE_NOT_FOUND' };
      }
      const workspace = data as Parameters<typeof buildReviewSummary>[0];
      const summary = buildReviewSummary(workspace);
      return {
        ruleSetId,
        observable: true,
        totalRules: summary.totalRules,
        approved: summary.approved,
        edited: summary.edited,
        pending: summary.pending,
        held: summary.held,
        rejected: summary.rejected,
        lifecycleStatus: summary.ruleVersion.lifecycleStatus,
        documentChanged: workspace.reviewedDocumentHash !== workspace.currentDocumentHash,
      };
    } catch (error) {
      return { ruleSetId, observable: false, reason: error instanceof Error ? error.message : 'RULE_REVIEW_WORKSPACE_NOT_FOUND' };
    }
  }
}
