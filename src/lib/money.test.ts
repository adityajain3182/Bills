import { describe, expect, it } from 'vitest';
import { formatMoney, fromCents, parseAmount, toCents } from './money';

describe('money', () => {
  it('round-trips dollars to cents', () => {
    expect(toCents(12.34)).toBe(1234);
    expect(toCents(0.1 + 0.2)).toBe(30); // no floating point drift
    expect(fromCents(1234)).toBe(12.34);
  });

  it('parses common inputs', () => {
    expect(parseAmount('12.34')).toBe(1234);
    expect(parseAmount('$1,234.56')).toBe(123456);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('.')).toBeNull();
  });

  it('formats with currency', () => {
    const usd = formatMoney(1234, 'USD');
    expect(usd).toContain('12');
    expect(usd).toContain('34');
  });

  it('handles no-decimal currencies (JPY)', () => {
    const jpy = formatMoney(1500, 'JPY');
    expect(jpy).toContain('1,500');
    expect(jpy).not.toContain('.');
  });
});
