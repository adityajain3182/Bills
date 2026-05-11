import { useEffect, useState } from 'react';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { useAuth } from '../sync/auth';
import { cloudEnabled, supabase } from '../sync/supabase';
import { inviteToGroup } from '../sync/sync';
import { useUI } from '../store/ui';

interface Props {
  open: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
}

interface MemberRow {
  user_id: string;
  email: string;
  display_name: string;
}
interface InviteRow {
  id: string;
  invited_email: string;
}

export function ShareGroupSheet({ open, onClose, groupId, groupName }: Props) {
  const { user } = useAuth();
  const push = useUI((s) => s.pushToast);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [pending, setPending] = useState<InviteRow[]>([]);

  useEffect(() => {
    if (!open || !user || !supabase) return;
    let cancelled = false;
    (async () => {
      const gm = await supabase!
        .from('group_members')
        .select('user_id, profiles(email, display_name)')
        .eq('group_id', groupId);
      if (cancelled) return;
      if (gm.data) {
        type Row = { user_id: string; profiles: { email: string; display_name: string } | null };
        const rows = gm.data as unknown as Row[];
        setMembers(
          rows.map((r) => ({
            user_id: r.user_id,
            email: r.profiles?.email ?? '?',
            display_name: r.profiles?.display_name ?? '',
          })),
        );
      }
      const inv = await supabase!
        .from('invites')
        .select('id, invited_email')
        .eq('group_id', groupId)
        .is('accepted_at', null);
      if (!cancelled && inv.data) setPending(inv.data as InviteRow[]);
    })().catch((e) => console.warn(e));
    return () => {
      cancelled = true;
    };
  }, [open, user, groupId]);

  if (!cloudEnabled) {
    return (
      <Sheet open={open} onClose={onClose} title="Share group">
        <p className="text-sm text-ink-muted pb-4">
          Cloud sync isn't configured for this build, so groups can't be shared. Add Supabase env
          vars to enable it.
        </p>
      </Sheet>
    );
  }

  if (!user) {
    return (
      <Sheet open={open} onClose={onClose} title="Share group">
        <p className="text-sm text-ink-muted pb-4">
          Sign in (from Settings → Cloud sync) to share groups with friends.
        </p>
      </Sheet>
    );
  }

  const submit = async () => {
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      await inviteToGroup(groupId, email);
      push(`Invite sent to ${email}`, 'success');
      setPending((cur) => [...cur, { id: crypto.randomUUID(), invited_email: email.trim().toLowerCase() }]);
      setEmail('');
    } catch (e) {
      push((e as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={`Share ${groupName}`}>
      <div className="space-y-4 pb-4">
        <div>
          <label className="label block mb-1">Invite by email</label>
          <div className="flex gap-2">
            <input
              type="email"
              inputMode="email"
              className="input no-tap-zoom flex-1"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
              placeholder="friend@example.com"
            />
            <Button onClick={submit} disabled={submitting || !email.trim()}>
              Invite
            </Button>
          </div>
          <p className="text-xs text-ink-muted mt-2">
            When they sign in with this email, they'll see this group automatically.
          </p>
        </div>

        {members.length > 0 && (
          <div>
            <div className="label mb-2">Members with access</div>
            <ul className="space-y-1">
              {members.map((m) => (
                <li
                  key={m.user_id}
                  className="flex items-center justify-between px-3 py-2 rounded-xl bg-cream text-sm"
                >
                  <span className="truncate">{m.display_name || m.email}</span>
                  <span className="text-xs text-ink-muted truncate">{m.email}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {pending.length > 0 && (
          <div>
            <div className="label mb-2">Pending invites</div>
            <ul className="space-y-1">
              {pending.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between px-3 py-2 rounded-xl bg-cream text-sm"
                >
                  <span className="truncate">{p.invited_email}</span>
                  <span className="text-xs text-ink-muted">waiting</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}
