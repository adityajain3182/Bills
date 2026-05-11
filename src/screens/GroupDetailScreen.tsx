import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  useGroup,
  useGroupExpenses,
  useGroupSettlements,
  usePrefs,
  useProfiles,
} from '../db/hooks';
import { Header } from '../components/Header';
import { Fab } from '../components/Fab';
import { EmptyState } from '../components/EmptyState';
import { computeNetBalances, computePairwiseDebts } from '../lib/balances';
import { simplifyDebts } from '../lib/simplify';
import { formatMoney, formatMoneyAbs } from '../lib/money';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { Sheet } from '../components/Sheet';
import { AddMemberSheet } from '../components/AddMemberSheet';
import {
  archiveGroup,
  deleteExpense,
  deleteGroup,
  deleteSettlement,
} from '../db/queries';
import { useUI } from '../store/ui';
import { CATEGORIES, colorForEmail, displayNameForEmail } from '../types';
import type { Email } from '../types';
import { format } from 'date-fns';
import { groupByDay } from '../lib/format';
import { SwipeRow } from '../components/SwipeRow';

type Tab = 'expenses' | 'balances' | 'activity';

interface DisplayPerson {
  email: Email;
  name: string;
  avatarColor: string;
}

export function GroupDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const group = useGroup(id);
  const expenses = useGroupExpenses(id) ?? [];
  const settlements = useGroupSettlements(id) ?? [];
  const profiles = useProfiles() ?? [];
  const prefs = usePrefs();
  const navigate = useNavigate();
  const push = useUI((s) => s.pushToast);

  const [tab, setTab] = useState<Tab>('expenses');
  const [simplified, setSimplified] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingDeleteExpense, setPendingDeleteExpense] = useState<string | null>(null);
  const [pendingDeleteSettlement, setPendingDeleteSettlement] = useState<string | null>(null);

  const profileByEmail = useMemo(() => new Map(profiles.map((p) => [p.email, p])), [profiles]);

  const peopleMap: Map<Email, DisplayPerson> = useMemo(() => {
    if (!group) return new Map();
    const m = new Map<Email, DisplayPerson>();
    for (const member of group.members) {
      const p = profileByEmail.get(member.email);
      m.set(member.email, {
        email: member.email,
        name:
          p?.displayName ||
          member.displayName ||
          displayNameForEmail(member.email),
        avatarColor: p?.avatarColor || colorForEmail(member.email),
      });
    }
    return m;
  }, [group, profileByEmail]);

  const meEmail = prefs?.myEmail;

  if (group === undefined) return <Header title="Loading…" back />;
  if (!group) return <Navigate to="/groups" replace />;

  const currency = group.currency;
  const memberEmails = group.members.map((m) => m.email);
  const balances = computeNetBalances(expenses, settlements, memberEmails);
  const totalSpent = expenses.reduce((a, b) => a + b.amount, 0);
  const meBalance = meEmail ? balances.get(meEmail) ?? 0 : 0;

  return (
    <>
      <Header
        back
        title={
          <span>
            <span className="mr-2">{group.emoji}</span>
            {group.name}
          </span>
        }
        subtitle={
          totalSpent > 0
            ? `Total spent: ${formatMoney(totalSpent, currency)}`
            : 'No expenses yet'
        }
        right={
          <button
            onClick={() => setMenuOpen(true)}
            className="h-10 w-10 rounded-full hover:bg-cream flex items-center justify-center text-ink"
            aria-label="Group menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="19" cy="12" r="1.6" />
            </svg>
          </button>
        }
      />

      <div className="px-5 pt-3">
        <div className="card p-4 mb-4">
          <div className="text-xs text-ink-muted mb-1">Your balance</div>
          <div className="font-display text-3xl font-semibold tabular-nums">
            {meBalance === 0
              ? 'Settled up'
              : meBalance > 0
                ? `You're owed ${formatMoneyAbs(meBalance, currency)}`
                : `You owe ${formatMoneyAbs(meBalance, currency)}`}
          </div>
        </div>

        <div className="flex gap-1 p-1 bg-cream rounded-2xl mb-4 border border-line/60">
          {(['expenses', 'balances', 'activity'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium capitalize transition ${
                tab === t ? 'bg-surface shadow-card text-ink' : 'text-ink-muted'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="scroll-area px-5">
        {tab === 'expenses' && (
          <ExpensesTab
            expenses={expenses}
            currency={currency}
            peopleMap={peopleMap}
            meEmail={meEmail}
            onEdit={(eid) => navigate(`/groups/${group.id}/edit/${eid}`)}
            onDelete={setPendingDeleteExpense}
          />
        )}
        {tab === 'balances' && (
          <BalancesTab
            simplified={simplified}
            setSimplified={setSimplified}
            balances={balances}
            expenses={expenses}
            settlements={settlements}
            peopleMap={peopleMap}
            currency={currency}
            meEmail={meEmail}
            onSettle={(fromE, toE, amount) =>
              navigate(
                `/groups/${group.id}/settle?from=${encodeURIComponent(fromE)}&to=${encodeURIComponent(toE)}&amount=${amount}`,
              )
            }
          />
        )}
        {tab === 'activity' && (
          <ActivityTab
            expenses={expenses}
            settlements={settlements}
            peopleMap={peopleMap}
            currency={currency}
            meEmail={meEmail}
            onDeleteExpense={setPendingDeleteExpense}
            onDeleteSettlement={setPendingDeleteSettlement}
            onEditExpense={(eid) => navigate(`/groups/${group.id}/edit/${eid}`)}
          />
        )}
      </div>

      <Fab label="Add expense" onClick={() => navigate(`/groups/${group.id}/add`)} />

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Group options">
        <div className="space-y-2 pb-4">
          {meEmail === group.ownerEmail && (
            <Button
              full
              variant="secondary"
              onClick={() => {
                setMenuOpen(false);
                setAddMemberOpen(true);
              }}
            >
              Add member
            </Button>
          )}
          <Button
            full
            variant="secondary"
            onClick={async () => {
              await archiveGroup(group.id, !group.archived);
              push(group.archived ? 'Group unarchived' : 'Group archived', 'success');
              setMenuOpen(false);
            }}
          >
            {group.archived ? 'Unarchive group' : 'Archive group'}
          </Button>
          {meEmail === group.ownerEmail && (
            <Button
              full
              variant="danger"
              onClick={() => {
                setMenuOpen(false);
                setConfirmDelete(true);
              }}
            >
              Delete group
            </Button>
          )}
        </div>
      </Sheet>

      <AddMemberSheet
        open={addMemberOpen}
        onClose={() => setAddMemberOpen(false)}
        groupId={group.id}
        groupName={group.name}
        existingEmails={memberEmails}
      />

      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this group?"
        description="Expenses and settlements will be permanently removed."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          await deleteGroup(group.id);
          push('Group deleted', 'success');
          navigate('/groups');
        }}
      />

      <ConfirmSheet
        open={!!pendingDeleteExpense}
        onClose={() => setPendingDeleteExpense(null)}
        title="Delete this expense?"
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (pendingDeleteExpense) await deleteExpense(pendingDeleteExpense);
          push('Expense deleted', 'success');
        }}
      />

      <ConfirmSheet
        open={!!pendingDeleteSettlement}
        onClose={() => setPendingDeleteSettlement(null)}
        title="Delete this settlement?"
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (pendingDeleteSettlement) await deleteSettlement(pendingDeleteSettlement);
          push('Settlement deleted', 'success');
        }}
      />
    </>
  );
}

function ExpensesTab({
  expenses,
  currency,
  peopleMap,
  meEmail,
  onEdit,
  onDelete,
}: {
  expenses: ReturnType<typeof useGroupExpenses> extends infer T ? Exclude<T, undefined> : never;
  currency: string;
  peopleMap: Map<Email, DisplayPerson>;
  meEmail: Email | undefined;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (expenses.length === 0) {
    return (
      <EmptyState
        emoji="📥"
        title="No expenses yet"
        description="Tap the + button to log your first one."
      />
    );
  }
  const grouped = groupByDay(expenses, (e) => e.date);
  return (
    <div className="space-y-6 pt-1">
      {grouped.map((section) => (
        <div key={section.key}>
          <div className="text-xs uppercase tracking-wider text-ink-muted mb-2 px-1">
            {section.label}
          </div>
          <ul className="space-y-2">
            {section.items.map((e) => {
              const cat = CATEGORIES.find((c) => c.id === e.category) ?? CATEGORIES[0];
              const payerNames = e.paidBy
                .map((p) => peopleMap.get(p.email)?.name ?? displayNameForEmail(p.email))
                .join(', ');
              const myShare = meEmail ? e.splits.find((s) => s.email === meEmail)?.amount ?? 0 : 0;
              const myPaid = meEmail ? e.paidBy.find((p) => p.email === meEmail)?.amount ?? 0 : 0;
              const myNet = myPaid - myShare;
              return (
                <li key={e.id}>
                  <SwipeRow onDelete={() => onDelete(e.id)}>
                    <button
                      onClick={() => onEdit(e.id)}
                      className="w-full text-left card p-3 flex items-center gap-3 active:scale-[0.998] transition"
                    >
                      <div className="h-11 w-11 rounded-2xl bg-cream flex items-center justify-center text-xl">
                        {cat.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{e.description}</div>
                        <div className="text-xs text-ink-muted truncate">
                          {payerNames} paid {formatMoney(e.amount, currency)}
                        </div>
                      </div>
                      <div className="text-right">
                        {meEmail ? (
                          myNet === 0 ? (
                            <div className="text-xs text-ink-muted">not involved</div>
                          ) : myNet > 0 ? (
                            <>
                              <div className="text-[10px] uppercase tracking-wider text-forest">lent</div>
                              <div className="font-display text-forest font-semibold tabular-nums">
                                {formatMoneyAbs(myNet, currency)}
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="text-[10px] uppercase tracking-wider text-warmred">owe</div>
                              <div className="font-display text-warmred font-semibold tabular-nums">
                                {formatMoneyAbs(myNet, currency)}
                              </div>
                            </>
                          )
                        ) : null}
                      </div>
                    </button>
                  </SwipeRow>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function BalancesTab({
  simplified,
  setSimplified,
  balances,
  expenses,
  settlements,
  peopleMap,
  currency,
  meEmail,
  onSettle,
}: {
  simplified: boolean;
  setSimplified: (v: boolean) => void;
  balances: Map<Email, number>;
  expenses: ReturnType<typeof useGroupExpenses> extends infer T ? Exclude<T, undefined> : never;
  settlements: ReturnType<typeof useGroupSettlements> extends infer T ? Exclude<T, undefined> : never;
  peopleMap: Map<Email, DisplayPerson>;
  currency: string;
  meEmail: Email | undefined;
  onSettle: (fromEmail: Email, toEmail: Email, amount: number) => void;
}) {
  const debts = simplified ? simplifyDebts(balances) : computePairwiseDebts(expenses, settlements);
  return (
    <div className="pb-2">
      <div className="card p-4 mb-4">
        <div className="text-xs uppercase tracking-wider text-ink-muted mb-2">
          Net balances
        </div>
        <ul className="space-y-2">
          {[...balances.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([email, bal]) => {
              const p = peopleMap.get(email);
              if (!p) return null;
              return (
                <li key={email} className="flex items-center gap-3">
                  <Avatar name={p.name} color={p.avatarColor} size={32} />
                  <div className="flex-1 truncate">
                    {p.name}
                    {email === meEmail && <span className="text-ink-muted text-xs"> (you)</span>}
                  </div>
                  <div
                    className={`font-display tabular-nums ${
                      bal > 0 ? 'text-forest' : bal < 0 ? 'text-warmred' : 'text-ink-muted'
                    }`}
                  >
                    {bal === 0 ? '—' : bal > 0 ? `+${formatMoneyAbs(bal, currency)}` : `−${formatMoneyAbs(bal, currency)}`}
                  </div>
                </li>
              );
            })}
        </ul>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-wider text-ink-muted">
          {simplified ? 'Simplified' : 'Who owes whom'}
        </div>
        <button
          onClick={() => setSimplified(!simplified)}
          className="text-xs text-forest font-medium px-2 py-1 rounded-full hover:bg-forest/8"
        >
          {simplified ? 'Show all debts' : 'Simplify'}
        </button>
      </div>

      {debts.length === 0 ? (
        <div className="card p-6 text-center">
          <div className="text-4xl mb-2">✨</div>
          <div className="font-medium">Everyone's square</div>
        </div>
      ) : (
        <ul className="space-y-2">
          {debts.map((d, i) => {
            const from = peopleMap.get(d.from);
            const to = peopleMap.get(d.to);
            if (!from || !to) return null;
            const involvesMe = meEmail && (d.from === meEmail || d.to === meEmail);
            return (
              <li key={i} className="card p-3 flex items-center gap-3">
                <div className="flex items-center -space-x-2">
                  <Avatar name={from.name} color={from.avatarColor} size={32} ring />
                  <Avatar name={to.name} color={to.avatarColor} size={32} ring />
                </div>
                <div className="flex-1 text-sm">
                  <span className="font-medium">{d.from === meEmail ? 'You' : from.name}</span>{' '}
                  <span className="text-ink-muted">owe{d.from === meEmail ? '' : 's'}</span>{' '}
                  <span className="font-medium">{d.to === meEmail ? 'you' : to.name}</span>
                  <div className="font-display text-lg tabular-nums">
                    {formatMoney(d.amount, currency)}
                  </div>
                </div>
                {involvesMe && (
                  <Button
                    size="sm"
                    variant={d.from === meEmail ? 'primary' : 'secondary'}
                    onClick={() => onSettle(d.from, d.to, d.amount)}
                  >
                    Settle
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ActivityTab({
  expenses,
  settlements,
  peopleMap,
  currency,
  meEmail,
  onDeleteExpense,
  onDeleteSettlement,
  onEditExpense,
}: {
  expenses: ReturnType<typeof useGroupExpenses> extends infer T ? Exclude<T, undefined> : never;
  settlements: ReturnType<typeof useGroupSettlements> extends infer T ? Exclude<T, undefined> : never;
  peopleMap: Map<Email, DisplayPerson>;
  currency: string;
  meEmail: Email | undefined;
  onDeleteExpense: (id: string) => void;
  onDeleteSettlement: (id: string) => void;
  onEditExpense: (id: string) => void;
}) {
  type Item =
    | { kind: 'expense'; date: number; expense: (typeof expenses)[number] }
    | { kind: 'settlement'; date: number; settlement: (typeof settlements)[number] };
  const items: Item[] = [
    ...expenses.map((e) => ({ kind: 'expense' as const, date: e.date, expense: e })),
    ...settlements.map((s) => ({ kind: 'settlement' as const, date: s.date, settlement: s })),
  ].sort((a, b) => b.date - a.date);

  if (items.length === 0) {
    return <EmptyState emoji="📜" title="No activity yet" description="Expenses and settlements will appear here." />;
  }
  const grouped = groupByDay(items, (i) => i.date);

  return (
    <div className="space-y-6">
      {grouped.map((section) => (
        <div key={section.key}>
          <div className="text-xs uppercase tracking-wider text-ink-muted mb-2 px-1">
            {section.label}
          </div>
          <ul className="space-y-2">
            {section.items.map((item, i) => {
              if (item.kind === 'expense') {
                const e = item.expense;
                const cat = CATEGORIES.find((c) => c.id === e.category) ?? CATEGORIES[0];
                const payerNames = e.paidBy
                  .map((p) =>
                    p.email === meEmail
                      ? 'You'
                      : peopleMap.get(p.email)?.name ?? displayNameForEmail(p.email),
                  )
                  .join(' & ');
                return (
                  <li key={e.id}>
                    <SwipeRow onDelete={() => onDeleteExpense(e.id)}>
                      <button
                        onClick={() => onEditExpense(e.id)}
                        className="w-full text-left card p-3 flex items-center gap-3"
                      >
                        <div className="h-10 w-10 rounded-2xl bg-cream flex items-center justify-center text-lg">
                          {cat.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{e.description}</div>
                          <div className="text-xs text-ink-muted truncate">
                            {payerNames} paid {formatMoney(e.amount, currency)} · {format(e.date, 'h:mm a')}
                          </div>
                        </div>
                      </button>
                    </SwipeRow>
                  </li>
                );
              }
              const s = item.settlement;
              const from = peopleMap.get(s.fromEmail);
              const to = peopleMap.get(s.toEmail);
              return (
                <li key={`s-${i}-${s.id}`}>
                  <SwipeRow onDelete={() => onDeleteSettlement(s.id)}>
                    <div className="card p-3 flex items-center gap-3 border-l-4 border-forest/40">
                      <div className="h-10 w-10 rounded-2xl bg-forest/10 text-forest flex items-center justify-center">
                        💸
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {(s.fromEmail === meEmail ? 'You' : from?.name) ?? '?'} paid{' '}
                          {(s.toEmail === meEmail ? 'you' : to?.name) ?? '?'}
                        </div>
                        <div className="text-xs text-ink-muted">
                          {formatMoney(s.amount, currency)} · {format(s.date, 'h:mm a')}
                          {s.note ? ` · ${s.note}` : ''}
                        </div>
                      </div>
                    </div>
                  </SwipeRow>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
