import type { SupabaseClient } from '@supabase/supabase-js';
import { DatabaseAssessmentRuleRepository } from './databaseRuleRepository.ts';

export function createSupabaseRuleRepository(client: SupabaseClient | null) {
  async function rpc(name: string, args: Record<string, unknown>) {
    if (!client) throw new Error('Supabase is not configured');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const { data, error } = await client.rpc(name, args).abortSignal(controller.signal);
      if (error) throw error;
      return data;
    } finally { clearTimeout(timeout); }
  }
  return new DatabaseAssessmentRuleRepository({
    async read(lookup) {
      return rpc('read_assessment_rule_set', {
        p_announcement_id: lookup.announcementId ?? null, p_listing_id: lookup.listingId ?? null,
      });
    },
    async catalog(after) {
      return rpc('list_assessment_announcements', { p_after: after ?? null });
    },
  });
}
