import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { AmountInput } from '../components/AmountInput';
import { useGroup, useProfiles } from '../db/hooks';
import { saveSettlement } from '../db/queries';
import { useUI } from '../store/ui';
import { format } from 'date-fns';
import { colorForEmail, displayNameForEmail, normalizeEmail } from '../types';
import type { Email } from '../types';

export function SettleScreen() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const group = useGroup(id);
  const profiles = useProfiles() ?? [];
  const navigate = useNavigate();
  const push = useUI((s) => s.pushToast);

  const profileByEmail = useMemo(() => new Map(profiles.map((p) => [p.email, p])), [profiles]);

  const [fromEmail, setFromEmail] = useState<Email | null>(
    params.get('from') ? normalizeEmail(params.get('from')!) : null,
  );
  const [toEmail, setToEmail] = useState<Email | null>(
    params.get('to') ? normalizeEmail(params.get('to')!) : null,
  );
  const [amount, setAmount] = useState<number>(() => {
    const v = params.get('amount');
    return v ? Number(v) || 0 : 0;
  });
  const [date, setDate] = useState<number>(() => Date.now());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!group) return;
    if (!fromEmail && group.members.length) setFromEmail(group.members[0].email);
    if (!toEmail && group.members.length > 1) setToEmail(group.members[1].email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id]);

  if (group === undefined) return <Header title="Loading…" back />;
  if (!group) return <Navigate to="/groups" replace />;

  const error =
    !fromEmail || !toEmail
      ? 'Pick payer and recipient'
      : fromEmail === toEmail
        ? 'Payer and recipient must differ'
        : amount <= 0
          ? 'Enter an amount'
          : null;

  const submit = async () => {
    if (error || !fromEmail || !toEmail) return;
    setSaving(true);
    try {
      await saveSettlement({
        groupId: group.id,
        fromEmail,
        toEmail,
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

  const renderMember = (email: Email) => {
    const p = profileByEmail.get(email);
    const member = group.members.find((m) => m.email === email);
    return {
      name: p?.displayName || member?.displayName || displayNameForEmail(email),
      color: p?.avatarColor || colorForEmail(email),
    };
  };

  return (
    <>
      <Header back title="Settle up" subtitle={group.name} />
      <div className="scroll-area px-5 pt-3">
        <div className="card p-5 mb-4">
          <div className="text-xs text-ink-muted text-center mb-2">Amount</div>
          <div className="flex justify-center">
            <AmountInput value={amount} onChange={setAmount} currency={group.currency} size="lg" autoFocus />
          </div>
        </div>

        <div className="card p-3 mb-4">
          <div className="label px-1 mb-2">From (payer)</div>
          <ul className="space-y-1">
            {group.members.map((m) => {
              const d = renderMember(m.email);
              return (
                <li key={m.email}>
                  <button
                    onClick={() => setFromEmail(m.email)}
                    className={`w-full flex items-center gap-3 p-2 rounded-xl border transition ${
                      fromEmail === m.email
                        ? 'border-forest bg-forest/8'
                        : 'border-transparent bg-cream'
                    }`}
                  >
                    <Avatar name={d.name} color={d.color} size={28} />
                    <span className="flex-1 text-left text-sm">{d.name}</span>
                    {fromEmail === m.email && <span className="text-forest">✓</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="card p-3 mb-4">
          <div className="label px-1 mb-2">To (recipient)</div>
          <ul className="space-y-1">
            {group.members.map((m) => {
              const d = renderMember(m.email);
              return (
                <li key={m.email}>
                  <button
                    onClick={() => setToEmail(m.email)}
                    className={`w-full flex items-center gap-3 p-2 rounded-xl border transition ${
                      toEmail === m.email
                        ? 'border-forest bg-forest/8'
                        : 'border-transparent bg-cream'
                    }`}
                  >
                    <Avatar name={d.name} color={d.color} size={28} />
                    <span className="flex-1 text-left text-sm">{d.name}</span>
                    {toEmail === m.email && <span className="text-forest">✓</span>}
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
