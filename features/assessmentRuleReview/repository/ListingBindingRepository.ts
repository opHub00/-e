/**
 * Listing ↔ announcement binding operations. The server authorizes every call
 * (admin for changes, reviewer or admin for reading), checks the rule set, the
 * listing identity and the revision, and writes the audit trail. This client
 * only calls the RPCs and decodes their answers; it never decides who may bind.
 */
type RpcResult = { data: unknown; error: { message?: string; code?: string } | null };
export type ListingBindingRpcClient = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<RpcResult> };

export type BindingAnnouncement = {
  announcementId: string; title: string; activeRuleSetId: string; activeVersion: string; sourceStatus: string; listingIds: string[];
};
export type ListingBinding = {
  listingId: string; announcementId: string; announcementTitle: string;
  boundRuleSetId: string | null; activeRuleSetId: string | null; revision: number; updatedAt: string;
};
export type BindingAuditEntry = {
  id: number; action: 'BIND' | 'REBIND' | 'UNBIND'; actorRole: string; listingId: string;
  previousAnnouncementId: string | null; previousRuleSetId: string | null; newAnnouncementId: string | null; newRuleSetId: string | null;
  previousRevision: number | null; newRevision: number | null; reason: string; createdAt: string;
};
export type ListingBindingState = { role: 'reviewer' | 'admin'; announcements: BindingAnnouncement[]; bindings: ListingBinding[]; audit: BindingAuditEntry[] };
export type BindingMutation =
  | { status: 'BIND' | 'REBIND' | 'NO_CHANGE' | 'UNBIND'; listingId: string; revision: number | null }
  | { status: 'FAILED'; code: string };

/** Server refusal codes, in the words an operator acts on. */
export const BINDING_ERROR_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: '로그인이 필요해요.',
  FORBIDDEN: '관리자만 연결을 바꿀 수 있어요.',
  REASON_REQUIRED: '변경 사유를 적어 주세요.',
  UNKNOWN_LISTING: '어느 공고에도 속하지 않는 listing이에요.',
  UNKNOWN_RULE_SET: '존재하지 않는 규칙 버전이에요.',
  RULE_SET_NOT_ACTIVE: '활성화·승인된 규칙 버전에만 연결할 수 있어요.',
  ANNOUNCEMENT_MISMATCH: '이 listing은 다른 공고의 것이에요. 공고가 맞지 않아 거부했어요.',
  STALE_BINDING_REVISION: '다른 관리자가 먼저 바꿨어요. 새로 불러온 뒤 다시 시도해 주세요.',
  UNKNOWN_BINDING: '해제할 연결이 없어요.',
  EXPECTED_REVISION_REQUIRED: '현재 연결 상태를 먼저 불러와 주세요.',
  INVALID_RESPONSE: '서버 응답을 확인할 수 없어 아무것도 바꾸지 않았어요.',
  NETWORK: '서버에 연결하지 못했어요. 연결 상태는 바뀌지 않았어요.',
};
export const bindingErrorMessage = (code: string) => BINDING_ERROR_MESSAGES[code] ?? `요청이 거부됐어요 (${code}).`;

const fail = (): never => { throw new Error('INVALID_RESPONSE'); };
const obj = (v: unknown) => (typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : fail());
const str = (v: unknown) => (typeof v === 'string' ? v : fail());
const optStr = (v: unknown) => (v === null ? null : str(v));
const int = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) ? v : fail());
const optInt = (v: unknown) => (v === null ? null : int(v));
const arr = (v: unknown) => (Array.isArray(v) ? v : fail());

export function decodeListingBindingState(raw: unknown): ListingBindingState {
  const root = obj(raw);
  const role = root.role === 'admin' || root.role === 'reviewer' ? root.role : fail();
  return {
    role,
    announcements: arr(root.announcements).map(value => {
      const a = obj(value);
      return { announcementId: str(a.announcementId), title: str(a.title), activeRuleSetId: str(a.activeRuleSetId),
        activeVersion: str(a.activeVersion), sourceStatus: str(a.sourceStatus), listingIds: arr(a.listingIds).map(str) };
    }),
    bindings: arr(root.bindings).map(value => {
      const b = obj(value);
      return { listingId: str(b.listingId), announcementId: str(b.announcementId), announcementTitle: str(b.announcementTitle),
        boundRuleSetId: optStr(b.boundRuleSetId), activeRuleSetId: optStr(b.activeRuleSetId), revision: int(b.revision), updatedAt: str(b.updatedAt) };
    }),
    audit: arr(root.audit).map(value => {
      const e = obj(value);
      const action = e.action === 'BIND' || e.action === 'REBIND' || e.action === 'UNBIND' ? e.action : fail();
      return { id: int(e.id), action, actorRole: str(e.actor_role), listingId: str(e.listing_id),
        previousAnnouncementId: optStr(e.previous_announcement_id), previousRuleSetId: optStr(e.previous_rule_set_id),
        newAnnouncementId: optStr(e.new_announcement_id), newRuleSetId: optStr(e.new_rule_set_id),
        previousRevision: optInt(e.previous_revision), newRevision: optInt(e.new_revision), reason: str(e.reason), createdAt: str(e.created_at) };
    }),
  };
}

const codeOf = (error: { message?: string; code?: string }) => {
  const message = error.message?.trim() ?? '';
  return /^[A-Z][A-Z_]+$/.test(message) ? message : error.code === '42501' ? 'FORBIDDEN' : 'NETWORK';
};

function decodeMutation(raw: unknown): BindingMutation {
  const r = obj(raw);
  const status = ['BIND', 'REBIND', 'NO_CHANGE', 'UNBIND'].includes(String(r.status)) ? r.status as 'BIND' : fail();
  return { status, listingId: str(r.listingId), revision: r.revision === undefined ? null : optInt(r.revision) };
}

export class SupabaseListingBindingRepository {
  private readonly client: ListingBindingRpcClient;
  constructor(client: ListingBindingRpcClient) { this.client = client; }

  async load(): Promise<{ status: 'READY'; state: ListingBindingState } | { status: 'FAILED'; code: string }> {
    try {
      const { data, error } = await this.client.rpc('load_assessment_listing_bindings');
      if (error) return { status: 'FAILED', code: codeOf(error) };
      return { status: 'READY', state: decodeListingBindingState(data) };
    } catch (error) {
      return { status: 'FAILED', code: error instanceof Error && error.message === 'INVALID_RESPONSE' ? 'INVALID_RESPONSE' : 'NETWORK' };
    }
  }

  bind(input: { listingId: string; ruleSetId: string; expectedRevision: number; reason: string }): Promise<BindingMutation> {
    return this.mutate('bind_listing_to_assessment_rule_set', { p_listing_id: input.listingId, p_rule_set_id: input.ruleSetId,
      p_expected_revision: input.expectedRevision, p_reason: input.reason });
  }

  unbind(input: { listingId: string; expectedRevision: number; reason: string }): Promise<BindingMutation> {
    return this.mutate('unbind_listing_from_assessment_rule_set', { p_listing_id: input.listingId,
      p_expected_revision: input.expectedRevision, p_reason: input.reason });
  }

  private async mutate(fn: string, args: Record<string, unknown>): Promise<BindingMutation> {
    try {
      const { data, error } = await this.client.rpc(fn, args);
      if (error) return { status: 'FAILED', code: codeOf(error) };
      return decodeMutation(data);
    } catch (error) {
      return { status: 'FAILED', code: error instanceof Error && error.message === 'INVALID_RESPONSE' ? 'INVALID_RESPONSE' : 'NETWORK' };
    }
  }
}
