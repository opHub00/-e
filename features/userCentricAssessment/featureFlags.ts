export type UserCentricFeatureFlags = {
  userCentricProfileV3: boolean;
  userCentricAssessmentResults: boolean;
};

type PublicEnvironment = {
  EXPO_PUBLIC_WANPANE_ENV?: string;
  EXPO_PUBLIC_USER_CENTRIC_PROFILE_V3?: string;
  EXPO_PUBLIC_USER_CENTRIC_ASSESSMENT_RESULTS?: string;
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
  };
  if (environment.EXPO_PUBLIC_WANPANE_ENV?.trim().toLowerCase() !== 'staging') {
    return { userCentricProfileV3: false, userCentricAssessmentResults: false };
  }
  const profile = enabled(environment.EXPO_PUBLIC_USER_CENTRIC_PROFILE_V3);
  return {
    userCentricProfileV3: profile,
    userCentricAssessmentResults:
      profile && enabled(environment.EXPO_PUBLIC_USER_CENTRIC_ASSESSMENT_RESULTS),
  };
}

export const userCentricFeatureFlags = () => resolveUserCentricFeatureFlags();
