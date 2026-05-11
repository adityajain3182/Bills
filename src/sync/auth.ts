import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { cloudEnabled, supabase } from './supabase';
import { db } from '../db/db';

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

// When the auth user id changes (initial sign-in, or switching accounts),
// we (a) reset the pull watermark so the device does a full pull and (b)
// claim the local "Me" person for the new user so it survives RLS and so
// the other device can see who's the real user behind that name.
async function onAuthUserChanged(newUserId: string | null): Promise<void> {
  const prefs = await db.preferences.get('singleton');
  const prevUserId = prefs?.authUserId ?? null;
  await db.preferences.update('singleton', { authUserId: newUserId });
  if (newUserId && newUserId !== prevUserId) {
    // Force a full pull so a fresh device gets everything it should see
    await db.preferences.update('singleton', { lastPulledAt: 0 });
    // Link the "Me" person to this auth user and mark dirty so push includes it
    const mePersonId = prefs?.mePersonId;
    if (mePersonId) {
      const me = await db.people.get(mePersonId);
      if (me && me.linkedUserId !== newUserId) {
        await db.people.put({
          ...me,
          linkedUserId: newUserId,
          updatedAt: Date.now(),
          dirty: 1,
        });
      }
    }
  }
}

if (cloudEnabled && supabase) {
  supabase.auth
    .getSession()
    .then(({ data }) => {
      set({ ready: true, session: data.session, user: data.session?.user ?? null });
      void onAuthUserChanged(data.session?.user?.id ?? null);
    })
    .catch(() => set({ ready: true, user: null, session: null }));
  supabase.auth.onAuthStateChange((_event, session) => {
    set({ ready: true, session, user: session?.user ?? null });
    void onAuthUserChanged(session?.user?.id ?? null);
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

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('rate limit') || m.includes('rate_limit') || m.includes('over_email_send_rate_limit')) {
    return 'Email rate limit reached. Supabase\'s default email service only allows a few sends per hour. Try Google sign-in instead, or wait an hour. (You can also configure custom SMTP in Supabase → Authentication → Emails for higher limits.)';
  }
  if (m.includes('invalid email')) return 'That doesn\'t look like a valid email address.';
  return message;
}

export async function signInWithEmail(email: string): Promise<void> {
  if (!supabase) throw new Error('Cloud sync is not configured for this build.');
  // redirectTo respects the BASE_URL so it works on GitHub Pages subpaths.
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw new Error(friendlyAuthError(error.message));
}

export async function signInWithGoogle(): Promise<void> {
  if (!supabase) throw new Error('Cloud sync is not configured for this build.');
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  if (error) throw new Error(friendlyAuthError(error.message));
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export function getAuthUserId(): string | null {
  return current.user?.id ?? null;
}
