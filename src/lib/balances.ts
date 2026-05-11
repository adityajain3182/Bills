import type { Email, Expense, Settlement } from '../types';

/** Compute net balance per member email. Positive = owed money. */
export function computeNetBalances(
  expenses: Expense[],
  settlements: Settlement[],
  memberEmails: Email[],
): Map<Email, number> {
  const balances = new Map<Email, number>();
  for (const e of memberEmails) balances.set(e, 0);

  for (const exp of expenses) {
    for (const p of exp.paidBy) {
      balances.set(p.email, (balances.get(p.email) ?? 0) + p.amount);
    }
    for (const s of exp.splits) {
      balances.set(s.email, (balances.get(s.email) ?? 0) - s.amount);
    }
  }
  for (const s of settlements) {
    balances.set(s.fromEmail, (balances.get(s.fromEmail) ?? 0) + s.amount);
    balances.set(s.toEmail, (balances.get(s.toEmail) ?? 0) - s.amount);
  }
  return balances;
}

export interface PairwiseDebt {
  from: Email;
  to: Email;
  amount: number;
}

export function computePairwiseDebts(
  expenses: Expense[],
  settlements: Settlement[],
): PairwiseDebt[] {
  const owed = new Map<Email, Map<Email, number>>();
  const add = (debtor: Email, creditor: Email, amount: number) => {
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
        if (split.email === payer.email) continue;
        add(split.email, payer.email, portion);
      }
    }
  }
  for (const s of settlements) {
    add(s.toEmail, s.fromEmail, s.amount);
  }

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
