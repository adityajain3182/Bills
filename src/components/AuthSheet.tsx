import { useState } from 'react';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { signInWithEmail, useAuth } from '../sync/auth';
import { cloudEnabled } from '../sync/supabase';
import { useUI } from '../store/ui';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AuthSheet({ open, onClose }: Props) {
  const { user } = useAuth();
  const push = useUI((s) => s.pushToast);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      await signInWithEmail(email);
      setSent(true);
    } catch (e) {
      push((e as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={user ? 'Signed in' : 'Sign in to sync'}>
      {!cloudEnabled ? (
        <div className="text-sm text-ink-muted pb-4">
          Cloud sync isn't configured for this build. Set{' '}
          <code className="text-ink">VITE_SUPABASE_URL</code> and{' '}
          <code className="text-ink">VITE_SUPABASE_ANON_KEY</code> in your environment to enable it.
        </div>
      ) : user ? (
        <div className="text-sm text-ink-muted pb-4">
          You're signed in as <strong className="text-ink">{user.email}</strong>. Your groups
          sync across all devices where you sign in with this email.
        </div>
      ) : sent ? (
        <div className="text-sm pb-4">
          We sent a sign-in link to <strong>{email}</strong>. Open it on this device to finish
          signing in. (You can close this sheet — the app will pick up the session
          automatically.)
        </div>
      ) : (
        <>
          <p className="text-sm text-ink-muted pb-3">
            Enter your email — we'll send you a magic link. No password required.
          </p>
          <label className="label block mb-1">Email</label>
          <input
            type="email"
            autoComplete="email"
            inputMode="email"
            autoFocus
            className="input no-tap-zoom mb-3"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder="you@example.com"
          />
          <Button full size="lg" onClick={submit} disabled={submitting || !email.trim()}>
            Send magic link
          </Button>
          <p className="text-xs text-ink-soft text-center mt-3">
            By signing in, your locally-created groups and expenses are uploaded to the cloud
            so they sync to your other devices.
          </p>
        </>
      )}
    </Sheet>
  );
}
