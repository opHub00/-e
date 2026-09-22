import { useEffect, useState } from 'react';
import { getSupabaseClient } from '../../auth/supabaseClient';
import { REFERENCE_LISTING_ID, REFERENCE_RULE_SET } from '../reference';
import { StaticAssessmentRuleRepository, type AnnouncementSummary, type RuleReadResult } from './ruleRepository';
import { createSupabaseRuleRepository } from './supabaseRuleRepository';

const reference = new StaticAssessmentRuleRepository([REFERENCE_RULE_SET]);
const database = () => createSupabaseRuleRepository(getSupabaseClient());
type LoadState = RuleReadResult | { status: 'LOADING' };
export const SOURCE_LABELS = { REFERENCE: '원문 확인 전', DRAFT_SOURCE_VERIFIED: '검토본 기준', OFFICIAL_VERIFIED: '공식 공고 기준' } as const;

/** Explicit reference selection is isolated from database errors and missing registrations. */
export function useAssessmentRules(contextId: string | undefined) {
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<{ key: string; value: LoadState }>();
  const key = `${contextId ?? ''}:${attempt}`;
  useEffect(() => {
    let current = true;
    if (!contextId) return;
    const lookup = contextId.startsWith('announcement:') ? { announcementId: contextId.slice(13) } : { listingId: contextId };
    const repository = contextId === REFERENCE_LISTING_ID ? reference : database();
    void repository.getActiveRuleSet(lookup).then(value => { if (current) setSnapshot({ key, value }); });
    return () => { current = false; };
  }, [contextId, key]);
  const state: LoadState = !contextId ? { status: 'RULE_NOT_AVAILABLE' } : snapshot?.key === key ? snapshot.value : { status: 'LOADING' };
  return { state, rules: state.status === 'AVAILABLE' ? state.rules : undefined, retry: () => setAttempt(n => n + 1) };
}

export function useAssessmentCatalog() {
  const [items, setItems] = useState<AnnouncementSummary[]>([]);
  const [request, setRequest] = useState<{ after?: string; attempt: number }>({ attempt: 0 });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<'LOADING' | 'AVAILABLE' | 'ERROR'>('LOADING');
  useEffect(() => {
    let current = true;
    setStatus('LOADING');
    void database().listAnnouncements(request.after).then(result => {
      if (!current) return;
      if (result.status !== 'AVAILABLE') { setStatus('ERROR'); return; }
      setItems(previous => request.after ? [...new Map([...previous, ...result.items].map(i => [i.id, i])).values()] : result.items);
      setNextCursor(result.nextCursor); setStatus('AVAILABLE');
    });
    return () => { current = false; };
  }, [request]);
  return { items, status, nextCursor, retry: () => setRequest(r => ({ ...r, attempt: r.attempt + 1 })),
    more: () => { if (nextCursor) setRequest({ after: nextCursor, attempt: 0 }); } };
}
