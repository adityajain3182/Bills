import { describe, expect, it } from 'vitest';
import {
  computeCrossGroupNetByCurrency,
  myCrossGroupPayments,
  simplifyCrossGroup,
} from './crossGroup';
import type { Expense, Settlement } from '../types';

const expense = (over: Partial<Expense>): Expense => ({
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
  ...over,
});

const settlement = (over: Partial<Settlement>): Settlement => ({
  id: 's',
  groupId: 'g',
  fromPersonId: 'a',
  toPersonId: 'b',
  amount: 0,
  currency: 'USD',
  date: 0,
  createdAt: 0,
  ...over,
});

describe('computeCrossGroupNetByCurrency', () => {
  it('sums opposing flows across two groups into one net per person', () => {
    // Group g1: me paid 1000, split 500/500 with Alice -> Alice owes me 500
    // Group g2: Alice paid 600, split 300/300 with me -> I owe Alice 300
    // Cross-group net: Alice -200, me +200
    const exps = [
      expense({
        id: 'e1',
        groupId: 'g1',
        amount: 1000,
        paidBy: [{ personId: 'me', amount: 1000 }],
        splits: [
          { personId: 'me', amount: 500 },
          { personId: 'alice', amount: 500 },
        ],
      }),
      expense({
        id: 'e2',
        groupId: 'g2',
        amount: 600,
        paidBy: [{ personId: 'alice', amount: 600 }],
        splits: [
          { personId: 'me', amount: 300 },
          { personId: 'alice', amount: 300 },
        ],
      }),
    ];
    const net = computeCrossGroupNetByCurrency(exps, []);
    const usd = net.get('USD')!;
    expect(usd.get('me')).toBe(200);
    expect(usd.get('alice')).toBe(-200);
  });

  it('keeps different currencies in separate buckets', () => {
    const exps = [
      expense({
        id: 'usd1',
        currency: 'USD',
        amount: 1000,
        paidBy: [{ personId: 'me', amount: 1000 }],
        splits: [
          { personId: 'me', amount: 500 },
          { personId: 'alice', amount: 500 },
        ],
      }),
      expense({
        id: 'inr1',
        currency: 'INR',
        amount: 800,
        paidBy: [{ personId: 'alice', amount: 800 }],
        splits: [
          { personId: 'me', amount: 400 },
          { personId: 'alice', amount: 400 },
        ],
      }),
    ];
    const net = computeCrossGroupNetByCurrency(exps, []);
    expect(net.get('USD')!.get('alice')).toBe(-500);
    expect(net.get('USD')!.get('me')).toBe(500);
    expect(net.get('INR')!.get('me')).toBe(-400);
    expect(net.get('INR')!.get('alice')).toBe(400);
  });

  it('applies cross-group settlements in the right currency bucket', () => {
    const exps = [
      expense({
        id: 'e1',
        groupId: 'g1',
        amount: 1000,
        paidBy: [{ personId: 'me', amount: 1000 }],
        splits: [
          { personId: 'me', amount: 500 },
          { personId: 'alice', amount: 500 },
        ],
      }),
    ];
    const sets = [
      settlement({
        id: 's1',
        groupId: 'g1',
        fromPersonId: 'alice',
        toPersonId: 'me',
        amount: 300,
        currency: 'USD',
      }),
    ];
    const net = computeCrossGroupNetByCurrency(exps, sets);
    expect(net.get('USD')!.get('me')).toBe(200);
    expect(net.get('USD')!.get('alice')).toBe(-200);
  });
});

describe('simplifyCrossGroup', () => {
  it('collapses a chain spanning three groups into 2 transactions', () => {
    // g1: I paid for Bob, Bob owes me 100
    // g2: Bob paid for Carol, Carol owes Bob 50  (within g2)
    // g3: I paid for Carol, Carol owes me 50      (within g3)
    //
    // Net across groups:  me +150,  bob 0 (received 50 from carol, owes me 100, paid 50 for carol = -100+50+50 = 0?)
    // Let me redo: in g1 I paid 100 for the two of us, splits = [me 50, bob 50] → bob owes me 50, total 100 expense.
    // Actually for this test, let me construct it cleanly via raw expenses.
    //
    // g1: I paid 200 for me+Bob (split 100/100) → me +100, bob -100
    // g2: Bob paid 100 for Bob+Carol (split 50/50) → bob +50, carol -50
    // g3: I paid 100 for me+Carol (split 50/50) → me +50, carol -50
    //
    // Net: me +150, bob -50, carol -100
    // Greedy: largest debtor carol(100) ↔ largest creditor me(150). Pay 100. carol 0, me 50.
    //         next debtor bob(50) ↔ me(50). Pay 50. Both 0.
    // → 2 transactions.
    const exps = [
      expense({
        id: 'e1',
        groupId: 'g1',
        amount: 200,
        paidBy: [{ personId: 'me', amount: 200 }],
        splits: [
          { personId: 'me', amount: 100 },
          { personId: 'bob', amount: 100 },
        ],
      }),
      expense({
        id: 'e2',
        groupId: 'g2',
        amount: 100,
        paidBy: [{ personId: 'bob', amount: 100 }],
        splits: [
          { personId: 'bob', amount: 50 },
          { personId: 'carol', amount: 50 },
        ],
      }),
      expense({
        id: 'e3',
        groupId: 'g3',
        amount: 100,
        paidBy: [{ personId: 'me', amount: 100 }],
        splits: [
          { personId: 'me', amount: 50 },
          { personId: 'carol', amount: 50 },
        ],
      }),
    ];
    const out = simplifyCrossGroup(exps, []);
    const usd = out.get('USD')!;
    expect(usd).toHaveLength(2);

    // Both payments end at "me" since I'm the only creditor.
    expect(usd.every((t) => t.to === 'me')).toBe(true);
    const byFrom = Object.fromEntries(usd.map((t) => [t.from, t.amount]));
    expect(byFrom['carol']).toBe(100);
    expect(byFrom['bob']).toBe(50);
  });

  it('returns one bucket per currency', () => {
    const exps = [
      expense({
        id: 'u1',
        currency: 'USD',
        amount: 200,
        paidBy: [{ personId: 'me', amount: 200 }],
        splits: [
          { personId: 'me', amount: 100 },
          { personId: 'alice', amount: 100 },
        ],
      }),
      expense({
        id: 'i1',
        currency: 'INR',
        amount: 200,
        paidBy: [{ personId: 'alice', amount: 200 }],
        splits: [
          { personId: 'me', amount: 100 },
          { personId: 'alice', amount: 100 },
        ],
      }),
    ];
    const out = simplifyCrossGroup(exps, []);
    expect(out.get('USD')).toEqual([{ from: 'alice', to: 'me', amount: 100 }]);
    expect(out.get('INR')).toEqual([{ from: 'me', to: 'alice', amount: 100 }]);
  });
});

describe('myCrossGroupPayments', () => {
  it('separates iOwe vs owedToMe and ignores transactions I am not in', () => {
    // me +200, alice -150, bob -50
    const exps = [
      expense({
        id: 'e1',
        amount: 400,
        paidBy: [{ personId: 'me', amount: 400 }],
        splits: [
          { personId: 'me', amount: 200 },
          { personId: 'alice', amount: 150 },
          { personId: 'bob', amount: 50 },
        ],
      }),
    ];
    const r = myCrossGroupPayments(exps, [], 'me');
    const usd = r.get('USD')!;
    expect(usd.iOwe).toEqual([]);
    expect(usd.owedToMe.length).toBe(2);
    const map = Object.fromEntries(usd.owedToMe.map((x) => [x.fromId, x.amount]));
    expect(map['alice']).toBe(150);
    expect(map['bob']).toBe(50);
  });

  it('produces both directions when I am both a creditor in one bucket and debtor in another', () => {
    const exps = [
      expense({
        id: 'usd',
        currency: 'USD',
        amount: 1000,
        paidBy: [{ personId: 'me', amount: 1000 }],
        splits: [
          { personId: 'me', amount: 500 },
          { personId: 'alice', amount: 500 },
        ],
      }),
      expense({
        id: 'inr',
        currency: 'INR',
        amount: 800,
        paidBy: [{ personId: 'alice', amount: 800 }],
        splits: [
          { personId: 'me', amount: 400 },
          { personId: 'alice', amount: 400 },
        ],
      }),
    ];
    const r = myCrossGroupPayments(exps, [], 'me');
    expect(r.get('USD')!.owedToMe).toEqual([{ fromId: 'alice', amount: 500 }]);
    expect(r.get('USD')!.iOwe).toEqual([]);
    expect(r.get('INR')!.iOwe).toEqual([{ toId: 'alice', amount: 400 }]);
    expect(r.get('INR')!.owedToMe).toEqual([]);
  });

  it('returns nothing when I am fully settled across all groups', () => {
    // g1: me +500, g2: me -500 → net zero
    const exps = [
      expense({
        id: 'e1',
        groupId: 'g1',
        amount: 1000,
        paidBy: [{ personId: 'me', amount: 1000 }],
        splits: [
          { personId: 'me', amount: 500 },
          { personId: 'alice', amount: 500 },
        ],
      }),
      expense({
        id: 'e2',
        groupId: 'g2',
        amount: 1000,
        paidBy: [{ personId: 'alice', amount: 1000 }],
        splits: [
          { personId: 'me', amount: 500 },
          { personId: 'alice', amount: 500 },
        ],
      }),
    ];
    const r = myCrossGroupPayments(exps, [], 'me');
    expect(r.size).toBe(0);
  });
});
