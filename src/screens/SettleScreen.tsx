import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { AmountInput } from '../components/AmountInput';
import { useGroup, usePeople } from '../db/hooks';
import { saveSettlement } from '../db/queries';
import { useUI } from '../store/ui';
import { format } from 'date-fns';

export function SettleScreen() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const group = useGroup(id);
  const people = usePeople() ?? [];
  const navigate = useNavigate();
  const push = useUI((s) => s.pushToast);

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const [fromId, setFromId] = useState<string | null>(params.get('from'));
  const [toId, setToId] = useState<string | null>(params.get('to'));
  const [amount, setAmount] = useState<number>(() => {
    const v = params.get('amount');
    return v ? Number(v) || 0 : 0;
  });
  const [date, setDate] = useState<number>(() => Date.now());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (group && !fromId && group.memberIds.length) setFromId(group.memberIds[0]);
    if (group && !toId && group.memberIds.length > 1) setToId(group.memberIds[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id]);

  if (group === undefined) return <Header title="Loading…" back />;
  if (!group) return <Navigate to="/groups" replace />;

  const error =
    !fromId || !toId
      ? 'Pick payer and recipient'
      : fromId === toId
        ? 'Payer and recipient must differ'
        : amount <= 0
          ? 'Enter an amount'
          : null;

  const submit = async () => {
    if (error || !fromId || !toId) return;
    setSaving(true);
    try {
      await saveSettlement({
        groupId: group.id,
        fromPersonId: fromId,
        toPersonId: toId,
        amount,
        currency: group.currency,
        date,
        note,
      });
      push('Settlement recorded', 'success');
      navigate(`/groups/${group.id}`);
    } catch (e) {
      push((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Header back title="Settle up" subtitle={group.name} />
      <div className="scroll-area px-5 pt-3">
        <div className="card p-5 mb-4">
          <div className="text-xs text-ink-muted text-center mb-2">Amount</div>
          <div className="flex justify-center">
            <AmountInput
              value={amount}
              onChange={setAmount}
              currency={group.currency}
              size="lg"
              autoFocus
            />
          </div>
        </div>

        <div className="card p-3 mb-4">
          <div className="label px-1 mb-2">From (payer)</div>
          <ul className="space-y-1">
            {group.memberIds.map((mid) => {
              const p = peopleById.get(mid);
              if (!p) return null;
              return (
                <li key={mid}>
                  <button
                    onClick={() => setFromId(mid)}
                    className={`w-full flex items-center gap-3 p-2 rounded-xl border transition ${
                      fromId === mid ? 'border-forest bg-forest/8' : 'border-transparent bg-cream'
                    }`}
                  >
                    <Avatar name={p.name} color={p.avatarColor} size={28} />
                    <span className="flex-1 text-left text-sm">{p.name}</span>
                    {fromId === mid && <span className="text-forest">✓</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="card p-3 mb-4">
          <div className="label px-1 mb-2">To (recipient)</div>
          <ul className="space-y-1">
            {group.memberIds.map((mid) => {
              const p = peopleById.get(mid);
              if (!p) return null;
              return (
                <li key={mid}>
                  <button
                    onClick={() => setToId(mid)}
                    className={`w-full flex items-center gap-3 p-2 rounded-xl border transition ${
                      toId === mid ? 'border-forest bg-forest/8' : 'border-transparent bg-cream'
                    }`}
                  >
                    <Avatar name={p.name} color={p.avatarColor} size={28} />
                    <span className="flex-1 text-left text-sm">{p.name}</span>
                    {toId === mid && <span className="text-forest">✓</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="card p-3 mb-4 space-y-2">
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
            <div className="label mb-1">Note</div>
            <input
              type="text"
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>

        {error && <div className="text-warmred text-sm mb-3 px-1">{error}</div>}

        <Button full size="lg" onClick={submit} disabled={saving || !!error}>
          Record payment
        </Button>
      </div>
    </>
  );
}
