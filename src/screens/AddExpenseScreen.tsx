import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useGroup, useGroupExpenses, usePeople, usePrefs } from '../db/hooks';
import { Header } from '../components/Header';
import { Button } from '../components/Button';
import { Avatar } from '../components/Avatar';
import { AmountInput } from '../components/AmountInput';
import { Sheet } from '../components/Sheet';
import { computeSplits } from '../lib/splits';
import { formatMoney, fromCents, toCents } from '../lib/money';
import { saveExpense } from '../db/queries';
import { useUI } from '../store/ui';
import { CATEGORIES, type SplitConfig, type SplitMethod } from '../types';
import { format } from 'date-fns';

export function AddExpenseScreen() {
  const { id, expenseId } = useParams<{ id: string; expenseId?: string }>();
  const group = useGroup(id);
  const people = usePeople() ?? [];
  const prefs = usePrefs();
  const navigate = useNavigate();
  const push = useUI((s) => s.pushToast);
  const existingExpenses = useGroupExpenses(id) ?? [];
  const editing = expenseId
    ? existingExpenses.find((e) => e.id === expenseId)
    : undefined;

  const meId = prefs?.mePersonId ?? null;

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(0); // cents
  const [date, setDate] = useState<number>(() => Date.now());
  const [category, setCategory] = useState('general');
  const [notes, setNotes] = useState('');
  const [payerMode, setPayerMode] = useState<'single' | 'multiple'>('single');
  const [singlePayer, setSinglePayer] = useState<string | null>(null);
  const [payerAmounts, setPayerAmounts] = useState<Record<string, number>>({});
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('equal');
  const [splitConfig, setSplitConfig] = useState<SplitConfig>({ includedIds: [] });
  const [splitSheet, setSplitSheet] = useState(false);
  const [saving, setSaving] = useState(false);

  // initialize from group / editing
  useEffect(() => {
    if (!group) return;
    if (editing) {
      setDescription(editing.description);
      setAmount(editing.amount);
      setDate(editing.date);
      setCategory(editing.category);
      setNotes(editing.notes ?? '');
      if (editing.paidBy.length === 1) {
        setPayerMode('single');
        setSinglePayer(editing.paidBy[0].personId);
      } else {
        setPayerMode('multiple');
        const map: Record<string, number> = {};
        for (const p of editing.paidBy) map[p.personId] = p.amount;
        setPayerAmounts(map);
      }
      setSplitMethod(editing.splitMethod);
      setSplitConfig(editing.splitConfig);
    } else {
      setSinglePayer(meId);
      setSplitConfig({ includedIds: group.memberIds });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id, editing?.id, meId]);

  if (group === undefined) return <Header title="Loading…" back />;
  if (!group) return <Navigate to="/groups" replace />;

  const memberIds = group.memberIds;
  const currency = group.currency;

  const splitResult = computeSplits({
    totalCents: amount,
    memberIds,
    method: splitMethod,
    config: splitConfig,
  });

  // Determine paidBy array
  const paidBy =
    payerMode === 'single'
      ? singlePayer
        ? [{ personId: singlePayer, amount }]
        : []
      : Object.entries(payerAmounts)
          .filter(([, v]) => v > 0)
          .map(([personId, amount]) => ({ personId, amount }));
  const paidTotal = paidBy.reduce((a, b) => a + b.amount, 0);
  const payerError =
    paidBy.length === 0
      ? 'Select who paid'
      : paidTotal !== amount
        ? `Paid amounts add up to ${formatMoney(paidTotal, currency)} (need ${formatMoney(
            amount,
            currency,
          )})`
        : null;

  const canSave =
    !!description.trim() &&
    amount > 0 &&
    !payerError &&
    splitResult.ok &&
    !saving;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await saveExpense({
        id: editing?.id,
        groupId: group.id,
        description,
        amount,
        currency,
        date,
        paidBy,
        splits: splitResult.shares,
        splitMethod,
        splitConfig,
        category,
        notes,
      });
      push(editing ? 'Expense updated' : 'Expense added', 'success');
      navigate(`/groups/${group.id}`);
    } catch (e) {
      push((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const splitLabel: Record<SplitMethod, string> = {
    equal: 'Equally',
    exact: 'By exact amount',
    percent: 'By percentage',
    shares: 'By share',
  };

  return (
    <>
      <Header
        back
        title={editing ? 'Edit expense' : 'Add expense'}
        right={
          <button
            onClick={submit}
            disabled={!canSave}
            className="text-forest font-semibold px-3 disabled:opacity-40"
          >
            Save
          </button>
        }
      />
      <div className="scroll-area px-5 pt-3 pb-6">
        <div className="card p-5 mb-4">
          <input
            type="text"
            className="w-full bg-transparent outline-none font-display text-2xl font-medium placeholder:text-ink-soft no-tap-zoom"
            placeholder="What was it for?"
            value={description}
            autoFocus
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="border-t border-line/60 my-4" />
          <AmountInput
            value={amount}
            onChange={setAmount}
            currency={currency}
            size="lg"
            placeholder="0.00"
          />
        </div>

        <Section label="Paid by">
          <button
            onClick={() => {
              if (payerMode === 'single') {
                setPayerMode('multiple');
                if (singlePayer) setPayerAmounts({ [singlePayer]: amount });
              } else {
                setPayerMode('single');
                setSinglePayer(
                  Object.entries(payerAmounts).find(([, v]) => v > 0)?.[0] ?? meId,
                );
              }
            }}
            className="w-full text-left p-3 bg-cream rounded-xl flex items-center justify-between"
          >
            <span className="text-sm">
              {payerMode === 'single' ? 'Single payer' : 'Multiple payers'}
            </span>
            <span className="text-xs text-forest font-medium">
              {payerMode === 'single' ? 'Use multiple' : 'Use single'}
            </span>
          </button>

          {payerMode === 'single' ? (
            <ul className="mt-2 space-y-1">
              {memberIds.map((mid) => {
                const p = peopleById.get(mid);
                if (!p) return null;
                const isMe = mid === meId;
                return (
                  <li key={mid}>
                    <button
                      onClick={() => setSinglePayer(mid)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition ${
                        singlePayer === mid
                          ? 'border-forest bg-forest/8'
                          : 'border-transparent hover:bg-cream'
                      }`}
                    >
                      <Avatar name={p.name} color={p.avatarColor} size={32} />
                      <span className="flex-1 text-left">
                        {p.name}
                        {isMe && <span className="text-ink-muted text-xs"> (you)</span>}
                      </span>
                      {singlePayer === mid && <span className="text-forest">✓</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="mt-2 space-y-2">
              {memberIds.map((mid) => {
                const p = peopleById.get(mid);
                if (!p) return null;
                const v = payerAmounts[mid] ?? 0;
                return (
                  <li
                    key={mid}
                    className="flex items-center gap-3 p-2 rounded-xl bg-cream"
                  >
                    <Avatar name={p.name} color={p.avatarColor} size={28} />
                    <span className="flex-1 text-sm">{p.name}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={v ? fromCents(v).toString() : ''}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/[^0-9.]/g, '');
                        const cents = cleaned ? toCents(Number(cleaned) || 0) : 0;
                        setPayerAmounts({ ...payerAmounts, [mid]: cents });
                      }}
                      className="w-24 bg-surface rounded-lg px-3 py-2 text-right outline-none focus:ring-2 ring-forest/30 no-tap-zoom"
                      placeholder="0.00"
                    />
                  </li>
                );
              })}
              <li className="text-xs text-ink-muted text-right pr-1">
                {formatMoney(paidTotal, currency)} of {formatMoney(amount, currency)}
              </li>
            </ul>
          )}
          {payerError && (
            <div className="mt-2 text-xs text-warmred">{payerError}</div>
          )}
        </Section>

        <Section label="Split">
          <button
            onClick={() => setSplitSheet(true)}
            className="w-full text-left p-3 bg-cream rounded-xl flex items-center justify-between"
          >
            <span className="text-sm">{splitLabel[splitMethod]}</span>
            <span className="text-xs text-forest font-medium">Change</span>
          </button>
          <div className="mt-2 text-xs text-ink-muted">
            {splitResult.ok ? (
              <SplitPreview
                shares={splitResult.shares}
                peopleById={peopleById}
                currency={currency}
              />
            ) : (
              <div className="text-warmred">{splitResult.error}</div>
            )}
          </div>
        </Section>

        <Section label="Details">
          <div className="space-y-2">
            <div>
              <div className="label mb-1">Date</div>
              <input
                type="date"
                className="input"
                value={format(date, 'yyyy-MM-dd')}
                onChange={(e) => {
                  const parsed = new Date(e.target.value);
                  if (!isNaN(parsed.getTime())) setDate(parsed.getTime());
                }}
              />
            </div>
            <div>
              <div className="label mb-1">Category</div>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCategory(c.id)}
                    className={`pill shrink-0 ${
                      category === c.id
                        ? 'bg-forest text-cream'
                        : 'bg-cream text-ink-muted'
                    }`}
                  >
                    <span>{c.emoji}</span>
                    <span>{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="label mb-1">Notes</div>
              <textarea
                className="input min-h-[80px]"
                placeholder="Optional"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </Section>

        <Button size="lg" full onClick={submit} disabled={!canSave}>
          {editing ? 'Save changes' : 'Add expense'}
        </Button>
      </div>

      <Sheet
        open={splitSheet}
        onClose={() => setSplitSheet(false)}
        title="How to split"
        large
      >
        <SplitPicker
          memberIds={memberIds}
          peopleById={peopleById}
          totalCents={amount}
          currency={currency}
          method={splitMethod}
          config={splitConfig}
          onChange={(m, c) => {
            setSplitMethod(m);
            setSplitConfig(c);
          }}
          onDone={() => setSplitSheet(false)}
        />
      </Sheet>
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <div className="label px-1 mb-2">{label}</div>
      <div className="card p-3">{children}</div>
    </section>
  );
}

function SplitPreview({
  shares,
  peopleById,
  currency,
}: {
  shares: { personId: string; amount: number }[];
  peopleById: Map<string, { name: string; avatarColor: string }>;
  currency: string;
}) {
  return (
    <ul className="space-y-1 mt-2">
      {shares.map((s) => {
        const p = peopleById.get(s.personId);
        if (!p) return null;
        return (
          <li key={s.personId} className="flex items-center gap-2 text-sm">
            <Avatar name={p.name} color={p.avatarColor} size={20} />
            <span className="flex-1 text-ink">{p.name}</span>
            <span className="font-medium text-ink tabular-nums">
              {formatMoney(s.amount, currency)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function SplitPicker({
  memberIds,
  peopleById,
  totalCents,
  currency,
  method,
  config,
  onChange,
  onDone,
}: {
  memberIds: string[];
  peopleById: Map<string, { name: string; avatarColor: string }>;
  totalCents: number;
  currency: string;
  method: SplitMethod;
  config: SplitConfig;
  onChange: (m: SplitMethod, c: SplitConfig) => void;
  onDone: () => void;
}) {
  // Normalize config based on selected method so the picker UI is correct
  useEffect(() => {
    if (method === 'equal' && !('includedIds' in config)) {
      onChange('equal', { includedIds: memberIds });
    } else if (method === 'exact' && !('amounts' in config)) {
      onChange('exact', { amounts: {} });
    } else if (method === 'percent' && !('percents' in config)) {
      onChange('percent', { percents: {} });
    } else if (method === 'shares' && !('shares' in config)) {
      onChange('shares', { shares: Object.fromEntries(memberIds.map((id) => [id, 1])) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method]);

  const result = computeSplits({ totalCents, memberIds, method, config });

  return (
    <div className="space-y-4 pb-4">
      <div className="grid grid-cols-4 gap-2">
        {(['equal', 'exact', 'percent', 'shares'] as const).map((m) => (
          <button
            key={m}
            onClick={() => onChange(m, config)}
            className={`py-2 rounded-xl text-xs font-medium capitalize transition ${
              method === m ? 'bg-forest text-cream' : 'bg-cream text-ink-muted'
            }`}
          >
            {m === 'equal' ? '=' : m === 'exact' ? '$' : m === 'percent' ? '%' : '⚖'}
            <div className="mt-1">{m}</div>
          </button>
        ))}
      </div>

      {method === 'equal' && (
        <EqualPicker
          memberIds={memberIds}
          peopleById={peopleById}
          totalCents={totalCents}
          currency={currency}
          includedIds={(config as { includedIds: string[] }).includedIds ?? memberIds}
          onChange={(ids) => onChange('equal', { includedIds: ids })}
        />
      )}
      {method === 'exact' && (
        <ExactPicker
          memberIds={memberIds}
          peopleById={peopleById}
          totalCents={totalCents}
          currency={currency}
          amounts={(config as { amounts: Record<string, number> }).amounts ?? {}}
          onChange={(a) => onChange('exact', { amounts: a })}
        />
      )}
      {method === 'percent' && (
        <PercentPicker
          memberIds={memberIds}
          peopleById={peopleById}
          percents={(config as { percents: Record<string, number> }).percents ?? {}}
          onChange={(p) => onChange('percent', { percents: p })}
        />
      )}
      {method === 'shares' && (
        <SharesPicker
          memberIds={memberIds}
          peopleById={peopleById}
          totalCents={totalCents}
          currency={currency}
          shares={(config as { shares: Record<string, number> }).shares ?? {}}
          onChange={(s) => onChange('shares', { shares: s })}
        />
      )}

      <div
        className={`text-sm rounded-xl p-3 ${
          result.ok ? 'bg-forest/8 text-forest' : 'bg-warmred/10 text-warmred'
        }`}
      >
        {result.ok ? 'Splits reconcile.' : result.error}
      </div>

      <Button full size="lg" onClick={onDone} disabled={!result.ok}>
        Done
      </Button>
    </div>
  );
}

function EqualPicker({
  memberIds,
  peopleById,
  totalCents,
  currency,
  includedIds,
  onChange,
}: {
  memberIds: string[];
  peopleById: Map<string, { name: string; avatarColor: string }>;
  totalCents: number;
  currency: string;
  includedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) =>
    onChange(includedIds.includes(id) ? includedIds.filter((x) => x !== id) : [...includedIds, id]);

  const result = computeSplits({
    totalCents,
    memberIds,
    method: 'equal',
    config: { includedIds },
  });

  return (
    <ul className="space-y-2">
      {memberIds.map((mid) => {
        const p = peopleById.get(mid);
        if (!p) return null;
        const checked = includedIds.includes(mid);
        const share = result.shares.find((s) => s.personId === mid)?.amount ?? 0;
        return (
          <li key={mid}>
            <button
              onClick={() => toggle(mid)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border transition ${
                checked ? 'border-forest bg-forest/8' : 'border-transparent bg-cream'
              }`}
            >
              <span
                className={`h-6 w-6 rounded-md border-2 flex items-center justify-center ${
                  checked ? 'bg-forest border-forest text-cream' : 'border-line'
                }`}
              >
                {checked && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
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
              <Avatar name={p.name} color={p.avatarColor} size={28} />
              <span className="flex-1 text-left">{p.name}</span>
              {checked && (
                <span className="text-sm tabular-nums font-medium">
                  {formatMoney(share, currency)}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ExactPicker({
  memberIds,
  peopleById,
  totalCents,
  currency,
  amounts,
  onChange,
}: {
  memberIds: string[];
  peopleById: Map<string, { name: string; avatarColor: string }>;
  totalCents: number;
  currency: string;
  amounts: Record<string, number>;
  onChange: (a: Record<string, number>) => void;
}) {
  const sum = Object.values(amounts).reduce((a, b) => a + (b || 0), 0);
  const diff = totalCents - sum;
  return (
    <div>
      <ul className="space-y-2">
        {memberIds.map((mid) => {
          const p = peopleById.get(mid);
          if (!p) return null;
          const v = amounts[mid] ?? 0;
          return (
            <li
              key={mid}
              className="flex items-center gap-3 p-2 rounded-xl bg-cream"
            >
              <Avatar name={p.name} color={p.avatarColor} size={28} />
              <span className="flex-1 text-sm">{p.name}</span>
              <input
                type="text"
                inputMode="decimal"
                value={v ? fromCents(v).toString() : ''}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^0-9.]/g, '');
                  const cents = cleaned ? toCents(Number(cleaned) || 0) : 0;
                  onChange({ ...amounts, [mid]: cents });
                }}
                className="w-24 bg-surface rounded-lg px-3 py-2 text-right outline-none focus:ring-2 ring-forest/30 no-tap-zoom"
                placeholder="0.00"
              />
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex justify-between text-xs px-1">
        <span className="text-ink-muted">
          {formatMoney(sum, currency)} of {formatMoney(totalCents, currency)}
        </span>
        <span className={diff === 0 ? 'text-forest' : 'text-warmred'}>
          {diff === 0 ? 'Reconciled' : `Off by ${formatMoney(Math.abs(diff), currency)}`}
        </span>
      </div>
    </div>
  );
}

function PercentPicker({
  memberIds,
  peopleById,
  percents,
  onChange,
}: {
  memberIds: string[];
  peopleById: Map<string, { name: string; avatarColor: string }>;
  percents: Record<string, number>;
  onChange: (p: Record<string, number>) => void;
}) {
  const sum = Object.values(percents).reduce((a, b) => a + (b || 0), 0);
  const diff = 100 - sum;
  return (
    <div>
      <ul className="space-y-2">
        {memberIds.map((mid) => {
          const p = peopleById.get(mid);
          if (!p) return null;
          const v = percents[mid] ?? 0;
          return (
            <li
              key={mid}
              className="flex items-center gap-3 p-2 rounded-xl bg-cream"
            >
              <Avatar name={p.name} color={p.avatarColor} size={28} />
              <span className="flex-1 text-sm">{p.name}</span>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  inputMode="decimal"
                  value={v ? v.toString() : ''}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/[^0-9.]/g, '');
                    const num = cleaned ? Number(cleaned) || 0 : 0;
                    onChange({ ...percents, [mid]: num });
                  }}
                  className="w-20 bg-surface rounded-lg px-3 py-2 text-right outline-none focus:ring-2 ring-forest/30 no-tap-zoom"
                  placeholder="0"
                />
                <span className="text-sm text-ink-muted">%</span>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex justify-between text-xs px-1">
        <span className="text-ink-muted">{sum.toFixed(2)} of 100</span>
        <span className={Math.abs(diff) < 0.01 ? 'text-forest' : 'text-warmred'}>
          {Math.abs(diff) < 0.01 ? 'Reconciled' : `${diff.toFixed(2)} remaining`}
        </span>
      </div>
    </div>
  );
}

function SharesPicker({
  memberIds,
  peopleById,
  totalCents,
  currency,
  shares,
  onChange,
}: {
  memberIds: string[];
  peopleById: Map<string, { name: string; avatarColor: string }>;
  totalCents: number;
  currency: string;
  shares: Record<string, number>;
  onChange: (s: Record<string, number>) => void;
}) {
  const result = computeSplits({
    totalCents,
    memberIds,
    method: 'shares',
    config: { shares },
  });
  return (
    <ul className="space-y-2">
      {memberIds.map((mid) => {
        const p = peopleById.get(mid);
        if (!p) return null;
        const v = shares[mid] ?? 0;
        const share = result.shares.find((s) => s.personId === mid)?.amount ?? 0;
        return (
          <li key={mid} className="flex items-center gap-3 p-2 rounded-xl bg-cream">
            <Avatar name={p.name} color={p.avatarColor} size={28} />
            <span className="flex-1 text-sm">{p.name}</span>
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-surface rounded-lg overflow-hidden">
                <button
                  onClick={() => onChange({ ...shares, [mid]: Math.max(0, v - 1) })}
                  className="h-8 w-8 text-lg text-ink-muted hover:bg-cream"
                  aria-label="Decrease"
                >
                  −
                </button>
                <input
                  type="number"
                  className="w-10 text-center bg-transparent outline-none no-tap-zoom"
                  value={v}
                  min={0}
                  onChange={(e) =>
                    onChange({ ...shares, [mid]: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
                <button
                  onClick={() => onChange({ ...shares, [mid]: v + 1 })}
                  className="h-8 w-8 text-lg text-ink-muted hover:bg-cream"
                  aria-label="Increase"
                >
                  +
                </button>
              </div>
              {totalCents > 0 && v > 0 && (
                <span className="w-16 text-right text-xs text-ink-muted tabular-nums">
                  {formatMoney(share, currency)}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
