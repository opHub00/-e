import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { isServerRenderEnvironment, supabaseSessionStorage } from './authStorage';
import { publicSupabaseTarget } from './supabaseTarget';

let client: SupabaseClient | null | undefined;

export function getSupabaseClient(): SupabaseClient | null {
  /*
    A static render has no browser session to restore. Creating the auth client
    there made GoTrue read session storage and start refresh timers inside Node,
    which failed the whole export. The decision is deliberately not cached: the
    browser process builds the real client after hydration.
  */
  if (isServerRenderEnvironment()) return null;
  if (client !== undefined) return client;

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  // A bundle whose URL is not its declared project gets no client: it fails closed.
  if (!url || !anonKey || !publicSupabaseTarget().ok) {
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
