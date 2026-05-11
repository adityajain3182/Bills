import { db } from './db';
import type { Preferences } from '../types';
import { AVATAR_COLORS, LOCAL_OWNER } from '../types';

export async function ensureSeed(): Promise<void> {
  try {
    const existing = await db.preferences.get('singleton');
    if (existing) {
      await db.preferences.update('singleton', {
        visitCount: (existing.visitCount ?? 0) + 1,
      });
      return;
    }
    const prefs: Preferences = {
      id: 'singleton',
      myEmail: LOCAL_OWNER,
      myDisplayName: '',
      myAvatarColor: AVATAR_COLORS[0],
      defaultCurrency: 'USD',
      onboarded: 0,
      installPromptDismissed: 0,
      visitCount: 1,
      lastSyncedAt: 0,
    };
    await db.preferences.put(prefs);
  } catch (err) {
    console.warn('[bills] seed failed', err);
  }
}
