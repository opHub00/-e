import { getSupabaseClient } from '../auth/supabaseClient.ts';
import { createScoringRepository } from './adapter.ts';
import { SupabaseScoringFormulaRepository, type ScoringFormulaRepository } from './repository.ts';

let remote: ScoringFormulaRepository | null = null;

/** Browser composition root. Domain/adapter tests do not import Supabase or React Native. */
export function createConfiguredScoringRepository(): ScoringFormulaRepository {
  return createScoringRepository(() => {
    const client = getSupabaseClient();
    if (!client) throw new Error('SCORING_REPOSITORY_UNAVAILABLE');
    return remote ??= new SupabaseScoringFormulaRepository(client);
  });
}
