import { describe, expect, it } from 'vitest';
import { computeNetBalances, computePairwiseDebts } from './balances';
import type { Expense, Settlement } from '../types';

const baseExpense = (over: Partial<Expense>): Expense => ({
  id: 'e',
  groupId: 'g',
  description: 'x',
  amount: 0,
  currency: 'USD',
  date: 0,
  paidBy: [],
  splits: [],
  splitMethod: 'equal',
  splitConfig: { includedEmails: [] },
  category: 'general',
  createdAt: 0,
  updatedAt: 0,
  ...(over as Partial<Expense>),
});

describe('computeNetBalances', () => {
  it('reflects paid minus owed', () => {
    const exp = baseExpense({
      amount: 1500,
      paidBy: [{ email: 'a@x', amount: 1500 }],
      splits: [
        { email: 'a@x', amount: 500 },
        { email: 'b@x', amount: 500 },
        { email: 'c@x', amount: 500 },
      ],
    });
    const bals = computeNetBalances([exp], [], ['a@x', 'b@x', 'c@x']);
    expect(bals.get('a@x')).toBe(1000);
    expect(bals.get('b@x')).toBe(-500);
    expect(bals.get('c@x')).toBe(-500);
  });

  it('applies settlements (debtor pays creditor)', () => {
    const exp = baseExpense({
      amount: 1000,
      paidBy: [{ email: 'a@x', amount: 1000 }],
      splits: [
        { email: 'a@x', amount: 500 },
        { email: 'b@x', amount: 500 },
      ],
    });
    const settlement: Settlement = {
      id: 's',
      groupId: 'g',
      fromEmail: 'b@x',
      toEmail: 'a@x',
      amount: 500,
      currency: 'USD',
      date: 0,
      createdAt: 0,
      updatedAt: 0,
    };
    const bals = computeNetBalances([exp], [settlement], ['a@x', 'b@x']);
    expect(bals.get('a@x')).toBe(0);
    expect(bals.get('b@x')).toBe(0);
  });
});

describe('computePairwiseDebts', () => {
  it('produces directed edges between debtor and creditor', () => {
    const exp = baseExpense({
      amount: 900,
      paidBy: [{ email: 'a@x', amount: 900 }],
      splits: [
        { email: 'a@x', amount: 300 },
        { email: 'b@x', amount: 300 },
        { email: 'c@x', amount: 300 },
      ],
    });
    const debts = computePairwiseDebts([exp], []);
    const fromB = debts.find((d) => d.from === 'b@x' && d.to === 'a@x');
    const fromC = debts.find((d) => d.from === 'c@x' && d.to === 'a@x');
    expect(fromB?.amount).toBe(300);
    expect(fromC?.amount).toBe(300);
  });

  it('nets out reverse direction', () => {
    const e1 = baseExpense({
      id: 'e1',
      amount: 1000,
      paidBy: [{ email: 'a@x', amount: 1000 }],
      splits: [
        { email: 'a@x', amount: 500 },
        { email: 'b@x', amount: 500 },
      ],
    });
    const e2 = baseExpense({
      id: 'e2',
      amount: 800,
      paidBy: [{ email: 'b@x', amount: 800 }],
      splits: [
        { email: 'a@x', amount: 400 },
        { email: 'b@x', amount: 400 },
      ],
    });
    const debts = computePairwiseDebts([e1, e2], []);
    expect(debts).toHaveLength(1);
    expect(debts[0]).toMatchObject({ from: 'b@x', to: 'a@x', amount: 100 });
  });
});
