import { useMemo, useState } from 'react';
import { Header } from '../components/Header';
import { useAllExpenses, useAllSettlements, useGroups, usePeople, usePrefs } from '../db/hooks';
import { Avatar } from '../components/Avatar';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { createPerson, deletePerson, renamePerson } from '../db/queries';
import { useUI } from '../store/ui';
import { computeNetBalances } from '../lib/balances';
import { formatMoneyAbs } from '../lib/money';
import { Fab } from '../components/Fab';
import { EmptyState } from '../components/EmptyState';
import { ConfirmSheet } from '../components/ConfirmSheet';

export function FriendsScreen() {
  const people = usePeople() ?? [];
  const groups = useGroups(true) ?? [];
  const expenses = useAllExpenses() ?? [];
  const settlements = useAllSettlements() ?? [];
  const prefs = usePrefs();
  const push = useUI((s) => s.pushToast);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const meId = prefs?.mePersonId;
  const currency = prefs?.defaultCurrency ?? 'USD';

  // Aggregate the net balance the user has with each friend across all groups,
  // converted to the user's default currency assumption — for cross-currency
  // groups we just show the absolute presence (sum is approximate).
  const friendBalances = useMemo(() => {
    const map = new Map<string, number>();
    if (!meId) return map;
    for (const g of groups) {
      const groupExp = expenses.filter((e) => e.groupId === g.id);
      const groupSet = settlements.filter((s) => s.groupId === g.id);
      const balances = computeNetBalances(groupExp, groupSet, g.memberIds);
      const meBal = balances.get(meId) ?? 0;
      if (meBal === 0) continue;
      // Only meaningful for same-currency comparison; we attribute pairwise via
      // a simple greedy match within this group.
      const creditors: { id: string; amount: number }[] = [];
      const debtors: { id: string; amount: number }[] = [];
      for (const [id, bal] of balances) {
        if (id === meId) continue;
        if (bal > 0) creditors.push({ id, amount: bal });
        else if (bal < 0) debtors.push({ id, amount: -bal });
      }
      // If "me" is positive (others owe), match me as creditor against debtors
      if (meBal > 0) {
        const totalDebt = debtors.reduce((a, b) => a + b.amount, 0);
        for (const d of debtors) {
          if (totalDebt === 0) continue;
          const portion = Math.round((d.amount / totalDebt) * meBal);
          map.set(d.id, (map.get(d.id) ?? 0) + portion);
        }
      } else {
        // me is debtor; attribute negative portions across creditors
        const totalCredit = creditors.reduce((a, b) => a + b.amount, 0);
        for (const c of creditors) {
          if (totalCredit === 0) continue;
          const portion = Math.round((c.amount / totalCredit) * -meBal);
          map.set(c.id, (map.get(c.id) ?? 0) - portion);
        }
      }
    }
    return map;
  }, [groups, expenses, settlements, meId]);

  return (
    <>
      <Header title="Friends" />
      <div className="scroll-area px-5 pt-3">
        {people.length === 0 ? (
          <EmptyState
            emoji="👥"
            title="No friends yet"
            description="Add people you share expenses with."
          />
        ) : (
          <ul className="space-y-2">
            {people.map((p) => {
              const isMe = p.id === meId;
              const bal = friendBalances.get(p.id) ?? 0;
              return (
                <li
                  key={p.id}
                  className="card p-3 flex items-center gap-3"
                  onClick={() => !isMe && setEditing({ id: p.id, name: p.name })}
                >
                  <Avatar name={p.name} color={p.avatarColor} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {p.name}
                      {isMe && <span className="text-ink-muted text-xs"> (you)</span>}
                    </div>
                    {!isMe && (
                      <div className="text-xs text-ink-muted">
                        {bal === 0
                          ? 'Settled up'
                          : bal > 0
                            ? `owes you ~${formatMoneyAbs(bal, currency)}`
                            : `you owe ~${formatMoneyAbs(bal, currency)}`}
                      </div>
                    )}
                  </div>
                  {!isMe && bal !== 0 && (
                    <div
                      className={`font-display tabular-nums ${
                        bal > 0 ? 'text-forest' : 'text-warmred'
                      }`}
                    >
                      {bal > 0 ? '+' : '−'}
                      {formatMoneyAbs(bal, currency)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-[11px] text-ink-soft text-center mt-4 px-3">
          Balances roll up approximate per-friend totals across all groups, in your
          default currency.
        </p>
      </div>
      <Fab label="Add friend" onClick={() => setCreating(true)} />

      <Sheet
        open={creating}
        onClose={() => {
          setCreating(false);
          setNewName('');
        }}
        title="Add friend"
        footer={
          <Button
            full
            onClick={async () => {
              try {
                await createPerson(newName);
                push('Friend added', 'success');
                setNewName('');
                setCreating(false);
              } catch (e) {
                push((e as Error).message, 'error');
              }
            }}
            disabled={!newName.trim()}
          >
            Add
          </Button>
        }
      >
        <label className="label block mb-1">Name</label>
        <input
          autoFocus
          type="text"
          className="input no-tap-zoom"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="e.g. Jordan"
        />
      </Sheet>

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit friend"
        footer={
          <div className="flex gap-2">
            <Button
              variant="danger"
              onClick={() => {
                if (editing) setDeleteId(editing.id);
                setEditing(null);
              }}
            >
              Delete
            </Button>
            <Button
              full
              onClick={async () => {
                if (!editing) return;
                try {
                  await renamePerson(editing.id, editing.name);
                  push('Friend updated', 'success');
                  setEditing(null);
                } catch (e) {
                  push((e as Error).message, 'error');
                }
              }}
              disabled={!editing?.name.trim()}
            >
              Save
            </Button>
          </div>
        }
      >
        <label className="label block mb-1">Name</label>
        <input
          autoFocus
          type="text"
          className="input no-tap-zoom"
          value={editing?.name ?? ''}
          onChange={(e) => editing && setEditing({ ...editing, name: e.target.value })}
        />
      </Sheet>

      <ConfirmSheet
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete friend?"
        description="They can only be removed if they aren't in any groups or expenses."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!deleteId) return;
          try {
            await deletePerson(deleteId);
            push('Friend deleted', 'success');
          } catch (e) {
            push((e as Error).message, 'error');
          }
        }}
      />
    </>
  );
}

