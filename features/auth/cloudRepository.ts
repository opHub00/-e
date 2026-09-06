import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApplicantProfileV2 } from '../profile/domain';
import { normalizeSavedListingIds } from '../discovery/savedListingStorage';

export type CloudProfileRecord = {
  profileJson: unknown;
  schemaVersion: number;
  updatedAt: string;
};

export type CloudSyncRepository = {
  readProfile: (userId: string) => Promise<CloudProfileRecord | null>;
  writeProfile: (userId: string, profile: ApplicantProfileV2) => Promise<void>;
  readSavedListingIds: (userId: string) => Promise<string[]>;
  replaceSavedListingIds: (userId: string, listingIds: readonly string[]) => Promise<void>;
};

export function createCloudSyncRepository(client: SupabaseClient): CloudSyncRepository {
  const readSavedListingIds = async (userId: string) => {
    const { data, error } = await client
      .from('saved_listings')
      .select('listing_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return normalizeSavedListingIds(data?.map((row) => row.listing_id));
  };

  return {
    async readProfile(userId) {
      const { data, error } = await client
        .from('user_profiles')
        .select('profile_json,schema_version,updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        profileJson: data.profile_json,
        schemaVersion: data.schema_version,
        updatedAt: data.updated_at,
      };
    },

    async writeProfile(userId, profile) {
      const { error } = await client.from('user_profiles').upsert(
        {
          user_id: userId,
          schema_version: 2,
          profile_json: profile,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
    },

    readSavedListingIds,

    async replaceSavedListingIds(userId, listingIds) {
      const desired = normalizeSavedListingIds(listingIds);
      const current = await readSavedListingIds(userId);
      const currentSet = new Set(current);
      const desiredSet = new Set(desired);
      const toInsert = desired.filter((listingId) => !currentSet.has(listingId));
      const toDelete = current.filter((listingId) => !desiredSet.has(listingId));

      if (toInsert.length > 0) {
        const { error } = await client.from('saved_listings').upsert(
          toInsert.map((listingId) => ({ user_id: userId, listing_id: listingId })),
          { onConflict: 'user_id,listing_id', ignoreDuplicates: true },
        );
        if (error) throw error;
      }

      if (toDelete.length > 0) {
        const { error } = await client
          .from('saved_listings')
          .delete()
          .eq('user_id', userId)
          .in('listing_id', toDelete);
        if (error) throw error;
      }
    },
  };
}
