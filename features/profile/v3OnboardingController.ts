import { useUserStore } from '../../store/useUserStore.ts';
import { applicantProfileV2FromV3 } from '../applicationAssessment/v3Adapter.ts';
import type { ApplicantProfileV3 } from './v3.ts';
import { saveApplicantProfileV3 } from './useApplicantProfileV3Store.ts';

/**
 * V3 remains authoritative. The existing V2 Zustand state is refreshed only as
 * a compatibility cache for screens that have not cut over yet.
 */
export async function persistApplicantProfileV3FromOnboarding(
  profile: ApplicantProfileV3,
  options: { completedAt?: string | null; consentVersion?: string | null } = {},
) {
  const saved = await saveApplicantProfileV3(profile, options);
  if (!saved) return null;
  await useUserStore.getState().restoreApplicantProfile(
    applicantProfileV2FromV3(saved.profile, new Date().toISOString().slice(0, 10)),
  );
  return saved;
}
