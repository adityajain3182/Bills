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

if (cloudEnabled && supabase) {
  supabase.auth
    .getSession()
    .then(({ data }) => {
      set({ ready: true, session: data.session, user: data.session?.user ?? null });
      void db.preferences.update('singleton', { authUserId: data.session?.user?.id ?? null });
    })
    .catch(() => set({ ready: true, user: null, session: null }));
  supabase.auth.onAuthStateChange((_event, session) => {
    set({ ready: true, session, user: session?.user ?? null });
    void db.preferences.update('singleton', { authUserId: session?.user?.id ?? null });
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

export async function signInWithEmail(email: string): Promise<void> {
  if (!supabase) throw new Error('Cloud sync is not configured for this build.');
  // redirectTo respects the BASE_URL so it works on GitHub Pages subpaths.
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export function getAuthUserId(): string | null {
  return current.user?.id ?? null;
}
