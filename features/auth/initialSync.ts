import { migrateApplicantProfile, type ApplicantProfileV2 } from '../profile/domain.ts';
import type { UserProfile } from '../../domain/types.ts';
import type { CloudProfileRecord, CloudSyncRepository } from './cloudRepository.ts';
import {
  isApplicantProfileV2Payload,
  mergeApplicantProfiles,
  mergeSavedListingIds,
} from './syncDomain.ts';

export type InitialSyncPlan = {
  profile: ApplicantProfileV2 | null;
  writeProfileToCloud: boolean;
  profileConflict: { local: ApplicantProfileV2; cloud: ApplicantProfileV2 } | null;
  savedListingIds: string[];
  writeSavedListingsToCloud: boolean;
  malformedCloudProfile: boolean;
};

export async function readCloudSyncSnapshot(
  repository: CloudSyncRepository,
  userId: string,
): Promise<{ cloudProfile: CloudProfileRecord | null; cloudSavedListingIds: string[] }> {
  const [cloudProfile, cloudSavedListingIds] = await Promise.all([
    repository.readProfile(userId),
    repository.readSavedListingIds(userId),
  ]);
  return { cloudProfile, cloudSavedListingIds };
}

export function buildInitialSyncPlan(input: {
  fallback: UserProfile;
  localProfileRaw: unknown | null;
  cloudProfile: CloudProfileRecord | null;
  localSavedListingIds: unknown;
  cloudSavedListingIds: unknown;
}): InitialSyncPlan {
  const localProfile = input.localProfileRaw === null
    ? null
    : migrateApplicantProfile(input.localProfileRaw, input.fallback);
  const hasMalformedCloud = Boolean(
    input.cloudProfile &&
      (input.cloudProfile.schemaVersion !== 2 ||
        !isApplicantProfileV2Payload(input.cloudProfile.profileJson)),
  );
  const cloudProfile = input.cloudProfile && !hasMalformedCloud
    ? migrateApplicantProfile(input.cloudProfile.profileJson, input.fallback)
    : null;
  const savedListingIds = mergeSavedListingIds(
    input.localSavedListingIds,
    input.cloudSavedListingIds,
  );
  const normalizedCloudSaved = mergeSavedListingIds([], input.cloudSavedListingIds);

  if (hasMalformedCloud) {
    return {
      profile: localProfile,
      writeProfileToCloud: localProfile !== null,
      profileConflict: null,
      savedListingIds,
      writeSavedListingsToCloud: !sameArray(savedListingIds, normalizedCloudSaved),
      malformedCloudProfile: true,
    };
  }

  if (!localProfile && !cloudProfile) {
    return {
      profile: null,
      writeProfileToCloud: false,
      profileConflict: null,
      savedListingIds,
      writeSavedListingsToCloud: !sameArray(savedListingIds, normalizedCloudSaved),
      malformedCloudProfile: false,
    };
  }

  if (localProfile && !cloudProfile) {
    return {
      profile: localProfile,
      writeProfileToCloud: true,
      profileConflict: null,
      savedListingIds,
      writeSavedListingsToCloud: !sameArray(savedListingIds, normalizedCloudSaved),
      malformedCloudProfile: false,
    };
  }

  if (!localProfile && cloudProfile) {
    return {
      profile: cloudProfile,
      writeProfileToCloud: false,
      profileConflict: null,
      savedListingIds,
      writeSavedListingsToCloud: !sameArray(savedListingIds, normalizedCloudSaved),
      malformedCloudProfile: false,
    };
  }

  const local = localProfile as ApplicantProfileV2;
  const cloud = cloudProfile as ApplicantProfileV2;
  const merged = mergeApplicantProfiles(local, cloud);
  return {
    profile: merged.conflictPaths.length > 0 ? local : merged.profile,
    writeProfileToCloud: merged.conflictPaths.length === 0,
    profileConflict: merged.conflictPaths.length > 0 ? { local, cloud } : null,
    savedListingIds,
    writeSavedListingsToCloud: !sameArray(savedListingIds, normalizedCloudSaved),
    malformedCloudProfile: false,
  };
}

function sameArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
