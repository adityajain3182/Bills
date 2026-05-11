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
  it('returns one share per included email', () => {
    const r = computeSplits({
      totalCents: 1000,
      memberEmails: ['a@x', 'b@x', 'c@x'],
      method: 'equal',
      config: { includedEmails: ['a@x', 'b@x', 'c@x'] },
    });
    expect(r.ok).toBe(true);
    expect(r.shares.reduce((a, b) => a + b.amount, 0)).toBe(1000);
  });
  it('rejects when nobody included', () => {
    const r = computeSplits({
      totalCents: 1000,
      memberEmails: ['a@x'],
      method: 'equal',
      config: { includedEmails: [] },
    });
    expect(r.ok).toBe(false);
  });
});

describe('computeSplits — exact', () => {
  it('accepts when amounts sum to total', () => {
    const r = computeSplits({
      totalCents: 1500,
      memberEmails: ['a@x', 'b@x'],
      method: 'exact',
      config: { amounts: { 'a@x': 1000, 'b@x': 500 } },
    });
    expect(r.ok).toBe(true);
  });
  it('rejects when amounts mismatch', () => {
    const r = computeSplits({
      totalCents: 1500,
      memberEmails: ['a@x', 'b@x'],
      method: 'exact',
      config: { amounts: { 'a@x': 900, 'b@x': 500 } },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Off');
  });
});

describe('computeSplits — percent', () => {
  it('computes amounts and distributes pennies', () => {
    const r = computeSplits({
      totalCents: 1000,
      memberEmails: ['a@x', 'b@x', 'c@x'],
      method: 'percent',
      config: { percents: { 'a@x': 33.33, 'b@x': 33.33, 'c@x': 33.34 } },
    });
    expect(r.ok).toBe(true);
    expect(r.shares.reduce((a, b) => a + b.amount, 0)).toBe(1000);
  });
  it('rejects sums far from 100', () => {
    const r = computeSplits({
      totalCents: 1000,
      memberEmails: ['a@x', 'b@x'],
      method: 'percent',
      config: { percents: { 'a@x': 50, 'b@x': 49 } },
    });
    expect(r.ok).toBe(false);
  });
});

describe('computeSplits — shares', () => {
  it('splits proportionally and reconciles', () => {
    const r = computeSplits({
      totalCents: 1000,
      memberEmails: ['a@x', 'b@x', 'c@x'],
      method: 'shares',
      config: { shares: { 'a@x': 2, 'b@x': 1, 'c@x': 1 } },
    });
    expect(r.ok).toBe(true);
    expect(r.shares.reduce((a, b) => a + b.amount, 0)).toBe(1000);
    const a = r.shares.find((s) => s.email === 'a@x')!.amount;
    const b = r.shares.find((s) => s.email === 'b@x')!.amount;
    expect(a).toBeGreaterThan(b);
  });
  it('rejects when no shares entered', () => {
    const r = computeSplits({
      totalCents: 1000,
      memberEmails: ['a@x'],
      method: 'shares',
      config: { shares: {} },
    });
    expect(r.ok).toBe(false);
  });
});
