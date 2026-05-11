import { useState } from 'react';
import { Button } from '../components/Button';
import { setMePerson } from '../db/queries';
import { useUI } from '../store/ui';

export function OnboardingScreen() {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const push = useUI((s) => s.pushToast);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      push('Please enter a name', 'error');
      return;
    }
    setSaving(true);
    try {
      await setMePerson(trimmed);
      push(`Welcome, ${trimmed.split(/\s+/)[0]}!`, 'success');
    } catch (e) {
      push((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 px-6 pt-24 pb-10">
      <div className="text-6xl mb-4" aria-hidden>
        👋
      </div>
      <h1 className="font-display text-4xl font-semibold mb-2">Hey there.</h1>
      <p className="text-ink-muted mb-10">
        Welcome to Tally. Let's get to know each other — what should we call you?
      </p>

      <label className="label mb-2 block">Your name</label>
      <input
        autoFocus
        type="text"
        autoComplete="given-name"
        className="input no-tap-zoom mb-1"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        placeholder="e.g. Sam"
      />
      <p className="text-xs text-ink-muted mb-10">
        Saved on this device only. No account, no sync.
      </p>

      <Button size="lg" onClick={submit} disabled={saving || !name.trim()}>
        Get started
      </Button>
    </div>
  );
}
