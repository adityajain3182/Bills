import { useEffect, useState } from 'react';
import { currencySymbol, formatMoney, fromCents, parseAmount } from '../lib/money';

interface Props {
  /** Value in cents */
  value: number;
  onChange: (cents: number) => void;
  currency?: string;
  placeholder?: string;
  autoFocus?: boolean;
  size?: 'lg' | 'md';
  inputClassName?: string;
}

export function AmountInput({
  value,
  onChange,
  currency = 'USD',
  placeholder = '0.00',
  autoFocus,
  size = 'md',
  inputClassName = '',
}: Props) {
  const [text, setText] = useState(value > 0 ? (fromCents(value)).toString() : '');

  useEffect(() => {
    // Sync only when external value is set and doesn't match parsed text
    const parsed = parseAmount(text);
    if (parsed !== value) {
      setText(value > 0 ? fromCents(value).toString() : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (raw: string) => {
    // Accept digits, single dot, two decimals
    const cleaned = raw.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    let normalized = cleaned;
    if (parts.length > 2) normalized = parts[0] + '.' + parts.slice(1).join('');
    if (parts[1]?.length > 2) normalized = parts[0] + '.' + parts[1].slice(0, 2);
    setText(normalized);
    const cents = parseAmount(normalized);
    onChange(cents ?? 0);
  };

  return (
    <div className="flex items-center gap-2">
      <span
        className={`text-ink-muted ${
          size === 'lg' ? 'font-display text-4xl' : 'text-lg'
        }`}
      >
        {currencySymbol(currency)}
      </span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={`bg-transparent outline-none flex-1 no-tap-zoom ${
          size === 'lg'
            ? 'font-display text-5xl font-semibold placeholder:text-ink-soft'
            : 'text-lg placeholder:text-ink-soft'
        } ${inputClassName}`}
      />
    </div>
  );
}

export function AmountReadout({ cents, currency }: { cents: number; currency: string }) {
  return <span className="font-display tabular-nums">{formatMoney(cents, currency)}</span>;
}
