import type {
  ExactConfig,
  ID,
  PercentConfig,
  SharesConfig,
  SplitConfig,
  SplitMethod,
  SplitShare,
} from '../types';

/**
 * Equal split with deterministic remainder distribution.
 * 10.00 / 3 → [3.34, 3.33, 3.33] in cents [334, 333, 333]
 * The first `remainder` recipients get an extra cent.
 */
export function splitEqual(totalCents: number, n: number): number[] {
  if (n <= 0) return [];
  const sign = totalCents < 0 ? -1 : 1;
  const abs = Math.abs(totalCents);
  const base = Math.floor(abs / n);
  const remainder = abs - base * n;
  return Array.from({ length: n }, (_, i) => sign * (base + (i < remainder ? 1 : 0)));
}

export interface SplitInputs {
  totalCents: number;
  memberIds: ID[];
  method: SplitMethod;
  config: SplitConfig;
}

export interface SplitResult {
  ok: boolean;
  shares: SplitShare[]; // empty when not ok
  error?: string;
  /** computed sum in cents (useful for live display when invalid) */
  computedSum?: number;
}

export function computeSplits(input: SplitInputs): SplitResult {
  const { totalCents, method, config } = input;
  switch (method) {
    case 'equal':
      return computeEqual(totalCents, (config as { includedIds?: ID[] }).includedIds ?? input.memberIds);
    case 'exact':
      return computeExact(totalCents, (config as ExactConfig).amounts ?? {});
    case 'percent':
      return computePercent(totalCents, (config as PercentConfig).percents ?? {});
    case 'shares':
      return computeShares(totalCents, (config as SharesConfig).shares ?? {});
  }
}

function computeEqual(totalCents: number, includedIds: ID[]): SplitResult {
  if (!includedIds.length) {
    return { ok: false, shares: [], error: 'Select at least one person' };
  }
  const amounts = splitEqual(totalCents, includedIds.length);
  const shares: SplitShare[] = includedIds.map((id, i) => ({ personId: id, amount: amounts[i] }));
  return { ok: true, shares };
}

function computeExact(
  totalCents: number,
  amounts: Record<ID, number>,
): SplitResult {
  const entries = Object.entries(amounts).filter(([, v]) => Number.isFinite(v));
  if (!entries.length) {
    return { ok: false, shares: [], error: 'Enter amounts' };
  }
  const sum = entries.reduce((a, [, v]) => a + v, 0);
  if (sum !== totalCents) {
    return {
      ok: false,
      shares: [],
      error: `Off by ${((totalCents - sum) / 100).toFixed(2)}`,
      computedSum: sum,
    };
  }
  return {
    ok: true,
    shares: entries.map(([personId, amount]) => ({ personId, amount })),
    computedSum: sum,
  };
}

function computePercent(
  totalCents: number,
  percents: Record<ID, number>,
): SplitResult {
  const entries = Object.entries(percents).filter(([, v]) => Number.isFinite(v) && v > 0);
  if (!entries.length) {
    return { ok: false, shares: [], error: 'Enter percentages' };
  }
  // Allow tiny floating drift, but require sum within 0.01 of 100
  const sumPct = entries.reduce((a, [, v]) => a + v, 0);
  if (Math.abs(sumPct - 100) > 0.01) {
    return {
      ok: false,
      shares: [],
      error: `Percentages sum to ${sumPct.toFixed(2)} (need 100)`,
      computedSum: Math.round((sumPct / 100) * totalCents),
    };
  }

  // Compute each share floor and distribute remainder by largest-fractional-part
  const raw = entries.map(([id, p]) => ({ id, exact: (p / 100) * totalCents }));
  const floors = raw.map((r) => ({ id: r.id, base: Math.floor(r.exact), frac: r.exact - Math.floor(r.exact) }));
  const baseSum = floors.reduce((a, b) => a + b.base, 0);
  let remainder = totalCents - baseSum;
  const sorted = [...floors].sort((a, b) => b.frac - a.frac);
  const assign: Record<ID, number> = {};
  for (const f of floors) assign[f.id] = f.base;
  for (let i = 0; i < sorted.length && remainder > 0; i++) {
    assign[sorted[i].id] += 1;
    remainder -= 1;
  }
  return {
    ok: true,
    shares: entries.map(([id]) => ({ personId: id, amount: assign[id] })),
  };
}

function computeShares(
  totalCents: number,
  shares: Record<ID, number>,
): SplitResult {
  const entries = Object.entries(shares).filter(
    ([, v]) => Number.isFinite(v) && v > 0,
  );
  if (!entries.length) {
    return { ok: false, shares: [], error: 'Enter shares' };
  }
  const totalShares = entries.reduce((a, [, v]) => a + v, 0);
  // Largest-remainder method against the share total
  const raw = entries.map(([id, s]) => ({ id, exact: (s / totalShares) * totalCents }));
  const floors = raw.map((r) => ({ id: r.id, base: Math.floor(r.exact), frac: r.exact - Math.floor(r.exact) }));
  const baseSum = floors.reduce((a, b) => a + b.base, 0);
  let remainder = totalCents - baseSum;
  const sorted = [...floors].sort((a, b) => b.frac - a.frac);
  const assign: Record<ID, number> = {};
  for (const f of floors) assign[f.id] = f.base;
  for (let i = 0; i < sorted.length && remainder > 0; i++) {
    assign[sorted[i].id] += 1;
    remainder -= 1;
  }
  return {
    ok: true,
    shares: entries.map(([id]) => ({ personId: id, amount: assign[id] })),
  };
}
