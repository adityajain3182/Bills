import type { Expense, ID, Settlement } from '../types';

/**
 * Compute net balance per person for a set of expenses and settlements.
 * Positive = is owed money (paid more than their share).
 * Negative = owes money.
 */
export function computeNetBalances(
  expenses: Expense[],
  settlements: Settlement[],
  memberIds: ID[],
): Map<ID, number> {
  const balances = new Map<ID, number>();
  for (const id of memberIds) balances.set(id, 0);

  for (const exp of expenses) {
    for (const p of exp.paidBy) {
      balances.set(p.personId, (balances.get(p.personId) ?? 0) + p.amount);
    }
    for (const s of exp.splits) {
      balances.set(s.personId, (balances.get(s.personId) ?? 0) - s.amount);
    }
  }
  for (const s of settlements) {
    // payer pays receiver: payer's balance increases (debt cleared),
    // receiver's balance decreases (their credit shrinks)
    balances.set(s.fromPersonId, (balances.get(s.fromPersonId) ?? 0) + s.amount);
    balances.set(s.toPersonId, (balances.get(s.toPersonId) ?? 0) - s.amount);
  }
  return balances;
}

export interface PairwiseDebt {
  from: ID; // debtor
  to: ID;   // creditor
  amount: number;
}

/**
 * Raw pairwise debt construction: for each expense, every payer is credited
 * proportionally for each split. This produces a directed multigraph that we
 * collapse into per-pair net debts.
 */
export function computePairwiseDebts(
  expenses: Expense[],
  settlements: Settlement[],
): PairwiseDebt[] {
  // owed[debtor][creditor] = cents
  const owed = new Map<ID, Map<ID, number>>();
  const add = (debtor: ID, creditor: ID, amount: number) => {
    if (debtor === creditor || amount === 0) return;
    let row = owed.get(debtor);
    if (!row) {
      row = new Map();
      owed.set(debtor, row);
    }
    row.set(creditor, (row.get(creditor) ?? 0) + amount);
  };

  for (const exp of expenses) {
    const totalPaid = exp.paidBy.reduce((a, b) => a + b.amount, 0);
    if (totalPaid === 0) continue;
    for (const split of exp.splits) {
      for (const payer of exp.paidBy) {
        const ratio = payer.amount / totalPaid;
        const portion = Math.round(split.amount * ratio);
        if (split.personId === payer.personId) continue;
        add(split.personId, payer.personId, portion);
      }
    }
  }
  for (const s of settlements) {
    // Settlement: fromPerson paid toPerson — reduces the debt fromPerson owes toPerson
    add(s.toPersonId, s.fromPersonId, s.amount); // equivalent: subtracts from from→to
  }

  // Collapse pairs: net out a→b vs b→a
  const result: PairwiseDebt[] = [];
  const seen = new Set<string>();
  for (const [debtor, row] of owed) {
    for (const [creditor, amount] of row) {
      const key = [debtor, creditor].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const reverse = owed.get(creditor)?.get(debtor) ?? 0;
      const net = amount - reverse;
      if (net > 0) result.push({ from: debtor, to: creditor, amount: net });
      else if (net < 0) result.push({ from: creditor, to: debtor, amount: -net });
    }
  }
  return result.filter((r) => r.amount > 0);
}
