import { describe, expect, it } from 'vitest';
import { computeSplits, splitEqual } from './splits';

describe('splitEqual', () => {
  it('splits evenly when divisible', () => {
    expect(splitEqual(900, 3)).toEqual([300, 300, 300]);
  });
  it('distributes remainder cents to first recipients', () => {
    expect(splitEqual(1000, 3)).toEqual([334, 333, 333]);
    expect(splitEqual(1000, 6)).toEqual([167, 167, 167, 167, 166, 166]);
  });
  it('always sums exactly to total', () => {
    for (const total of [1, 7, 10, 99, 100, 12345, 99999]) {
      for (const n of [1, 2, 3, 4, 5, 7, 11]) {
        const arr = splitEqual(total, n);
        expect(arr.reduce((a, b) => a + b, 0)).toBe(total);
        expect(arr).toHaveLength(n);
      }
    }
  });
  it('handles single member', () => {
    expect(splitEqual(1234, 1)).toEqual([1234]);
  });
  it('handles zero', () => {
    expect(splitEqual(0, 4)).toEqual([0, 0, 0, 0]);
  });
});

describe('computeSplits — equal', () => {
  it('returns one share per included id', () => {
    const r = computeSplits({
      totalCents: 1000,
      memberIds: ['a', 'b', 'c'],
      method: 'equal',
      config: { includedIds: ['a', 'b', 'c'] },
    });
    expect(r.ok).toBe(true);
    expect(r.shares.map((s) => s.amount).reduce((a, b) => a + b, 0)).toBe(1000);
  });
  it('rejects when nobody included', () => {
    const r = computeSplits({
      totalCents: 1000,
      memberIds: ['a'],
      method: 'equal',
      config: { includedIds: [] },
    });
    expect(r.ok).toBe(false);
  });
});

describe('computeSplits — exact', () => {
  it('accepts when amounts sum to total', () => {
    const r = computeSplits({
      totalCents: 1500,
      memberIds: ['a', 'b'],
      method: 'exact',
      config: { amounts: { a: 1000, b: 500 } },
    });
    expect(r.ok).toBe(true);
  });
  it('rejects when amounts mismatch', () => {
    const r = computeSplits({
      totalCents: 1500,
      memberIds: ['a', 'b'],
      method: 'exact',
      config: { amounts: { a: 900, b: 500 } },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Off');
  });
});

describe('computeSplits — percent', () => {
  it('computes amounts and distributes pennies', () => {
    const r = computeSplits({
      totalCents: 1000,
      memberIds: ['a', 'b', 'c'],
      method: 'percent',
      config: { percents: { a: 33.33, b: 33.33, c: 33.34 } },
    });
    expect(r.ok).toBe(true);
    expect(r.shares.reduce((a, b) => a + b.amount, 0)).toBe(1000);
  });
  it('rejects sums far from 100', () => {
    const r = computeSplits({
      totalCents: 1000,
      memberIds: ['a', 'b'],
      method: 'percent',
      config: { percents: { a: 50, b: 49 } },
    });
    expect(r.ok).toBe(false);
  });
});

describe('computeSplits — shares', () => {
  it('splits proportionally to share counts and reconciles', () => {
    const r = computeSplits({
      totalCents: 1000,
      memberIds: ['a', 'b', 'c'],
      method: 'shares',
      config: { shares: { a: 2, b: 1, c: 1 } },
    });
    expect(r.ok).toBe(true);
    expect(r.shares.reduce((a, b) => a + b.amount, 0)).toBe(1000);
    const a = r.shares.find((s) => s.personId === 'a')!.amount;
    const b = r.shares.find((s) => s.personId === 'b')!.amount;
    expect(a).toBeGreaterThan(b);
  });
  it('rejects when no shares entered', () => {
    const r = computeSplits({
      totalCents: 1000,
      memberIds: ['a'],
      method: 'shares',
      config: { shares: {} },
    });
    expect(r.ok).toBe(false);
  });
});
