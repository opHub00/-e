/**
 * Runtime guard for the Supabase project a web bundle talks to.
 *
 * A staging bundle must point at its declared staging project and never at production. A production
 * bundle must point at its declared production project, and the build keeps the staging ref out of it
 * entirely. When the check fails the app gets no Supabase target at all: it fails closed instead of
 * reading or writing the wrong project. Local development and test bundles are unchanged.
 */
export type SupabaseTargetInput = {
  environment?: string | null;
  supabaseUrl?: string | null;
  stagingProjectRef?: string | null;
  productionProjectRef?: string | null;
};
export type SupabaseTargetCheck =
  | { ok: true; environment: string; projectRef: string | null }
  | { ok: false; code: string };

const PROJECT_REF = /^[a-z0-9]{20}$/;
const normalize = (value?: string | null) => value?.trim().toLowerCase() ?? '';

export function projectRefFromUrl(value?: string | null): string | null {
  try {
    return new URL(value ?? '').hostname.toLowerCase().match(/^([a-z0-9]+)\.supabase\.co$/)?.[1] ?? null;
  } catch { return null; }
}

export function checkSupabaseTarget(input: SupabaseTargetInput): SupabaseTargetCheck {
  const environment = normalize(input.environment);
  const actual = projectRefFromUrl(input.supabaseUrl);
  const staging = normalize(input.stagingProjectRef), production = normalize(input.productionProjectRef);
  if (environment === 'staging') {
    if (!PROJECT_REF.test(staging) || actual !== staging) return { ok: false, code: 'STAGING_PROJECT_REF_MISMATCH' };
    if (!PROJECT_REF.test(production)) return { ok: false, code: 'PRODUCTION_IDENTITY_REQUIRED' };
    if (actual === production) return { ok: false, code: 'PRODUCTION_PROJECT_FORBIDDEN' };
    return { ok: true, environment, projectRef: actual };
  }
  if (environment === 'production') {
    if (!PROJECT_REF.test(production) || actual !== production) return { ok: false, code: 'PRODUCTION_PROJECT_REF_MISMATCH' };
    if (staging && (staging === production || actual === staging)) return { ok: false, code: 'STAGING_PROJECT_FORBIDDEN' };
    return { ok: true, environment, projectRef: actual };
  }
  return { ok: true, environment, projectRef: actual };
}

/** The target this bundle was built for. Values are inlined by Metro at build time. */
export function publicSupabaseTarget(): SupabaseTargetCheck {
  return checkSupabaseTarget({
    environment: process.env.EXPO_PUBLIC_WANPANE_ENV,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    stagingProjectRef: process.env.EXPO_PUBLIC_SUPABASE_STAGING_PROJECT_REF,
    productionProjectRef: process.env.EXPO_PUBLIC_SUPABASE_PRODUCTION_PROJECT_REF,
  });
}

/** The Supabase URL, or undefined when this bundle's target fails the check. */
export function guardedSupabaseUrl(): string | undefined {
  return publicSupabaseTarget().ok ? process.env.EXPO_PUBLIC_SUPABASE_URL : undefined;
}
