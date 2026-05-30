import { describe, expect, it } from 'vitest';

import {
  invoiceTaxSnapshotFromItem,
  parsePercentage,
} from './parse-percentage';
import type { Item } from '@/types/item';

describe('parsePercentage', () => {
  it('returns 0 for null or undefined', () => {
    expect(parsePercentage(null)).toBe(0);
    expect(parsePercentage(undefined)).toBe(0);
  });

  it('returns numeric value as-is', () => {
    expect(parsePercentage(10)).toBe(10);
    expect(parsePercentage(7.5)).toBe(7.5);
    expect(parsePercentage(0)).toBe(0);
  });

  it('returns 0 for non-finite numbers', () => {
    expect(parsePercentage(NaN)).toBe(0);
    expect(parsePercentage(Infinity)).toBe(0);
  });

  it('parses string with percent sign', () => {
    expect(parsePercentage('10%')).toBe(10);
    expect(parsePercentage('7.5%')).toBe(7.5);
    expect(parsePercentage('0%')).toBe(0);
  });

  it('parses plain numeric string', () => {
    expect(parsePercentage('10')).toBe(10);
    expect(parsePercentage('7.5')).toBe(7.5);
  });

  it('trims whitespace around string', () => {
    expect(parsePercentage('  10%  ')).toBe(10);
    expect(parsePercentage(' 5 ')).toBe(5);
  });

  it('returns 0 for non-numeric strings', () => {
    expect(parsePercentage('abc')).toBe(0);
    expect(parsePercentage('%')).toBe(0);
    expect(parsePercentage('')).toBe(0);
  });
});

describe('invoiceTaxSnapshotFromItem', () => {
  const makeItem = (bcd: string, sws: string, igst: string): Item =>
    ({ bcd, sws, igst }) as unknown as Item;

  it('extracts duty percentages from item master', () => {
    const snapshot = invoiceTaxSnapshotFromItem(makeItem('10%', '10%', '18%'));
    expect(snapshot.dutyPercent).toBe(10);
    expect(snapshot.swsPercent).toBe(10);
    expect(snapshot.igstPercent).toBe(18);
  });

  it('handles zero rates', () => {
    const snapshot = invoiceTaxSnapshotFromItem(makeItem('0', '0', '0'));
    expect(snapshot.dutyPercent).toBe(0);
    expect(snapshot.swsPercent).toBe(0);
    expect(snapshot.igstPercent).toBe(0);
  });

  it('handles mixed string/number formats', () => {
    const snapshot = invoiceTaxSnapshotFromItem(makeItem('5', '10%', '12'));
    expect(snapshot.dutyPercent).toBe(5);
    expect(snapshot.swsPercent).toBe(10);
    expect(snapshot.igstPercent).toBe(12);
  });
});
