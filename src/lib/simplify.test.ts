import { describe, expect, it } from 'vitest';
import { simplifyDebts } from './simplify';

function net(...entries: [string, number][]) {
  return new Map(entries);
}

describe('simplifyDebts', () => {
  it('returns empty for all-zero balances', () => {
    expect(simplifyDebts(net(['a', 0], ['b', 0]))).toEqual([]);
  });

  it('settles a two-person debt with one transaction', () => {
    const out = simplifyDebts(net(['a', -500], ['b', 500]));
    expect(out).toEqual([{ from: 'a', to: 'b', amount: 500 }]);
  });

  it('settles a three-person cycle with two transactions', () => {
    // a owes 600 total, b is owed 400, c is owed 200
    const out = simplifyDebts(net(['a', -600], ['b', 400], ['c', 200]));
    expect(out).toHaveLength(2);
    const totalPaid = out.reduce((acc, t) => acc + t.amount, 0);
    expect(totalPaid).toBe(600);
    // a is debtor in all
    expect(out.every((t) => t.from === 'a')).toBe(true);
  });

  it('minimizes transactions: 4 people balanced settles in fewer than 4', () => {
    // a paid 200 over, b paid 100 over, c short 150, d short 150
    const out = simplifyDebts(
      net(['a', 200], ['b', 100], ['c', -150], ['d', -150]),
    );
    // Best case: 3 transactions (one debtor can be matched by one creditor each).
    expect(out.length).toBeLessThanOrEqual(3);
    // All settled
    const remaining = new Map<string, number>([
      ['a', 200],
      ['b', 100],
      ['c', -150],
      ['d', -150],
    ]);
    for (const t of out) {
      remaining.set(t.from, (remaining.get(t.from) ?? 0) + t.amount);
      remaining.set(t.to, (remaining.get(t.to) ?? 0) - t.amount);
    }
    for (const v of remaining.values()) expect(v).toBe(0);
  });

  it('is deterministic for tied balances', () => {
    const a = simplifyDebts(net(['x', 100], ['y', -50], ['z', -50]));
    const b = simplifyDebts(net(['x', 100], ['y', -50], ['z', -50]));
    expect(a).toEqual(b);
  });

  it('handles single-cent residuals correctly', () => {
    const out = simplifyDebts(net(['a', -333], ['b', -333], ['c', -334], ['d', 1000]));
    const total = out.reduce((acc, t) => acc + t.amount, 0);
    expect(total).toBe(1000);
    expect(out.every((t) => t.to === 'd')).toBe(true);
  });
});
