import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../components/Header';
import {
  useAllExpenses,
  useAllSettlements,
  useGroups,
  usePrefs,
  useProfiles,
} from '../db/hooks';
import { EmptyState } from '../components/EmptyState';
import { groupByDay } from '../lib/format';
import { formatMoney } from '../lib/money';
import { CATEGORIES, displayNameForEmail } from '../types';
import { format } from 'date-fns';

export function ActivityScreen() {
  const expenses = useAllExpenses() ?? [];
  const settlements = useAllSettlements() ?? [];
  const groups = useGroups(true) ?? [];
  const profiles = useProfiles() ?? [];
  const prefs = usePrefs();

  const profileByEmail = useMemo(() => new Map(profiles.map((p) => [p.email, p])), [profiles]);
  const groupsById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const meEmail = prefs?.myEmail;

  const displayName = (email: string): string =>
    email === meEmail ? 'You' : profileByEmail.get(email)?.displayName || displayNameForEmail(email);

  type Item =
    | { kind: 'expense'; date: number; expense: (typeof expenses)[number] }
    | { kind: 'settlement'; date: number; settlement: (typeof settlements)[number] };
  const items: Item[] = [
    ...expenses.map((e) => ({ kind: 'expense' as const, date: e.date, expense: e })),
    ...settlements.map((s) => ({ kind: 'settlement' as const, date: s.date, settlement: s })),
  ].sort((a, b) => b.date - a.date);

  const grouped = groupByDay(items, (i) => i.date);

  return (
    <>
      <Header title="Activity" />
      <div className="scroll-area px-5 pt-3">
        {items.length === 0 ? (
          <EmptyState
            emoji="📜"
            title="Nothing here yet"
            description="Expenses and settlements across all groups will appear here."
          />
        ) : (
          <div className="space-y-6">
            {grouped.map((section) => (
              <div key={section.key}>
                <div className="text-xs uppercase tracking-wider text-ink-muted mb-2 px-1">
                  {section.label}
                </div>
                <ul className="space-y-2">
                  {section.items.map((it, i) => {
                    if (it.kind === 'expense') {
                      const e = it.expense;
                      const cat = CATEGORIES.find((c) => c.id === e.category) ?? CATEGORIES[0];
                      const group = groupsById.get(e.groupId);
                      const payers = e.paidBy.map((p) => displayName(p.email)).join(' & ');
                      return (
                        <li key={e.id}>
                          <Link
                            to={`/groups/${e.groupId}/edit/${e.id}`}
                            className="card p-3 flex items-center gap-3 active:scale-[0.998] transition"
                          >
                            <div className="h-10 w-10 rounded-2xl bg-cream flex items-center justify-center text-lg">
                              {cat.emoji}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{e.description}</div>
                              <div className="text-xs text-ink-muted truncate">
                                {group?.name ?? 'Group'} · {payers} paid {formatMoney(e.amount, e.currency)} ·{' '}
                                {format(e.date, 'h:mm a')}
                              </div>
                            </div>
                          </Link>
                        </li>
                      );
                    }
                    const s = it.settlement;
                    const group = groupsById.get(s.groupId);
                    return (
                      <li key={`s-${i}-${s.id}`}>
                        <Link
                          to={`/groups/${s.groupId}`}
                          className="card p-3 flex items-center gap-3 border-l-4 border-forest/40"
                        >
                          <div className="h-10 w-10 rounded-2xl bg-forest/10 text-forest flex items-center justify-center">
                            💸
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">
                              {displayName(s.fromEmail)} paid {displayName(s.toEmail)}
                            </div>
                            <div className="text-xs text-ink-muted">
                              {group?.name ?? 'Group'} · {formatMoney(s.amount, s.currency)} ·{' '}
                              {format(s.date, 'h:mm a')}
                            </div>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
