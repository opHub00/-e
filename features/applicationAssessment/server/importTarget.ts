/** Defense-in-depth for the non-production CLI. No endpoint defaults or production override. */
export function guardImportTarget(url: string | undefined, environment: string | undefined, stagingRef: string | undefined, productionUrls: string[]) {
  if (!url) throw new Error('ASSESSMENT_IMPORT_URL is required');
  const target = new URL(url);
  if (target.username || target.password || target.search || target.hash || target.pathname !== '/') throw new Error('Use a bare Supabase origin');
  const loopback = ['localhost', '127.0.0.1', '[::1]'];
  if (!loopback.includes(target.hostname) && productionUrls.some(value => { try { return new URL(value).hostname === target.hostname; } catch { return false; } })) throw new Error('Production target is forbidden');
  if (environment === 'local') {
    if (target.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) throw new Error('Local requires a loopback HTTP endpoint');
  } else if (environment === 'staging') {
    if (!stagingRef || !/^[a-z0-9]+$/.test(stagingRef) || target.protocol !== 'https:' || target.hostname !== `${stagingRef}.supabase.co` || target.port) throw new Error('Staging requires an explicit matching project reference');
  } else throw new Error('ASSESSMENT_IMPORT_ENV must be local or staging');
  return target.origin;
}
