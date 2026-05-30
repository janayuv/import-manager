import { describe, expect, it } from 'vitest';

import {
  formatDateForDisplay,
  formatDateForInput,
  parseFlexibleDate,
} from './date-format';

describe('parseFlexibleDate', () => {
  it('returns null for null, undefined, empty string', () => {
    expect(parseFlexibleDate(null)).toBeNull();
    expect(parseFlexibleDate(undefined)).toBeNull();
    expect(parseFlexibleDate('')).toBeNull();
  });

  it('parses dd-MM-yyyy (display format)', () => {
    const d = parseFlexibleDate('15-06-2024');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
    expect(d!.getMonth()).toBe(5); // June = index 5
    expect(d!.getDate()).toBe(15);
  });

  it('parses yyyy-MM-dd (input/ISO format)', () => {
    const d = parseFlexibleDate('2024-06-15');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
    expect(d!.getMonth()).toBe(5);
    expect(d!.getDate()).toBe(15);
  });

  it('returns null for invalid strings', () => {
    expect(parseFlexibleDate('not-a-date')).toBeNull();
  });
});

describe('formatDateForDisplay', () => {
  it('converts yyyy-MM-dd to dd-MM-yyyy', () => {
    expect(formatDateForDisplay('2024-06-15')).toBe('15-06-2024');
  });

  it('accepts dd-MM-yyyy and returns it unchanged', () => {
    expect(formatDateForDisplay('15-06-2024')).toBe('15-06-2024');
  });

  it('returns empty string for null/undefined/empty', () => {
    expect(formatDateForDisplay(null)).toBe('');
    expect(formatDateForDisplay(undefined)).toBe('');
    expect(formatDateForDisplay('')).toBe('');
  });

  it('returns empty string for invalid input', () => {
    expect(formatDateForDisplay('not-a-date')).toBe('');
  });

  it('handles end-of-month dates correctly', () => {
    expect(formatDateForDisplay('2024-12-31')).toBe('31-12-2024');
  });
});

describe('formatDateForInput', () => {
  it('converts dd-MM-yyyy to yyyy-MM-dd', () => {
    expect(formatDateForInput('15-06-2024')).toBe('2024-06-15');
  });

  it('accepts yyyy-MM-dd and returns it unchanged', () => {
    expect(formatDateForInput('2024-06-15')).toBe('2024-06-15');
  });

  it('returns empty string for null/undefined/empty', () => {
    expect(formatDateForInput(null)).toBe('');
    expect(formatDateForInput(undefined)).toBe('');
    expect(formatDateForInput('')).toBe('');
  });

  it('returns empty string for invalid input', () => {
    expect(formatDateForInput('not-a-date')).toBe('');
  });

  it('round-trips with formatDateForDisplay', () => {
    const original = '2024-03-20';
    const displayed = formatDateForDisplay(original);
    expect(formatDateForInput(displayed)).toBe(original);
  });
});
