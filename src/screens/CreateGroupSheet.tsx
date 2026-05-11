import { useEffect, useState } from 'react';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { Avatar } from '../components/Avatar';
import { usePrefs } from '../db/hooks';
import { createGroup } from '../db/queries';
import { sendInviteEmail } from '../sync/auth';
import { cloudEnabled } from '../sync/supabase';
import { CURRENCIES } from '../lib/money';
import { GROUP_EMOJIS, colorForEmail, displayNameForEmail, isValidEmail, normalizeEmail } from '../types';
import type { GroupMember } from '../types';
import { useUI } from '../store/ui';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CreateGroupSheet({ open, onClose }: Props) {
  const prefs = usePrefs();
  const push = useUI((s) => s.pushToast);

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🏠');
  const [currency, setCurrency] = useState('USD');
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [emailDraft, setEmailDraft] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMembers([]);
      setCurrency(prefs?.defaultCurrency ?? 'USD');
      setName('');
      setEmailDraft('');
      setNameDraft('');
    }
  }, [open, prefs?.defaultCurrency]);

  const addPending = () => {
    const e = normalizeEmail(emailDraft);
    if (!isValidEmail(e)) {
      push('Please enter a valid email', 'error');
      return;
    }
    if (members.some((m) => m.email === e) || prefs?.myEmail === e) {
      push('Already added', 'error');
      return;
    }
    setMembers([...members, { email: e, displayName: nameDraft.trim() || undefined }]);
    setEmailDraft('');
    setNameDraft('');
  };

  const removeAt = (i: number) => setMembers(members.filter((_, idx) => idx !== i));

  const submit = async () => {
    setSaving(true);
    try {
      const g = await createGroup({ name, emoji, currency, members });
      push('Group created', 'success');
      onClose();
      // Best-effort: email each invited member so they know to sign in.
      // If we're not signed in, skip silently.
      if (cloudEnabled) {
        for (const m of members) {
          try {
            await sendInviteEmail(m.email);
          } catch (e) {
            console.warn('invite email', e);
          }
        }
      }
      void g;
    } catch (e) {
      push((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New group"
      large
      footer={
        <Button full size="lg" onClick={submit} disabled={saving || !name.trim()}>
          Create group
        </Button>
      }
    >
      <div className="space-y-5 pb-4">
        <div className="flex items-center gap-3">
          <button
            className="h-16 w-16 rounded-2xl bg-cream flex items-center justify-center text-3xl border border-line"
            onClick={() => {
              const i = GROUP_EMOJIS.indexOf(emoji);
              setEmoji(GROUP_EMOJIS[(i + 1) % GROUP_EMOJIS.length]);
            }}
            aria-label="Pick emoji"
          >
            {emoji}
          </button>
          <div className="flex-1">
            <label className="label block mb-1">Name</label>
            <input
              type="text"
              className="input no-tap-zoom"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Roomies"
            />
          </div>
        </div>

        <div>
          <label className="label block mb-2">Emoji</label>
          <div className="grid grid-cols-8 gap-2">
            {GROUP_EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                className={`h-10 rounded-xl text-xl flex items-center justify-center transition ${
                  emoji === e ? 'bg-forest text-cream' : 'bg-cream hover:bg-line/40'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label block mb-1">Currency</label>
          <select
            className="input"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label block mb-2">Members</label>
          <p className="text-xs text-ink-muted mb-2">
            You'll always be a member. Add others by email — they'll get a sign-in link.
          </p>
          <ul className="space-y-2 mb-3">
            <li className="flex items-center gap-3 p-2 rounded-xl bg-forest/8">
              <Avatar
                name={prefs?.myDisplayName || 'You'}
                color={prefs?.myAvatarColor || colorForEmail(prefs?.myEmail || 'me')}
              />
              <span className="flex-1 text-sm">
                {prefs?.myDisplayName || 'You'}{' '}
                <span className="text-ink-muted">(you)</span>
              </span>
            </li>
            {members.map((m, i) => (
              <li key={m.email} className="flex items-center gap-3 p-2 rounded-xl bg-cream">
                <Avatar
                  name={m.displayName || displayNameForEmail(m.email)}
                  color={colorForEmail(m.email)}
                />
                <span className="flex-1 text-sm min-w-0">
                  <div className="truncate">{m.displayName || displayNameForEmail(m.email)}</div>
                  <div className="text-xs text-ink-muted truncate">{m.email}</div>
                </span>
                <button
                  onClick={() => removeAt(i)}
                  className="text-ink-muted text-xs px-2"
                  aria-label={`Remove ${m.email}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <div className="space-y-2">
            <input
              type="email"
              inputMode="email"
              autoComplete="off"
              className="input no-tap-zoom"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              placeholder="friend@example.com"
              onKeyDown={(e) => {
                if (e.key === 'Enter') addPending();
              }}
            />
            <input
              type="text"
              className="input no-tap-zoom"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="Display name (optional)"
              onKeyDown={(e) => {
                if (e.key === 'Enter') addPending();
              }}
            />
            <Button variant="secondary" full onClick={addPending} disabled={!emailDraft.trim()}>
              Add member
            </Button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
