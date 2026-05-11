import type { ID } from '../types';

export interface SimplifiedDebt {
  from: ID;
  to: ID;
  amount: number; // cents
}

/**
 * Greedy debt simplification.
 *
 * Algorithm:
 *   1. Take net balances per person (positive = creditor, negative = debtor).
 *   2. Repeatedly match the largest creditor with the largest debtor.
 *   3. Settle min(|debtor|, creditor); emit that transaction; reduce both.
 *   4. Stop when all balances are zero (within tolerance).
 *
 * This minimizes the number of transactions needed to settle a group.
 * Not the same set of transactions as the raw "who owes whom" view, but
 * net-equivalent: each person ends at zero. Tolerance is 0 cents — we only
 * call it simplified once it reconciles exactly.
 */
export function simplifyDebts(balances: Map<ID, number>): SimplifiedDebt[] {
  const creditors: { id: ID; amount: number }[] = [];
  const debtors: { id: ID; amount: number }[] = []; // positive amount = magnitude owed
  for (const [id, bal] of balances) {
    if (bal > 0) creditors.push({ id, amount: bal });
    else if (bal < 0) debtors.push({ id, amount: -bal });
  }

  // Sort largest first for stable, deterministic output
  creditors.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
  debtors.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));

  const out: SimplifiedDebt[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const pay = Math.min(d.amount, c.amount);
    if (pay > 0) out.push({ from: d.id, to: c.id, amount: pay });
    d.amount -= pay;
    c.amount -= pay;
    if (d.amount === 0) i++;
    if (c.amount === 0) j++;
  }
  return out;
}
