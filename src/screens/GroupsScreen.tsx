import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useAllExpenses,
  useAllSettlements,
  useGroups,
  usePrefs,
  useProfiles,
} from '../db/hooks';
import { Header } from '../components/Header';
import { EmptyState } from '../components/EmptyState';
import { Fab } from '../components/Fab';
import { Button } from '../components/Button';
import { SyncBadge } from '../components/SyncBadge';
import { CreateGroupSheet } from './CreateGroupSheet';
import { computeNetBalances } from '../lib/balances';
import { formatMoney, formatMoneyAbs } from '../lib/money';
import { AvatarStack } from '../components/Avatar';
import { colorForEmail, displayNameForEmail } from '../types';

export function GroupsScreen() {
  const groups = useGroups();
  const expenses = useAllExpenses();
  const settlements = useAllSettlements();
  const prefs = usePrefs();
  const profiles = useProfiles();
  const [creating, setCreating] = useState(false);

  const profileByEmail = useMemo(() => new Map(profiles?.map((p) => [p.email, p]) ?? []), [profiles]);
  const meEmail = prefs?.myEmail;

  const totals = useMemo(() => {
    if (!groups || !meEmail) return { owed: 0, owes: 0, net: 0 };
    let owed = 0;
    let owes = 0;
    for (const g of groups) {
      if (g.archived) continue;
      const groupExpenses = (expenses ?? []).filter((e) => e.groupId === g.id);
      const groupSettlements = (settlements ?? []).filter((s) => s.groupId === g.id);
      const memberEmails = g.members.map((m) => m.email);
      const balances = computeNetBalances(groupExpenses, groupSettlements, memberEmails);
      const me = balances.get(meEmail) ?? 0;
      if (me > 0) owed += me;
      else if (me < 0) owes += -me;
    }
    return { owed, owes, net: owed - owes };
  }, [groups, expenses, settlements, meEmail]);

  const currency = prefs?.defaultCurrency ?? 'USD';

  if (groups === undefined) {
    return (
      <>
        <Header title="Groups" />
        <div className="px-5 py-8 text-ink-muted">Loading…</div>
      </>
    );
  }

  return (
    <>
      <Header title="Groups" right={<SyncBadge />} />
      <div className="scroll-area px-5 pt-4">
        {groups.length > 0 && (
          <div className="card p-5 mb-5">
            <div className="text-xs text-ink-muted mb-1">Across all groups</div>
            <div className="font-display text-3xl font-semibold tabular-nums">
              {totals.net === 0
                ? 'All settled up'
                : totals.net > 0
                  ? `You're owed ${formatMoneyAbs(totals.net, currency)}`
                  : `You owe ${formatMoneyAbs(totals.net, currency)}`}
            </div>
            <div className="mt-3 flex gap-3 text-sm">
              <div className="flex-1">
                <div className="text-ink-muted">Owed to you</div>
                <div className="font-display text-lg text-forest tabular-nums">
                  {formatMoney(totals.owed, currency)}
                </div>
              </div>
              <div className="flex-1">
                <div className="text-ink-muted">You owe</div>
                <div className="font-display text-lg text-warmred tabular-nums">
                  {formatMoney(totals.owes, currency)}
                </div>
              </div>
            </div>
          </div>
        )}

        {groups.length === 0 ? (
          <EmptyState
            emoji="🧾"
            title="No groups yet"
            description="Make a group for your trip, household, or anything you split."
            action={
              <Button size="lg" onClick={() => setCreating(true)}>
                Create your first group
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {groups.map((g) => {
              const groupExpenses = (expenses ?? []).filter((e) => e.groupId === g.id);
              const groupSettlements = (settlements ?? []).filter((s) => s.groupId === g.id);
              const memberEmails = g.members.map((m) => m.email);
              const balances = computeNetBalances(groupExpenses, groupSettlements, memberEmails);
              const me = meEmail ? balances.get(meEmail) ?? 0 : 0;
              const memberDisplays = g.members.map((m) => {
                const p = profileByEmail.get(m.email);
                return {
                  name: p?.displayName || m.displayName || displayNameForEmail(m.email),
                  avatarColor: p?.avatarColor || colorForEmail(m.email),
                };
              });
              return (
                <li key={g.id}>
                  <Link
                    to={`/groups/${g.id}`}
                    className="card p-4 flex items-center gap-3 hover:bg-cream/50 active:scale-[0.995] transition"
                  >
                    <div className="h-12 w-12 rounded-2xl bg-cream flex items-center justify-center text-2xl">
                      {g.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{g.name}</div>
                      <div className="mt-1 flex items-center gap-2">
                        <AvatarStack people={memberDisplays} size={20} />
                        <span className="text-xs text-ink-muted">
                          {g.members.length} {g.members.length === 1 ? 'member' : 'members'}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      {me === 0 ? (
                        <div className="text-xs text-ink-muted">Settled</div>
                      ) : me > 0 ? (
                        <>
                          <div className="text-[10px] uppercase tracking-wider text-ink-muted">
                            You're owed
                          </div>
                          <div className="font-display text-forest font-semibold tabular-nums">
                            {formatMoneyAbs(me, g.currency)}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-[10px] uppercase tracking-wider text-ink-muted">
                            You owe
                          </div>
                          <div className="font-display text-warmred font-semibold tabular-nums">
                            {formatMoneyAbs(me, g.currency)}
                          </div>
                        </>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <Fab label="Create group" onClick={() => setCreating(true)} />
      <CreateGroupSheet open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
