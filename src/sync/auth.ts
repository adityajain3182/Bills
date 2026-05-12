import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { cloudEnabled, supabase } from './supabase';
import { adoptLocalDataForEmail } from '../db/queries';
import { normalizeEmail } from '../types';

export interface AuthState {
  ready: boolean;
  user: User | null;
  session: Session | null;
}

const listeners = new Set<(s: AuthState) => void>();
let current: AuthState = { ready: !cloudEnabled, user: null, session: null };

function set(next: AuthState) {
  current = next;
  for (const fn of listeners) fn(current);
}

async function onAuthUserChanged(user: User | null): Promise<void> {
  if (user?.email) {
    await adoptLocalDataForEmail(normalizeEmail(user.email));
  }
}

if (cloudEnabled && supabase) {
  supabase.auth
    .getSession()
    .then(({ data }) => {
      set({ ready: true, session: data.session, user: data.session?.user ?? null });
      void onAuthUserChanged(data.session?.user ?? null);
    })
    .catch(() => set({ ready: true, user: null, session: null }));
  supabase.auth.onAuthStateChange((_event, session) => {
    set({ ready: true, session, user: session?.user ?? null });
    void onAuthUserChanged(session?.user ?? null);
  });
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(current);
  useEffect(() => {
    listeners.add(setState);
    setState(current);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}

export function getAuthUserEmail(): string | null {
  return current.user?.email ? normalizeEmail(current.user.email) : null;
}

export function getAuthUserId(): string | null {
  return current.user?.id ?? null;
}

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('rate limit') || m.includes('over_email_send_rate_limit')) {
    return "Email rate limit reached. Supabase's default mailer only allows a few sends per hour. Try Google sign-in, configure custom SMTP, or wait an hour.";
  }
  if (m.includes('invalid email')) return "That doesn't look like a valid email address.";
  return message;
}

export async function signInWithEmail(email: string): Promise<void> {
  if (!supabase) throw new Error('Cloud sync is not configured.');
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw new Error(friendlyAuthError(error.message));
}

export async function signInWithGoogle(): Promise<void> {
  if (!supabase) throw new Error('Cloud sync is not configured.');
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  if (error) throw new Error(friendlyAuthError(error.message));
}

/**
 * Send a magic link to a friend's email so they can sign in and see the group
 * they were just added to. Does NOT change the current session.
 */
export async function sendInviteEmail(email: string): Promise<void> {
  if (!supabase) return;
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
  });
  if (error) throw new Error(friendlyAuthError(error.message));
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}
