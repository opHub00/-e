import type { UserCentricFeatureFlags } from './featureFlags.ts';

export type AppAccessLevel = 'PUBLIC' | 'AUTHENTICATED';

const PRIVATE_PATHS = [
  '/portfolio',
  '/profile-onboarding',
  '/profile',
  '/assessment',
  '/consultation',
  '/calendar',
  '/newlywed',
] as const;

/**
 * Public discovery stays open. Personal data routes become private only while
 * the staging-only user-centric rollout is enabled, so the production V2 flow
 * keeps its current behaviour until cutover is explicitly approved.
 */
export function accessLevelForPath(
  pathname: string,
  flags: UserCentricFeatureFlags,
): AppAccessLevel {
  if (!flags.userCentricProfileV3) return 'PUBLIC';
  return PRIVATE_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`))
    ? 'AUTHENTICATED'
    : 'PUBLIC';
}

/** Only internal app paths are accepted as post-auth destinations. */
export function safeAuthReturnTo(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) return null;
  if (candidate.includes('://') || candidate.includes('\\') || /[\r\n]/.test(candidate)) return null;
  return candidate;
}

export function authRouteFor(returnTo: string): {
  pathname: '/auth';
  params: { returnTo: string };
} {
  return { pathname: '/auth', params: { returnTo } };
}
