import { useEffect, useRef, useState } from 'react';
import { Header } from '../components/Header';
import { usePeople, usePrefs } from '../db/hooks';
import { Button } from '../components/Button';
import {
  clearAll,
  exportAll,
  importAll,
  renamePerson,
  updatePrefs,
} from '../db/queries';
import { useUI } from '../store/ui';
import { CURRENCIES } from '../lib/money';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { Sheet } from '../components/Sheet';
import { Avatar } from '../components/Avatar';
import { AuthSheet } from '../components/AuthSheet';
import { useAuth, signOut } from '../sync/auth';
import { cloudEnabled } from '../sync/supabase';
import { forceFullResync, subscribeSync, syncNow, type SyncStatus } from '../sync/sync';
import { formatDistanceToNow } from 'date-fns';

export function SettingsScreen() {
  const prefs = usePrefs();
  const people = usePeople() ?? [];
  const push = useUI((s) => s.pushToast);
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const me = people.find((p) => p.id === prefs?.mePersonId);
  const [meName, setMeName] = useState('');
  const { user } = useAuth();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ kind: 'idle' });
  useEffect(() => subscribeSync(setSyncStatus), []);

  const handleExport = async () => {
    try {
      const payload = await exportAll();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tally-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      push('Exported', 'success');
    } catch (e) {
      push((e as Error).message, 'error');
    }
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importAll(data);
      push('Data imported', 'success');
    } catch (e) {
      push('Could not import file', 'error');
      console.error(e);
    }
  };

  return (
    <>
      <Header title="Settings" />
      <div className="scroll-area px-5 pt-3 pb-8">
        <SectionCard label="You">
          <button
            onClick={() => {
              setMeName(me?.name ?? '');
              setRenameOpen(true);
            }}
            className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-cream"
          >
            {me ? (
              <Avatar name={me.name} color={me.avatarColor} />
            ) : (
              <div className="h-9 w-9 rounded-full bg-line" />
            )}
            <div className="flex-1 text-left">
              <div className="font-medium">{me?.name ?? 'You'}</div>
              <div className="text-xs text-ink-muted">Tap to rename</div>
            </div>
          </button>
        </SectionCard>

        {cloudEnabled && (
          <SectionCard label="Cloud sync">
            {user ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-forest text-cream flex items-center justify-center">
                    ☁
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{user.email}</div>
                    <div className="text-xs text-ink-muted">
                      {syncStatus.kind === 'running'
                        ? syncStatus.phase
                          ? `${syncStatus.phase}…`
                          : 'Syncing now…'
                        : syncStatus.kind === 'error'
                          ? `Sync error: ${syncStatus.message}`
                          : syncStatus.kind === 'ok'
                            ? `Synced ${formatDistanceToNow(syncStatus.at, { addSuffix: true })}`
                            : 'Ready to sync'}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    full
                    onClick={() => {
                      void syncNow();
                      push('Syncing…', 'info');
                    }}
                  >
                    Sync now
                  </Button>
                  <Button variant="danger" onClick={() => setSignOutOpen(true)}>
                    Sign out
                  </Button>
                </div>
                <button
                  onClick={async () => {
                    push('Forcing full re-sync…', 'info');
                    try {
                      await forceFullResync();
                      push('Full re-sync complete', 'success');
                    } catch (e) {
                      push((e as Error).message, 'error');
                    }
                  }}
                  className="text-xs text-ink-muted underline w-full text-center pt-1"
                >
                  Force full re-sync
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-ink-muted">
                  Sign in with your email to sync groups, expenses and settlements across your
                  devices and share groups with friends.
                </p>
                <Button full onClick={() => setAuthOpen(true)}>
                  Sign in
                </Button>
              </div>
            )}
          </SectionCard>
        )}

        <SectionCard label="Preferences">
          <div>
            <div className="label mb-1">Default currency</div>
            <select
              className="input"
              value={prefs?.defaultCurrency ?? 'USD'}
              onChange={(e) => updatePrefs({ defaultCurrency: e.target.value })}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-ink-muted mt-2">
              New groups default to this currency.
            </p>
          </div>
        </SectionCard>

        <SectionCard label="Data">
          <div className="space-y-2">
            <Button full variant="secondary" onClick={handleExport}>
              Export to JSON
            </Button>
            <Button full variant="secondary" onClick={() => fileRef.current?.click()}>
              Import from JSON
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
                e.target.value = '';
              }}
            />
            <Button full variant="danger" onClick={() => setConfirmClear(true)}>
              Clear all data
            </Button>
          </div>
        </SectionCard>

        <div className="text-center text-xs text-ink-soft mt-6">
          Tally · v0.1.0 · stored locally on this device
        </div>
      </div>

      <ConfirmSheet
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Erase everything?"
        description="All groups, expenses, friends, and settlements will be deleted. There is no undo."
        confirmLabel="Erase"
        destructive
        onConfirm={async () => {
          await clearAll();
          push('All data cleared', 'success');
          setTimeout(() => location.reload(), 400);
        }}
      />

      <AuthSheet open={authOpen} onClose={() => setAuthOpen(false)} />

      <ConfirmSheet
        open={signOutOpen}
        onClose={() => setSignOutOpen(false)}
        title="Sign out?"
        description="Your data stays on this device. You can sign back in any time to resume syncing."
        confirmLabel="Sign out"
        destructive
        onConfirm={async () => {
          await signOut();
          push('Signed out', 'success');
        }}
      />

      <Sheet
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="Your name"
        footer={
          <Button
            full
            onClick={async () => {
              if (!me) return;
              try {
                await renamePerson(me.id, meName);
                push('Saved', 'success');
                setRenameOpen(false);
              } catch (e) {
                push((e as Error).message, 'error');
              }
            }}
            disabled={!meName.trim()}
          >
            Save
          </Button>
        }
      >
        <input
          autoFocus
          type="text"
          className="input no-tap-zoom"
          value={meName}
          onChange={(e) => setMeName(e.target.value)}
        />
      </Sheet>
    </>
  );
}

function SectionCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      <div className="label px-1 mb-2">{label}</div>
      <div className="card p-3">{children}</div>
    </section>
  );
}
