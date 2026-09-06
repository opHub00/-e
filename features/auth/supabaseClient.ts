import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { supabaseSessionStorage } from './authStorage';

let client: SupabaseClient | null | undefined;

export function getSupabaseClient(): SupabaseClient | null {
  if (client !== undefined) return client;

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    client = null;
    return client;
  }

  client = createClient(url, anonKey, {
    auth: {
      storage: supabaseSessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
  });
  return client;
}
