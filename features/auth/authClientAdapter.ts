import type { Session, SupabaseClient } from '@supabase/supabase-js';

export type SignUpResult = {
  session: Session | null;
  needsEmailConfirmation: boolean;
};

export async function readPersistedSession(client: SupabaseClient): Promise<Session | null> {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signUpWithPassword(
  client: SupabaseClient,
  email: string,
  password: string,
  emailRedirectTo?: string,
): Promise<SignUpResult> {
  const { data, error } = await client.auth.signUp({
    email: email.trim(),
    password,
    options: emailRedirectTo ? { emailRedirectTo } : undefined,
  });
  if (error) throw error;
  return {
    session: data.session,
    needsEmailConfirmation: data.session === null,
  };
}

export async function signInWithPassword(
  client: SupabaseClient,
  email: string,
  password: string,
): Promise<Session> {
  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  if (!data.session) throw new Error('missing auth session');
  return data.session;
}

export async function signOutLocal(client: SupabaseClient): Promise<void> {
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) throw error;
}
