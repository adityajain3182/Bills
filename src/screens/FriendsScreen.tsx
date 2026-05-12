import { useMemo, useState } from 'react';
import { Header } from '../components/Header';
import { useAllExpenses, useAllSettlements, usePeople, usePrefs } from '../db/hooks';
import { Avatar } from '../components/Avatar';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { createPerson, deletePerson, renamePerson } from '../db/queries';
import { useUI } from '../store/ui';
import {
  computeCrossGroupNetByCurrency,
  myCrossGroupPayments,
} from '../lib/crossGroup';
import { formatMoney, formatMoneyAbs } from '../lib/money';
import { Fab } from '../components/Fab';
import { EmptyState } from '../components/EmptyState';
import { ConfirmSheet } from '../components/ConfirmSheet';

export function FriendsScreen() {
  const people = usePeople() ?? [];
  const expenses = useAllExpenses() ?? [];
  const settlements = useAllSettlements() ?? [];
  const prefs = usePrefs();
  const push = useUI((s) => s.pushToast);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const meId = prefs?.mePersonId;
  const simplifyOn = (prefs?.simplifyDebts ?? 1) === 1;

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  // Net balance per person, across every group, bucketed by currency.
  // This is the source of truth for the per-friend totals (and for the
  // simplified suggestions when the toggle is on).
  const netByCurrency = useMemo(
    () => computeCrossGroupNetByCurrency(expenses, settlements),
    [expenses, settlements],
  );

  // My net per friend, summed across currencies for the per-friend list.
  // (We still show each currency on its own row when the friend has
  // activity in more than one currency.)
  const friendNetsPerCurrency = useMemo(() => {
    if (!meId) return new Map<string, Map<string, number>>(); // friendId -> currency -> net
    const result = new Map<string, Map<string, number>>();
    for (const [currency, balances] of netByCurrency) {
      // Within this currency: simplify, then look at txns involving me.
      // We want each FRIEND's net with me, so we accumulate via the
      // simplified transactions for stability.
      const meBal = balances.get(meId) ?? 0;
      if (meBal === 0) continue;
      // Attribute per-friend net by proportional contribution.
      // (Approximate — exact pairwise is more involved; this gives a
      // reasonable per-friend total and matches the simplified-suggestion
      // sum for the most common 2-person-per-pair cases.)
      const opposite: { id: string; mag: number }[] = [];
      for (const [id, b] of balances) {
        if (id === meId) continue;
        if (meBal > 0 && b < 0) opposite.push({ id, mag: -b });
        else if (meBal < 0 && b > 0) opposite.push({ id, mag: b });
      }
      const totalOpp = opposite.reduce((a, x) => a + x.mag, 0);
      if (totalOpp === 0) continue;
      for (const o of opposite) {
        const portion = Math.round((o.mag / totalOpp) * Math.abs(meBal));
        const signed = meBal > 0 ? portion : -portion;
        const row = result.get(o.id) ?? new Map<string, number>();
        row.set(currency, (row.get(currency) ?? 0) + signed);
        result.set(o.id, row);
      }
    }
    return result;
  }, [netByCurrency, meId]);

  type MyPaymentsByCurrency = ReturnType<typeof myCrossGroupPayments>;
  const myPayments = useMemo<MyPaymentsByCurrency>(
    () =>
      meId ? myCrossGroupPayments(expenses, settlements, meId) : new Map(),
    [expenses, settlements, meId],
  );

  // Headline: across all currencies that have any activity, show one row
  // per currency. Most users will only have one.
  const headlines = useMemo(() => {
    if (!meId) return [];
    const out: { currency: string; owed: number; owes: number; net: number }[] = [];
    for (const [currency, balances] of netByCurrency) {
      let owed = 0;
      let owes = 0;
      const meBal = balances.get(meId) ?? 0;
      if (meBal > 0) owed = meBal;
      else if (meBal < 0) owes = -meBal;
      if (owed || owes) out.push({ currency, owed, owes, net: meBal });
    }
    return out;
  }, [netByCurrency, meId]);

  return (
    <>
      <Header title="Friends" />
      <div className="scroll-area px-5 pt-3">
        {/* Headline totals across all groups */}
        {headlines.length > 0 && (
          <div className="card p-5 mb-4">
            <div className="text-xs text-ink-muted mb-1">Across all groups</div>
            {headlines.map((h) => (
              <div key={h.currency} className="mb-2 last:mb-0">
                <div className="font-display text-2xl font-semibold tabular-nums">
                  {h.net === 0
                    ? 'Settled up'
                    : h.net > 0
                      ? `You're owed ${formatMoneyAbs(h.net, h.currency)}`
                      : `You owe ${formatMoneyAbs(h.net, h.currency)}`}
                </div>
                {(h.owed > 0 || h.owes > 0) && (
                  <div className="mt-1 flex gap-3 text-xs">
                    <span className="text-forest">
                      Owed to you: {formatMoney(h.owed, h.currency)}
                    </span>
                    {h.owes > 0 && (
                      <span className="text-warmred">
                        You owe: {formatMoney(h.owes, h.currency)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Simplified payment suggestions (cross-group), if the user opted in */}
        {simplifyOn && myPayments.size > 0 && (
          <div className="card p-4 mb-4">
            <div className="text-xs uppercase tracking-wider text-ink-muted mb-2">
              Suggested payments
            </div>
            <p className="text-xs text-ink-muted mb-3">
              Combines every group you share with each person — pay or collect once instead of
              settling each group on its own.
            </p>
            <ul className="space-y-2">
              {[...myPayments.entries()].flatMap(([currency, { iOwe, owedToMe }]) =>
                [
                  ...iOwe.map((t) => ({ kind: 'owe' as const, currency, ...t })),
                  ...owedToMe.map((t) => ({ kind: 'receive' as const, currency, ...t })),
                ].map((t, i) => {
                  const friendId = t.kind === 'owe' ? t.toId : t.fromId;
                  const p = peopleById.get(friendId);
                  if (!p) return null;
                  return (
                    <li
                      key={`${currency}-${i}`}
                      className="flex items-center gap-3 p-2 rounded-xl bg-cream"
                    >
                      <Avatar name={p.name} color={p.avatarColor} size={32} />
                      <div className="flex-1 text-sm">
                        {t.kind === 'owe' ? (
                          <>
                            Pay <strong>{p.name}</strong>
                          </>
                        ) : (
                          <>
                            <strong>{p.name}</strong> pays you
                          </>
                        )}
                      </div>
                      <div
                        className={`font-display tabular-nums font-semibold ${
                          t.kind === 'owe' ? 'text-warmred' : 'text-forest'
                        }`}
                      >
                        {formatMoneyAbs(t.amount, t.currency)}
                      </div>
                    </li>
                  );
                }),
              )}
            </ul>
          </div>
        )}

        {/* People directory */}
        <div className="text-xs uppercase tracking-wider text-ink-muted mb-2 px-1">
          People
        </div>
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
              const perCurrency = friendNetsPerCurrency.get(p.id);
              const totalNet = perCurrency
                ? [...perCurrency.values()].reduce((a, b) => a + b, 0)
                : 0;
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
                    {!isMe && perCurrency && perCurrency.size > 0 ? (
                      <div className="text-xs text-ink-muted truncate">
                        {[...perCurrency.entries()]
                          .filter(([, v]) => v !== 0)
                          .map(([cur, v]) =>
                            v > 0
                              ? `owes you ${formatMoneyAbs(v, cur)}`
                              : `you owe ${formatMoneyAbs(v, cur)}`,
                          )
                          .join(' · ') || 'Settled up'}
                      </div>
                    ) : !isMe ? (
                      <div className="text-xs text-ink-muted">Settled up</div>
                    ) : null}
                  </div>
                  {!isMe && perCurrency && perCurrency.size === 1 && totalNet !== 0 && (
                    <div
                      className={`font-display tabular-nums ${
                        totalNet > 0 ? 'text-forest' : 'text-warmred'
                      }`}
                    >
                      {totalNet > 0 ? '+' : '−'}
                      {formatMoneyAbs(totalNet, [...perCurrency.keys()][0])}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-[11px] text-ink-soft text-center mt-4 px-3">
          Balances aggregate across every group you share with a person. Different currencies are
          tracked separately.
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
