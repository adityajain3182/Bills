import { useEffect, useState } from 'react';
import { subscribeSync, type SyncStatus, syncNow } from '../sync/sync';
import { useAuth } from '../sync/auth';
import { cloudEnabled } from '../sync/supabase';

export function SyncBadge() {
  const { user } = useAuth();
  const [status, setStatus] = useState<SyncStatus>({ kind: 'idle' });
  useEffect(() => subscribeSync(setStatus), []);

  if (!cloudEnabled || !user) return null;

  const label =
    status.kind === 'running'
      ? 'Syncing…'
      : status.kind === 'error'
        ? 'Sync error'
        : 'Synced';
  const tone =
    status.kind === 'error'
      ? 'text-warmred'
      : status.kind === 'running'
        ? 'text-ink-muted'
        : 'text-forest';
  return (
    <button
      onClick={() => syncNow()}
      className={`text-[11px] font-medium ${tone}`}
      aria-label="Sync now"
    >
      {label}
    </button>
  );
}
