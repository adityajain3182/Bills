import { useEffect, useState } from 'react';
import { usePrefs } from '../db/hooks';
import { updatePrefs } from '../db/queries';
import { Sheet } from './Sheet';
import { Button } from './Button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS standalone flag
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function InstallPrompt() {
  const prefs = usePrefs();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [openIOS, setOpenIOS] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!prefs || prefs.installPromptDismissed || isStandalone()) return null;
  if ((prefs.visitCount ?? 0) < 2) return null;

  const dismiss = async () => {
    await updatePrefs({ installPromptDismissed: 1 });
  };

  const install = async () => {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
      await dismiss();
      return;
    }
    if (isIOS()) {
      setOpenIOS(true);
    } else {
      await dismiss();
    }
  };

  return (
    <>
      <div
        className="fixed left-4 right-4 mx-auto max-w-[448px] z-40 card p-4 flex items-center gap-3"
        style={{ bottom: 'calc(72px + var(--safe-bottom) + 16px)' }}
      >
        <div className="h-10 w-10 rounded-xl bg-coral text-cream flex items-center justify-center font-display font-bold text-lg shrink-0">
          T
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">Install Tally</div>
          <div className="text-xs text-ink-muted">Add to your home screen for offline use.</div>
        </div>
        <Button size="sm" onClick={install}>
          Install
        </Button>
        <button
          onClick={dismiss}
          className="text-ink-muted text-xs px-1"
          aria-label="Dismiss install prompt"
        >
          ✕
        </button>
      </div>

      <Sheet open={openIOS} onClose={() => setOpenIOS(false)} title="Install on iOS">
        <ol className="space-y-3 text-sm pb-4">
          <li>
            1. Tap the <span className="font-semibold">Share</span> button at the
            bottom of Safari.
          </li>
          <li>
            2. Scroll and tap{' '}
            <span className="font-semibold">Add to Home Screen</span>.
          </li>
          <li>
            3. Tap <span className="font-semibold">Add</span> in the top right.
          </li>
        </ol>
        <Button full onClick={() => setOpenIOS(false)}>
          Got it
        </Button>
      </Sheet>
    </>
  );
}
