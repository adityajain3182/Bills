import { useMemo } from 'react';
import { Header } from '../components/Header';
import {
  useAllExpenses,
  useAllSettlements,
  useGroups,
  usePrefs,
  useProfiles,
} from '../db/hooks';
import { Avatar } from '../components/Avatar';
import { computeNetBalances } from '../lib/balances';
import { formatMoneyAbs } from '../lib/money';
import { EmptyState } from '../components/EmptyState';
import { colorForEmail, displayNameForEmail, type Email } from '../types';

export function FriendsScreen() {
  const groups = useGroups(true) ?? [];
  const expenses = useAllExpenses() ?? [];
  const settlements = useAllSettlements() ?? [];
  const profiles = useProfiles() ?? [];
  const prefs = usePrefs();

  const profileByEmail = useMemo(() => new Map(profiles.map((p) => [p.email, p])), [profiles]);

  // Aggregate the net balance the user has with each friend across all groups.
  const friendBalances = useMemo(() => {
    const map = new Map<Email, number>();
    const meEmail = prefs?.myEmail;
    if (!meEmail) return map;
    for (const g of groups) {
      const groupExp = expenses.filter((e) => e.groupId === g.id);
      const groupSet = settlements.filter((s) => s.groupId === g.id);
      const memberEmails = g.members.map((m) => m.email);
      const balances = computeNetBalances(groupExp, groupSet, memberEmails);
      const meBal = balances.get(meEmail) ?? 0;
      if (meBal === 0) continue;
      const creditors: { email: Email; amount: number }[] = [];
      const debtors: { email: Email; amount: number }[] = [];
      for (const [email, bal] of balances) {
        if (email === meEmail) continue;
        if (bal > 0) creditors.push({ email, amount: bal });
        else if (bal < 0) debtors.push({ email, amount: -bal });
      }
      if (meBal > 0) {
        const total = debtors.reduce((a, b) => a + b.amount, 0);
        for (const d of debtors) {
          if (total === 0) continue;
          map.set(d.email, (map.get(d.email) ?? 0) + Math.round((d.amount / total) * meBal));
        }
      } else {
        const total = creditors.reduce((a, b) => a + b.amount, 0);
        for (const c of creditors) {
          if (total === 0) continue;
          map.set(c.email, (map.get(c.email) ?? 0) - Math.round((c.amount / total) * -meBal));
        }
      }
    }
    return map;
  }, [groups, expenses, settlements, prefs?.myEmail]);

  // Distinct friend emails across all groups, excluding me
  const friendEmails = useMemo(() => {
    const set = new Set<Email>();
    for (const g of groups) for (const m of g.members) set.add(m.email);
    if (prefs?.myEmail) set.delete(prefs.myEmail);
    return [...set];
  }, [groups, prefs?.myEmail]);

  const currency = prefs?.defaultCurrency ?? 'USD';

  return (
    <>
      <Header title="Friends" />
      <div className="scroll-area px-5 pt-3">
        {friendEmails.length === 0 ? (
          <EmptyState
            emoji="👥"
            title="No friends yet"
            description="Add people to a group to see them here."
          />
        ) : (
          <ul className="space-y-2">
            {friendEmails.map((email) => {
              const p = profileByEmail.get(email);
              const name = p?.displayName || displayNameForEmail(email);
              const bal = friendBalances.get(email) ?? 0;
              return (
                <li key={email} className="card p-3 flex items-center gap-3">
                  <Avatar name={name} color={p?.avatarColor || colorForEmail(email)} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{name}</div>
                    <div className="text-xs text-ink-muted truncate">
                      {email}
                      {bal !== 0 && ' · '}
                      {bal === 0
                        ? ''
                        : bal > 0
                          ? `owes you ~${formatMoneyAbs(bal, currency)}`
                          : `you owe ~${formatMoneyAbs(bal, currency)}`}
                    </div>
                  </div>
                  {bal !== 0 && (
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
          Friends are everyone you've added to a group. Balances are rolled up across all
          groups, in your default currency.
        </p>
      </div>
    </>
  );
}
