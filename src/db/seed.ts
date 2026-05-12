import { db } from './db';
import type { Preferences } from '../types';

export async function ensureSeed(): Promise<void> {
  try {
    const existing = await db.preferences.get('singleton');
    if (existing) {
      // bump visit count for install-prompt logic
      await db.preferences.update('singleton', {
        visitCount: (existing.visitCount ?? 0) + 1,
      });
      return;
    }
    const prefs: Preferences = {
      id: 'singleton',
      defaultCurrency: 'USD',
      mePersonId: null,
      onboarded: 0,
      installPromptDismissed: 0,
      visitCount: 1,
      simplifyDebts: 1,
    };
    await db.preferences.put(prefs);
  } catch (err) {
    // Dexie failures in private mode or quota — log only.
    console.warn('[bills] seed failed', err);
  }
}
