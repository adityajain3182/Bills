import type { Expense, ID, Settlement } from '../types';
import { computeNetBalances } from './balances';
import { simplifyDebts, type SimplifiedDebt } from './simplify';

/**
 * Group expenses + settlements by their currency and compute the net balance
 * each person has within that currency, **summed across every group**.
 *
 * Cross-currency debts can't be combined sensibly without exchange rates, so
 * each currency is its own independent bucket. Groups with different
 * currencies stay separate.
 */
export function computeCrossGroupNetByCurrency(
  expenses: Expense[],
  settlements: Settlement[],
): Map<string, Map<ID, number>> {
  const buckets = new Map<string, { exp: Expense[]; set: Settlement[] }>();
  const bucket = (currency: string) => {
    let b = buckets.get(currency);
    if (!b) {
      b = { exp: [], set: [] };
      buckets.set(currency, b);
    }
    return b;
  };
  for (const e of expenses) bucket(e.currency).exp.push(e);
  for (const s of settlements) bucket(s.currency).set.push(s);

  const result = new Map<string, Map<ID, number>>();
  for (const [currency, { exp, set }] of buckets) {
    const ids = new Set<ID>();
    for (const e of exp) {
      for (const p of e.paidBy) ids.add(p.personId);
      for (const sp of e.splits) ids.add(sp.personId);
    }
    for (const s of set) {
      ids.add(s.fromPersonId);
      ids.add(s.toPersonId);
    }
    result.set(currency, computeNetBalances(exp, set, [...ids]));
  }
  return result;
}

/**
 * Apply the greedy debt simplifier to each currency bucket. Returns a map
 * from currency code to the minimum set of transactions needed to settle
 * that bucket across every group the user has in that currency.
 */
export function simplifyCrossGroup(
  expenses: Expense[],
  settlements: Settlement[],
): Map<string, SimplifiedDebt[]> {
  const byCurrency = computeCrossGroupNetByCurrency(expenses, settlements);
  const out = new Map<string, SimplifiedDebt[]>();
  for (const [currency, balances] of byCurrency) {
    out.set(currency, simplifyDebts(balances));
  }
  return out;
}

/**
 * Filter the cross-group simplified transactions down to ones that touch
 * the current user. Returns separate "I owe" and "owed to me" lists per
 * currency for direct UI consumption.
 */
export function myCrossGroupPayments(
  expenses: Expense[],
  settlements: Settlement[],
  meId: ID,
): Map<
  string,
  {
    iOwe: { toId: ID; amount: number }[];
    owedToMe: { fromId: ID; amount: number }[];
  }
> {
  const all = simplifyCrossGroup(expenses, settlements);
  const out = new Map<string, { iOwe: { toId: ID; amount: number }[]; owedToMe: { fromId: ID; amount: number }[] }>();
  for (const [currency, txns] of all) {
    const iOwe: { toId: ID; amount: number }[] = [];
    const owedToMe: { fromId: ID; amount: number }[] = [];
    for (const t of txns) {
      if (t.from === meId) iOwe.push({ toId: t.to, amount: t.amount });
      else if (t.to === meId) owedToMe.push({ fromId: t.from, amount: t.amount });
    }
    if (iOwe.length || owedToMe.length) out.set(currency, { iOwe, owedToMe });
  }
  return out;
}
