/** Defense-in-depth for the non-production CLI. No endpoint defaults or production override. */

export function projectRefFromSupabaseHost(hostname: string): string | null {
  return hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1] ?? null;
}

/** A declared production identity as a comparable key: the project ref, or the host for non-Supabase URLs. */
function productionIdentityKey(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return projectRefFromSupabaseHost(url.hostname) ?? url.hostname;
  } catch {
    return trimmed;
  }
}

/**
 * Production identity is declared, never inferred from the current target.
 *
 * The CLI's linked project used to count as production identity. Linking the CLI
 * to staging then made a staging import look like production and blocked itself.
 * A linked project says what is being worked on; it says nothing about which
 * project is production.
 */
export function guardImportTarget(
  url: string | undefined,
  environment: string | undefined,
  stagingRef: string | undefined,
  productionRefs: string[],
) {
  if (!url) throw new Error('ASSESSMENT_IMPORT_URL is required');
  const target = new URL(url);
  if (target.username || target.password || target.search || target.hash || target.pathname !== '/') throw new Error('Use a bare Supabase origin');
  const loopback = ['localhost', '127.0.0.1', '[::1]'];
  // Callers may declare production as a bare ref or as a URL. Both must protect;
  // comparing a URL against a ref would silently let the production target through.
  const production = productionRefs.map(productionIdentityKey).filter((key): key is string => key !== null);
  const targetKey = projectRefFromSupabaseHost(target.hostname) ?? target.hostname;
  if (!loopback.includes(target.hostname) && production.includes(targetKey)) throw new Error('Production target is forbidden');

  if (environment === 'local') {
    if (target.protocol !== 'http:' || !loopback.includes(target.hostname)) throw new Error('Local requires a loopback HTTP endpoint');
  } else if (environment === 'staging') {
    const staging = stagingRef?.trim().toLowerCase();
    if (!staging || !/^[a-z0-9]+$/.test(staging) || target.protocol !== 'https:' || target.hostname !== `${staging}.supabase.co` || target.port) {
      throw new Error('Staging requires an explicit matching project reference');
    }
    // Without a declared production project there is nothing to compare against, so refuse.
    if (production.length === 0) throw new Error('Production identity must be declared before a staging import');
    if (production.includes(staging)) throw new Error('Production target is forbidden');
  } else throw new Error('ASSESSMENT_IMPORT_ENV must be local or staging');
  return target.origin;
}
