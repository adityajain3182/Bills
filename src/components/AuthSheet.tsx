import { useState } from 'react';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { signInWithEmail, signInWithGoogle, useAuth } from '../sync/auth';
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
  const [googling, setGoogling] = useState(false);

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

  const submitGoogle = async () => {
    setGoogling(true);
    try {
      await signInWithGoogle();
      // Redirect happens; sheet will close when the auth state updates
    } catch (e) {
      push((e as Error).message, 'error');
      setGoogling(false);
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
          <Button
            full
            size="lg"
            variant="secondary"
            onClick={submitGoogle}
            disabled={googling}
          >
            <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden className="mr-2">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8a12 12 0 1 1 0-24 12 12 0 0 1 8.5 3.5l5.7-5.7A20 20 0 1 0 44 24c0-1.2-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8A12 12 0 0 1 24 12c3 0 5.8 1.1 8 3l5.7-5.7A20 20 0 0 0 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44a20 20 0 0 0 13.4-5.2l-6.2-5.2A12 12 0 0 1 12.6 28l-6.5 5A20 20 0 0 0 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12.1 12.1 0 0 1-4.1 5.6l6.2 5.2C40 35 44 30 44 24c0-1.2-.1-2.4-.4-3.5z" />
            </svg>
            {googling ? 'Opening Google…' : 'Continue with Google'}
          </Button>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-line" />
            <span className="text-xs text-ink-soft uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-line" />
          </div>

          <p className="text-sm text-ink-muted pb-3">
            Enter your email — we'll send you a magic link. No password required.
          </p>
          <label className="label block mb-1">Email</label>
          <input
            type="email"
            autoComplete="email"
            inputMode="email"
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
