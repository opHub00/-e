export type UserCentricFeatureFlags = {
  userCentricProfileV3: boolean;
  userCentricAssessmentResults: boolean;
  userCentricPortfolio: boolean;
};

type PublicEnvironment = {
  EXPO_PUBLIC_WANPANE_ENV?: string;
  EXPO_PUBLIC_USER_CENTRIC_PROFILE_V3?: string;
  EXPO_PUBLIC_USER_CENTRIC_ASSESSMENT_RESULTS?: string;
  EXPO_PUBLIC_USER_CENTRIC_PORTFOLIO?: string;
};

const enabled = (value: string | undefined) => value?.trim().toLowerCase() === 'true';

/**
 * The user-centric path is an explicit Staging-only rollout. Unknown, test and
 * production builds fail closed even if a flag was copied accidentally.
 */
export function resolveUserCentricFeatureFlags(
  supplied?: PublicEnvironment,
): UserCentricFeatureFlags {
  const environment: PublicEnvironment = supplied ?? {
    EXPO_PUBLIC_WANPANE_ENV: process.env.EXPO_PUBLIC_WANPANE_ENV,
    EXPO_PUBLIC_USER_CENTRIC_PROFILE_V3: process.env.EXPO_PUBLIC_USER_CENTRIC_PROFILE_V3,
    EXPO_PUBLIC_USER_CENTRIC_ASSESSMENT_RESULTS: process.env.EXPO_PUBLIC_USER_CENTRIC_ASSESSMENT_RESULTS,
    EXPO_PUBLIC_USER_CENTRIC_PORTFOLIO: process.env.EXPO_PUBLIC_USER_CENTRIC_PORTFOLIO,
  };
  if (environment.EXPO_PUBLIC_WANPANE_ENV?.trim().toLowerCase() !== 'staging') {
    return { userCentricProfileV3: false, userCentricAssessmentResults: false, userCentricPortfolio: false };
  }
  const profile = enabled(environment.EXPO_PUBLIC_USER_CENTRIC_PROFILE_V3);
  const assessmentResults = profile && enabled(environment.EXPO_PUBLIC_USER_CENTRIC_ASSESSMENT_RESULTS);
  return {
    userCentricProfileV3: profile,
    userCentricAssessmentResults: assessmentResults,
    userCentricPortfolio:
      assessmentResults && enabled(environment.EXPO_PUBLIC_USER_CENTRIC_PORTFOLIO),
  };
}

export const userCentricFeatureFlags = () => resolveUserCentricFeatureFlags();
