import { useEffect, useState } from 'react';
import { useAuth } from '../sync/auth';
import { acceptInvite, listMyPendingInvites, type PendingInvite } from '../sync/sync';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { useUI } from '../store/ui';

// Polls for pending invites whenever the user is signed in.
export function PendingInvites() {
  const { user } = useAuth();
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [open, setOpen] = useState(false);
  const push = useUI((s) => s.pushToast);

  useEffect(() => {
    if (!user) {
      setInvites([]);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const list = await listMyPendingInvites();
        if (!cancelled) {
          setInvites(list);
          if (list.length) setOpen(true);
        }
      } catch (e) {
        console.warn('invites poll', e);
      }
    };
    void tick();
    const id = setInterval(tick, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user]);

  if (!user || !invites.length) return null;

  return (
    <Sheet
      open={open}
      onClose={() => setOpen(false)}
      title={invites.length === 1 ? 'New invite' : `${invites.length} invites`}
    >
      <ul className="space-y-2 pb-4">
        {invites.map((inv) => (
          <li key={inv.id} className="card p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{inv.groupName}</div>
              <div className="text-xs text-ink-muted">
                Invited to {inv.invitedEmail}
              </div>
            </div>
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await acceptInvite(inv);
                  push(`Joined ${inv.groupName}`, 'success');
                  setInvites((cur) => cur.filter((i) => i.id !== inv.id));
                } catch (e) {
                  push((e as Error).message, 'error');
                }
              }}
            >
              Accept
            </Button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
