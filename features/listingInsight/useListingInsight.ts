import { useEffect, useMemo, useState } from 'react';
import { useUserStore } from '../../store/useUserStore';
import { getSupabaseClient } from '../auth/supabaseClient';
import { assessApplication } from '../applicationAssessment/engine';
import { createSupabaseRuleRepository } from '../applicationAssessment/data/supabaseRuleRepository';
import { assessmentDetails } from '../applicationAssessment/questionnaire/adapter';
import { buildQuestionnaire } from '../applicationAssessment/questionnaire/questions';
import { readDraft } from '../applicationAssessment/questionnaire/draft';
import type { AnnouncementRules, ApplicationAssessmentResult } from '../applicationAssessment/types';
import type { ApplicantProfileV2 } from '../profile/domain';
import { buildListingInsight, pickPrimaryInsight, type ListingInsight } from './domain';
import { ListingRuleCache, type RuleLookupResult } from './ruleCache';

/**
 * 공고 카드·상세에서 쓰는 개인 분석.
 *
 * 규칙 조회는 화면에 보이는 카드에 대해서만, listing 당 한 번만 한다(ListingRuleCache).
 * 판정 자체는 이미 저장된 프로필과 이 기기의 질문지 임시 답변으로 로컬에서 계산하므로
 * 추가 요청이 없다. 규칙이 연결되지 않은 공고는 조용히 아무것도 표시하지 않는다.
 */
const lookup = async (listingId: string): Promise<RuleLookupResult> => {
  const client = getSupabaseClient();
  if (!client) return { status: 'NONE' };
  const result = await createSupabaseRuleRepository(client).getActiveRuleSet({ listingId });
  return result.status === 'AVAILABLE' ? { status: 'AVAILABLE', rules: result.rules } : { status: 'NONE' };
};

/** 화면 전체가 공유하는 캐시. 카드가 다시 렌더돼도 같은 listing 을 다시 묻지 않는다. */
export const listingRuleCache = new ListingRuleCache(lookup);

/** 저장된 프로필 + 이 기기의 임시 답변으로 공급유형별 판정을 돌린다. 서버 호출은 없다. */
export function assessWithSavedAnswers(rules: AnnouncementRules, profile: ApplicantProfileV2, listingId: string): ApplicationAssessmentResult[] {
  const out: ApplicationAssessmentResult[] = [];
  for (const supply of rules.supplies) {
    const draft = readDraft(listingId, supply.type);
    const answers = draft?.answers ?? {};
    const questions = buildQuestionnaire({ rules, supply: supply.type, profile, answers, announcementDate: rules.announcementDate });
    const bounds = rules.announcementDate ? { notAfter: rules.announcementDate } : undefined;
    const { details } = assessmentDetails(questions, answers, supply.type, bounds);
    const result = assessApplication(rules, { profile, details }, listingId).find(item => item.supplyType === supply.type);
    if (result) out.push(result);
  }
  return out;
}

export type ListingInsightState =
  | { phase: 'IDLE' }
  | { phase: 'LOADING' }
  | { phase: 'NONE' }
  | { phase: 'READY'; insight: ListingInsight; all: ListingInsight[] };

/**
 * @param enabled 카드가 실제로 화면에 보일 때만 true 로 넘긴다. 목록 전체를 미리 부르지 않기 위한 장치다.
 * @param provided 화면이 이미 규칙을 들고 있으면 넘긴다(상세 화면). 그러면 같은 listing 을 다시 묻지 않는다.
 */
export function useListingInsight(listingId: string | undefined, enabled: boolean, provided?: AnnouncementRules | undefined): ListingInsightState {
  const profile = useUserStore(s => s.applicantProfile);
  const hydrated = useUserStore(s => s.profileHydrated);
  const [fetched, setFetched] = useState<{ listingId: string; value: RuleLookupResult } | null>(null);

  useEffect(() => {
    if (!enabled || !listingId || provided) return;
    const cached = listingRuleCache.peek(listingId);
    if (cached) { setFetched({ listingId, value: cached }); return; }
    let current = true;
    void listingRuleCache.get(listingId).then(value => { if (current) setFetched({ listingId, value }); });
    return () => { current = false; };
  }, [enabled, listingId, provided]);

  return useMemo(() => {
    if (!enabled || !listingId) return { phase: 'IDLE' };
    const rules = provided ?? (fetched?.listingId === listingId && fetched.value.status === 'AVAILABLE' ? fetched.value.rules : undefined);
    if (!rules) {
      if (!hydrated) return { phase: 'LOADING' };
      if (provided === undefined && (!fetched || fetched.listingId !== listingId)) return { phase: 'LOADING' };
      return { phase: 'NONE' };
    }
    if (!hydrated) return { phase: 'LOADING' };
    const results = assessWithSavedAnswers(rules, profile, listingId);
    const primary = pickPrimaryInsight(results);
    return primary ? { phase: 'READY', insight: primary, all: results.map(buildListingInsight) } : { phase: 'NONE' };
  }, [enabled, listingId, hydrated, fetched, provided, profile]);
}
