import { useState } from 'react';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { addMemberToGroup } from '../db/queries';
import { sendInviteEmail, useAuth } from '../sync/auth';
import { cloudEnabled } from '../sync/supabase';
import { isValidEmail, normalizeEmail } from '../types';
import { useUI } from '../store/ui';

interface Props {
  open: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
  existingEmails: string[];
}

export function AddMemberSheet({ open, onClose, groupId, groupName, existingEmails }: Props) {
  const push = useUI((s) => s.pushToast);
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const e = normalizeEmail(email);
    if (!isValidEmail(e)) {
      push('Please enter a valid email', 'error');
      return;
    }
    if (existingEmails.includes(e)) {
      push('Already a member', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await addMemberToGroup(groupId, e, displayName);
      if (cloudEnabled && user) {
        try {
          await sendInviteEmail(e);
          push(`Invite sent to ${e}`, 'success');
        } catch (err) {
          push(
            `Added — but email failed (${(err as Error).message}). You can tell them to sign in manually.`,
            'info',
          );
        }
      } else {
        push('Member added', 'success');
      }
      setEmail('');
      setDisplayName('');
      onClose();
    } catch (err) {
      push((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={`Add to ${groupName}`}>
      <div className="space-y-3 pb-4">
        <p className="text-sm text-ink-muted">
          We'll email them a sign-in link. They'll see the group as soon as they open it.
        </p>
        <div>
          <label className="label block mb-1">Email</label>
          <input
            autoFocus
            type="email"
            inputMode="email"
            className="input no-tap-zoom"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="friend@example.com"
          />
        </div>
        <div>
          <label className="label block mb-1">Display name (optional)</label>
          <input
            type="text"
            className="input no-tap-zoom"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Used until they set their own"
          />
        </div>
        {!cloudEnabled && (
          <p className="text-xs text-ink-muted">
            Cloud sync isn't configured for this build — the member will be local only.
          </p>
        )}
        {cloudEnabled && !user && (
          <p className="text-xs text-warmred">
            Sign in (Settings → Cloud sync) to actually share groups across devices.
          </p>
        )}
        <Button full size="lg" onClick={submit} disabled={submitting || !email.trim()}>
          {cloudEnabled && user ? 'Add and send invite' : 'Add member'}
        </Button>
      </div>
    </Sheet>
  );
}
