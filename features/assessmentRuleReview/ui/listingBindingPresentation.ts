import type { ListingBindingState } from '../repository/ListingBindingRepository.ts';

export type BindingRowStatus = 'BOUND' | 'UNBOUND' | 'STALE_VERSION' | 'WRONG_ANNOUNCEMENT' | 'UNKNOWN_LISTING';
export type BindingAction = { kind: 'BIND' | 'REBIND' | 'UNBIND'; label: string; ruleSetId: string | null; expectedRevision: number };
export type BindingRow = {
  listingId: string;
  status: BindingRowStatus;
  statusLabel: string;
  /** The announcement this listing belongs to, derived by the server from the announcement's source identity. */
  ownerTitle: string | null;
  boundTitle: string | null;
  activeVersion: string | null;
  /** The announcement's active rule set, so the review console can be opened for it. Never auto-selected. */
  activeRuleSetId: string | null;
  revision: number | null;
  actions: BindingAction[];
};

const STATUS_LABEL: Record<BindingRowStatus, string> = {
  BOUND: '연결됨 · 활성 버전 사용 중',
  UNBOUND: '연결 안 됨 · 상담은 준비 중으로 표시',
  STALE_VERSION: '연결됨 · 연결 당시 버전과 현재 활성 버전이 달라요',
  WRONG_ANNOUNCEMENT: '다른 공고에 잘못 연결돼 있어요',
  UNKNOWN_LISTING: '어느 공고의 listing인지 확인되지 않아요',
};

/**
 * One row per canonical listing, plus any stored binding the server can no longer place.
 * Actions are offered only to admins, and only the ones the server would accept for that state.
 * The server still re-checks everything; hiding a button is convenience, not authorization.
 */
export function buildBindingRows(state: ListingBindingState): BindingRow[] {
  const admin = state.role === 'admin';
  const rows: BindingRow[] = [];
  const bindingOf = new Map(state.bindings.map(b => [b.listingId, b]));
  const placed = new Set<string>();
  for (const announcement of state.announcements) {
    for (const listingId of announcement.listingIds) {
      placed.add(listingId);
      const binding = bindingOf.get(listingId);
      const status: BindingRowStatus = !binding ? 'UNBOUND'
        : binding.announcementId !== announcement.announcementId ? 'WRONG_ANNOUNCEMENT'
          : binding.boundRuleSetId !== announcement.activeRuleSetId ? 'STALE_VERSION' : 'BOUND';
      const actions: BindingAction[] = !admin ? []
        : status === 'UNBOUND' ? [{ kind: 'BIND', label: '이 공고의 활성 버전에 연결', ruleSetId: announcement.activeRuleSetId, expectedRevision: 0 }]
          : status === 'BOUND' ? [{ kind: 'UNBIND', label: '연결 해제', ruleSetId: null, expectedRevision: binding!.revision }]
            : [
              { kind: 'REBIND', label: '이 공고의 활성 버전으로 교체', ruleSetId: announcement.activeRuleSetId, expectedRevision: binding!.revision },
              { kind: 'UNBIND', label: '연결 해제', ruleSetId: null, expectedRevision: binding!.revision },
            ];
      rows.push({ listingId, status, statusLabel: STATUS_LABEL[status], ownerTitle: announcement.title,
        boundTitle: binding?.announcementTitle ?? null, activeVersion: announcement.activeVersion, activeRuleSetId: announcement.activeRuleSetId,
        revision: binding?.revision ?? null, actions });
    }
  }
  for (const binding of state.bindings) {
    if (placed.has(binding.listingId)) continue;
    rows.push({ listingId: binding.listingId, status: 'UNKNOWN_LISTING', statusLabel: STATUS_LABEL.UNKNOWN_LISTING, ownerTitle: null,
      boundTitle: binding.announcementTitle, activeVersion: null, activeRuleSetId: null, revision: binding.revision,
      actions: admin ? [{ kind: 'UNBIND', label: '연결 해제', ruleSetId: null, expectedRevision: binding.revision }] : [] });
  }
  return rows;
}

export const AUDIT_ACTION_LABEL = { BIND: '연결', REBIND: '교체', UNBIND: '해제' } as const;
