export type RuleReviewTargetInput = {
  environment?: string | null;
  supabaseUrl?: string | null;
  stagingProjectRef?: string | null;
  productionProjectRef?: string | null;
};

export type RuleReviewTarget = { projectRef: string; url: string };

export function projectRefFromSupabaseUrl(value: string): string | null {
  try {
    const host = new URL(value).hostname.toLowerCase();
    const match = host.match(/^([a-z0-9]+)\.supabase\.co$/);
    return match?.[1] ?? null;
  } catch { return null; }
}

/** Remote review writes are enabled only by an explicit, exact staging identity. */
export function assertRuleReviewStagingTarget(input: RuleReviewTargetInput): RuleReviewTarget {
  const environment = input.environment?.trim().toLowerCase();
  const url = input.supabaseUrl?.trim() ?? '';
  const expected = input.stagingProjectRef?.trim().toLowerCase() ?? '';
  const production = input.productionProjectRef?.trim().toLowerCase() ?? '';
  const actual = projectRefFromSupabaseUrl(url);
  if (environment !== 'staging') throw new Error('STAGING_ENV_REQUIRED');
  if (!expected || !actual || actual !== expected) throw new Error('STAGING_PROJECT_REF_MISMATCH');
  if (production && actual === production) throw new Error('PRODUCTION_PROJECT_FORBIDDEN');
  return { projectRef: actual, url };
}

export function readPublicRuleReviewTarget(): RuleReviewTarget {
  return assertRuleReviewStagingTarget({
    environment: process.env.EXPO_PUBLIC_WANPANE_ENV,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    stagingProjectRef: process.env.EXPO_PUBLIC_SUPABASE_STAGING_PROJECT_REF,
    productionProjectRef: process.env.EXPO_PUBLIC_SUPABASE_PRODUCTION_PROJECT_REF,
  });
}
