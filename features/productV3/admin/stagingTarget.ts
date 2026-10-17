/** A Product V3 operational connection is never inferred from the app's public URL. */
export type ProductV3StagingTarget = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  ref: string;
};

const projectRef = /^[a-z]{20}$/;
const unresolvedLabels = new Set(['재당첨 제한', '소득', '자산', '청약통장', '특별공급 당첨이력', '해외체류', '자녀정보', '주택소유', '혼인']);

export const sanitizeUnresolvedCategory = (label: unknown): string =>
  typeof label === 'string' && unresolvedLabels.has(label) ? label : '기타 확인 필요';

export function resolveProductV3StagingTarget(
  env: Record<string, string | undefined>,
  requireServiceRole = true,
): ProductV3StagingTarget {
  const ref = env.SUPABASE_STAGING_PROJECT_REF?.trim() ?? '';
  const productionRef = env.SUPABASE_PRODUCTION_PROJECT_REF?.trim() ?? '';
  const rawUrl = env.SUPABASE_STAGING_URL?.trim() ?? '';
  const anonKey = env.SUPABASE_STAGING_ANON_KEY?.trim() ?? '';
  const serviceRoleKey = env.SUPABASE_STAGING_SERVICE_ROLE_KEY?.trim() ?? '';
  if (env.WANPANE_ENV !== 'staging' || env.VERCEL_ENV === 'production') throw new Error('PRODUCT_V3_STAGING_ONLY');
  if (!projectRef.test(ref) || !projectRef.test(productionRef) || ref === productionRef) throw new Error('PRODUCT_V3_STAGING_IDENTITY_REQUIRED');
  if (rawUrl !== `https://${ref}.supabase.co`) throw new Error('PRODUCT_V3_STAGING_URL_MISMATCH');
  if (!anonKey || (requireServiceRole && !serviceRoleKey)) throw new Error('PRODUCT_V3_STAGING_CREDENTIALS_REQUIRED');
  return { url: rawUrl, anonKey, serviceRoleKey, ref };
}
