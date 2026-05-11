// Money is stored as integer cents (or minor unit) everywhere internally.
// Conversion to/from display happens only at the edge.

export const toCents = (n: number): number => Math.round(n * 100);
export const fromCents = (c: number): number => c / 100;

const NO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK']);

export function formatMoney(cents: number, currency = 'USD'): string {
  const noDecimals = NO_DECIMAL_CURRENCIES.has(currency);
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: noDecimals ? 0 : 2,
      maximumFractionDigits: noDecimals ? 0 : 2,
    }).format(noDecimals ? Math.round(cents) : cents / 100);
  } catch {
    const value = noDecimals ? Math.round(cents) : cents / 100;
    return `${currency} ${value.toFixed(noDecimals ? 0 : 2)}`;
  }
}

export function formatMoneyAbs(cents: number, currency = 'USD'): string {
  return formatMoney(Math.abs(cents), currency);
}

export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[,\s$£€¥]/g, '');
  if (cleaned === '' || cleaned === '.' || cleaned === '-') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return toCents(n);
}

export function currencySymbol(currency = 'USD'): string {
  try {
    const parts = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? currency;
  } catch {
    return currency;
  }
}

export const CURRENCIES = [
  { code: 'USD', label: 'US Dollar' },
  { code: 'EUR', label: 'Euro' },
  { code: 'GBP', label: 'British Pound' },
  { code: 'CAD', label: 'Canadian Dollar' },
  { code: 'AUD', label: 'Australian Dollar' },
  { code: 'INR', label: 'Indian Rupee' },
  { code: 'JPY', label: 'Japanese Yen' },
  { code: 'SGD', label: 'Singapore Dollar' },
  { code: 'CHF', label: 'Swiss Franc' },
  { code: 'NZD', label: 'NZ Dollar' },
  { code: 'MXN', label: 'Mexican Peso' },
  { code: 'BRL', label: 'Brazilian Real' },
];
