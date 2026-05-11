import { useEffect, useState } from 'react';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { Avatar } from '../components/Avatar';
import { usePeople, usePrefs } from '../db/hooks';
import { createGroup, createPerson } from '../db/queries';
import { CURRENCIES } from '../lib/money';
import { GROUP_EMOJIS } from '../types';
import { useUI } from '../store/ui';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CreateGroupSheet({ open, onClose }: Props) {
  const prefs = usePrefs();
  const people = usePeople();
  const push = useUI((s) => s.pushToast);

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🏠');
  const [currency, setCurrency] = useState('USD');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const meId = prefs?.mePersonId;
      setSelectedIds(meId ? [meId] : []);
      setCurrency(prefs?.defaultCurrency ?? 'USD');
    }
  }, [open, prefs?.mePersonId, prefs?.defaultCurrency]);

  const toggle = (id: string) =>
    setSelectedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const addNew = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      const p = await createPerson(trimmed);
      setSelectedIds((cur) => [...cur, p.id]);
      setNewName('');
    } catch (e) {
      push((e as Error).message, 'error');
    }
  };

  const submit = async () => {
    setSaving(true);
    try {
      await createGroup({ name, emoji, currency, memberIds: selectedIds });
      push('Group created', 'success');
      onClose();
      setName('');
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
        <Button
          full
          size="lg"
          onClick={submit}
          disabled={saving || !name.trim() || selectedIds.length === 0}
        >
          Create group
        </Button>
      }
    >
      <div className="space-y-5 pb-4">
        <div className="flex items-center gap-3">
          <button
            className="h-16 w-16 rounded-2xl bg-cream flex items-center justify-center text-3xl border border-line"
            aria-label="Pick emoji"
            onClick={() => {
              const i = GROUP_EMOJIS.indexOf(emoji);
              setEmoji(GROUP_EMOJIS[(i + 1) % GROUP_EMOJIS.length]);
            }}
          >
            {emoji}
          </button>
          <div className="flex-1">
            <label className="label block mb-1">Name</label>
            <input
              autoFocus
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
                  emoji === e
                    ? 'bg-forest text-cream'
                    : 'bg-cream hover:bg-line/40'
                }`}
                aria-pressed={emoji === e}
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
          <ul className="space-y-2 mb-3">
            {(people ?? []).map((p) => {
              const selected = selectedIds.includes(p.id);
              return (
                <li key={p.id}>
                  <button
                    onClick={() => toggle(p.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-2xl transition ${
                      selected ? 'bg-forest/8 border border-forest/20' : 'bg-cream border border-transparent'
                    }`}
                  >
                    <Avatar name={p.name} color={p.avatarColor} />
                    <span className="flex-1 text-left font-medium">
                      {p.name}
                      {prefs?.mePersonId === p.id && (
                        <span className="text-xs text-ink-muted font-normal"> (you)</span>
                      )}
                    </span>
                    <span
                      className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition ${
                        selected
                          ? 'border-forest bg-forest text-cream'
                          : 'border-line'
                      }`}
                    >
                      {selected && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M5 12l5 5 9-11"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2">
            <input
              type="text"
              className="input flex-1 no-tap-zoom"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Add a friend by name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') addNew();
              }}
            />
            <Button variant="secondary" onClick={addNew} disabled={!newName.trim()}>
              Add
            </Button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
