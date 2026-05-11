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
  splitConfig: { includedIds: [] },
  category: 'general',
  createdAt: 0,
  updatedAt: 0,
  ...(over as Partial<Expense>),
});

describe('computeNetBalances', () => {
  it('reflects paid minus owed', () => {
    const exp = baseExpense({
      amount: 1500,
      paidBy: [{ personId: 'a', amount: 1500 }],
      splits: [
        { personId: 'a', amount: 500 },
        { personId: 'b', amount: 500 },
        { personId: 'c', amount: 500 },
      ],
    });
    const bals = computeNetBalances([exp], [], ['a', 'b', 'c']);
    expect(bals.get('a')).toBe(1000);
    expect(bals.get('b')).toBe(-500);
    expect(bals.get('c')).toBe(-500);
  });

  it('applies settlements (debtor pays creditor)', () => {
    const exp = baseExpense({
      amount: 1000,
      paidBy: [{ personId: 'a', amount: 1000 }],
      splits: [
        { personId: 'a', amount: 500 },
        { personId: 'b', amount: 500 },
      ],
    });
    const settlement: Settlement = {
      id: 's',
      groupId: 'g',
      fromPersonId: 'b',
      toPersonId: 'a',
      amount: 500,
      currency: 'USD',
      date: 0,
      createdAt: 0,
      updatedAt: 0,
    };
    const bals = computeNetBalances([exp], [settlement], ['a', 'b']);
    expect(bals.get('a')).toBe(0);
    expect(bals.get('b')).toBe(0);
  });
});

describe('computePairwiseDebts', () => {
  it('produces directed edges between debtor and creditor', () => {
    const exp = baseExpense({
      amount: 900,
      paidBy: [{ personId: 'a', amount: 900 }],
      splits: [
        { personId: 'a', amount: 300 },
        { personId: 'b', amount: 300 },
        { personId: 'c', amount: 300 },
      ],
    });
    const debts = computePairwiseDebts([exp], []);
    const fromBToA = debts.find((d) => d.from === 'b' && d.to === 'a');
    const fromCToA = debts.find((d) => d.from === 'c' && d.to === 'a');
    expect(fromBToA?.amount).toBe(300);
    expect(fromCToA?.amount).toBe(300);
  });

  it('nets out reverse direction', () => {
    const e1 = baseExpense({
      id: 'e1',
      amount: 1000,
      paidBy: [{ personId: 'a', amount: 1000 }],
      splits: [
        { personId: 'a', amount: 500 },
        { personId: 'b', amount: 500 },
      ],
    });
    const e2 = baseExpense({
      id: 'e2',
      amount: 800,
      paidBy: [{ personId: 'b', amount: 800 }],
      splits: [
        { personId: 'a', amount: 400 },
        { personId: 'b', amount: 400 },
      ],
    });
    const debts = computePairwiseDebts([e1, e2], []);
    expect(debts).toHaveLength(1);
    expect(debts[0]).toMatchObject({ from: 'b', to: 'a', amount: 100 });
  });
});
