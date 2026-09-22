/** Defense-in-depth for the assessment CLI: local/staging by default, production only through its own explicit guard. */

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

const PROJECT_REF = /^[a-z0-9]{20}$/;

/**
 * The production target, allowed only as its own declared identity. Every input is explicit:
 * the production ref the operator typed, the staging ref it must differ from, and any production
 * identity already declared elsewhere, which must agree. Nothing is inferred from the URL.
 */
export function guardProductionImportTarget(
  url: string | undefined,
  productionRef: string | undefined,
  stagingRef: string | undefined,
  declaredProductionRefs: string[],
): { origin: string; projectRef: string } {
  const production = productionRef?.trim().toLowerCase() ?? '';
  const staging = stagingRef?.trim().toLowerCase() ?? '';
  if (!PROJECT_REF.test(production)) throw new Error('PRODUCTION_PROJECT_REF_REQUIRED');
  if (!PROJECT_REF.test(staging)) throw new Error('STAGING_PROJECT_REF_REQUIRED_FOR_PRODUCTION');
  if (production === staging) throw new Error('PRODUCTION_REF_EQUALS_STAGING');
  if (!url) throw new Error('ASSESSMENT_IMPORT_URL is required');
  const target = new URL(url);
  if (target.username || target.password || target.search || target.hash || target.pathname !== '/') throw new Error('Use a bare Supabase origin');
  if (target.protocol !== 'https:' || target.port || target.hostname !== `${production}.supabase.co`) throw new Error('PRODUCTION_URL_REF_MISMATCH');
  const declared = declaredProductionRefs.map(productionIdentityKey).filter((key): key is string => key !== null);
  if (declared.includes(staging)) throw new Error('STAGING_DECLARED_AS_PRODUCTION');
  if (declared.some(key => key !== production)) throw new Error('PRODUCTION_IDENTITY_CONFLICT');
  return { origin: target.origin, projectRef: production };
}

/** Commands that write to, or read from, production. Each needs its own typed confirmation. */
export const PRODUCTION_CONFIRMED_COMMANDS = ['upload', 'import', 'open-review', 'review', 'approve', 'activate', 'bootstrap-admin'] as const;
/** Never available against production, with or without confirmation. */
export const PRODUCTION_FORBIDDEN_COMMANDS = ['reset', 'reseed', 'delete', 'purge'] as const;

/** `<command>:<production ref>:<subject>` — the operator retypes what is about to change. */
export const productionConfirmation = (command: string, projectRef: string, subject: string) => `${command}:${projectRef}:${subject}`;

export function assertProductionConfirmation(command: string, projectRef: string, subject: string, given: string | undefined) {
  if ((PRODUCTION_FORBIDDEN_COMMANDS as readonly string[]).includes(command)) throw new Error('DESTRUCTIVE_OPERATION_FORBIDDEN_IN_PRODUCTION');
  if (!(PRODUCTION_CONFIRMED_COMMANDS as readonly string[]).includes(command)) throw new Error('UNKNOWN_PRODUCTION_COMMAND');
  if (given?.trim() !== productionConfirmation(command, projectRef, subject)) throw new Error('PRODUCTION_CONFIRMATION_REQUIRED');
}
