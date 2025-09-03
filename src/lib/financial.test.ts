import { describe, expect, it } from 'vitest';

import {
  computeDutyFromRates,
  computeDutySavings,
  computeLandedCostPerUnit,
  computePerUnitDuty,
  computePotentialDuty,
  computeSavingsFromActualVsBoe,
  round,
} from './financial';

describe('financial helpers', () => {
  it('round works as expected', () => {
    expect(round(1.2345, 2)).toBe(1.23);
    expect(round(1.235, 2)).toBe(1.24);
  });

  it('computes per unit duty', () => {
    expect(computePerUnitDuty(1000, 100)).toBe(10);
    expect(computePerUnitDuty(1000, 0)).toBe(1000);
  });

  it('computes landed cost per unit', () => {
    const assessable = 5000;
    const duty = 1000;
    const qty = 100;
    // per-unit assessable = 50, per-unit duty = 10 => 60
    expect(computeLandedCostPerUnit(assessable, duty, qty)).toBe(60);
  });

  it('computes potential duty using standard rates', () => {
    const assessable = 10000;
    const result = computePotentialDuty(assessable, {
      bcdRate: 10,
      swsRate: 10,
      igstRate: 18,
    });
    // bcd = 1000, sws = 100, igst = (10000+1000+100)*0.18=1998 => total=3098
    expect(result.bcd).toBeCloseTo(1000, 2);
    expect(result.sws).toBeCloseTo(100, 2);
    expect(result.igst).toBeCloseTo(1998, 2);
    expect(result.total).toBeCloseTo(3098, 2);
  });

  it('computes actual duty from rates same as potential helper', () => {
    const assessable = 7500;
    const result = computeDutyFromRates(assessable, {
      bcdRate: 15,
      swsRate: 10,
      igstRate: 28,
    });
    const expected = computePotentialDuty(assessable, {
      bcdRate: 15,
      swsRate: 10,
      igstRate: 28,
    });
    expect(result.total).toBeCloseTo(expected.total, 2);
  });

  it('computes savings only for CEPA/Rodtep and not for Standard', () => {
    const assessable = 10000;
    const actual = { bcdRate: 10, swsRate: 10, igstRate: 18 };
    const boeLow = computeDutyFromRates(assessable, {
      bcdRate: 5,
      swsRate: 10,
      igstRate: 18,
    });
    const boeHigh = computeDutyFromRates(assessable, {
      bcdRate: 12,
      swsRate: 10,
      igstRate: 18,
    });
    expect(
      computeSavingsFromActualVsBoe({
        method: 'Standard',
        assessableValue: assessable,
        actualRates: actual,
        boe: boeLow,
      })
    ).toBe(0);
    const cepaSaving = computeSavingsFromActualVsBoe({
      method: 'CEPA',
      assessableValue: assessable,
      actualRates: actual,
      boe: boeLow,
    });
    expect(cepaSaving).toBeGreaterThan(0);
    const rodtepSaving = computeSavingsFromActualVsBoe({
      method: 'Rodtep',
      assessableValue: assessable,
      actualRates: actual,
      boe: boeHigh,
    });
    // boe > actual -> no savings
    expect(rodtepSaving).toBe(0);
  });

  it('computes duty savings (non-negative)', () => {
    const saving = computeDutySavings(2500, 3080);
    expect(saving).toBeCloseTo(580, 2);
    const zero = computeDutySavings(4000, 3080);
    expect(zero).toBe(0);
  });
});
