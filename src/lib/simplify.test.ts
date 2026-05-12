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

  // The user-provided scenario for this PR:
  //   A → C: 100
  //   C → B:  50
  //   A → B:  50
  // Net balances: A: -150, B: +100, C: +50
  // Optimal minimum-transaction settlement: 2 transactions.
  it('collapses a chained debt (A→C, C→B, A→B) into 2 transactions', () => {
    const out = simplifyDebts(net(['A', -150], ['B', 100], ['C', 50]));

    // Optimum is n-1 = 2 transactions
    expect(out).toHaveLength(2);

    // A is the only debtor; both transactions originate at A
    expect(out.every((t) => t.from === 'A')).toBe(true);

    // The set covers both creditors
    const recipients = new Set(out.map((t) => t.to));
    expect(recipients).toEqual(new Set(['B', 'C']));

    // Amounts each creditor receives match the net they were owed
    const byCreditor = Object.fromEntries(out.map((t) => [t.to, t.amount]));
    expect(byCreditor['B']).toBe(100);
    expect(byCreditor['C']).toBe(50);

    // Final balances reconcile to zero
    const remaining = new Map<string, number>([
      ['A', -150],
      ['B', 100],
      ['C', 50],
    ]);
    for (const t of out) {
      remaining.set(t.from, (remaining.get(t.from) ?? 0) + t.amount);
      remaining.set(t.to, (remaining.get(t.to) ?? 0) - t.amount);
    }
    for (const v of remaining.values()) expect(v).toBe(0);
  });

  it('scales: 8 people with mixed balances settle in at most n-1 transactions', () => {
    const out = simplifyDebts(
      net(
        ['a', 500],
        ['b', 300],
        ['c', 200],
        ['d', 100],
        ['e', -250],
        ['f', -350],
        ['g', -200],
        ['h', -300],
      ),
    );

    // Greedy is bounded by n-1 = 7 transactions; usually tighter.
    expect(out.length).toBeLessThanOrEqual(7);

    // Every transaction goes from a debtor to a creditor
    const debtors = new Set(['e', 'f', 'g', 'h']);
    const creditors = new Set(['a', 'b', 'c', 'd']);
    for (const t of out) {
      expect(debtors.has(t.from)).toBe(true);
      expect(creditors.has(t.to)).toBe(true);
      expect(t.amount).toBeGreaterThan(0);
    }

    // And the whole graph settles to zero
    const remaining = new Map<string, number>([
      ['a', 500],
      ['b', 300],
      ['c', 200],
      ['d', 100],
      ['e', -250],
      ['f', -350],
      ['g', -200],
      ['h', -300],
    ]);
    for (const t of out) {
      remaining.set(t.from, (remaining.get(t.from) ?? 0) + t.amount);
      remaining.set(t.to, (remaining.get(t.to) ?? 0) - t.amount);
    }
    for (const v of remaining.values()) expect(v).toBe(0);
  });

  it('produces strictly fewer transactions than the raw pairwise graph in chained debts', () => {
    // The chained scenario has 3 raw debts (A→C, C→B, A→B) but only 2 minimum.
    const rawCount = 3;
    const out = simplifyDebts(net(['A', -150], ['B', 100], ['C', 50]));
    expect(out.length).toBeLessThan(rawCount);
  });
});
