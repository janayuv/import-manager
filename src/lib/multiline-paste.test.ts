import { describe, expect, it } from 'vitest';

import { parseMultiLinePaste } from './multiline-paste';

describe('parseMultiLinePaste', () => {
  it('returns empty array for empty input', () => {
    expect(parseMultiLinePaste('')).toEqual([]);
    expect(parseMultiLinePaste('   ')).toEqual([]);
  });

  it('parses a single tab-delimited line (PN, QTY, PRICE)', () => {
    const input = 'ABC-001\t10\t99.50';
    const result = parseMultiLinePaste(input);
    expect(result).toHaveLength(1);
    expect(result[0].partNumber).toBe('ABC-001');
    expect(result[0].quantity).toBe(10);
    expect(result[0].unitPrice).toBe(99.5);
  });

  it('parses multiple tab-delimited lines', () => {
    const input = 'ABC-001\t5\t100.00\nXYZ-002\t10\t50.00';
    const result = parseMultiLinePaste(input);
    expect(result).toHaveLength(2);
    expect(result[0].partNumber).toBe('ABC-001');
    expect(result[1].partNumber).toBe('XYZ-002');
  });

  it('parses comma-delimited lines', () => {
    const input = 'PART-A,20,25.00';
    const result = parseMultiLinePaste(input, { delimiter: 'comma' });
    expect(result).toHaveLength(1);
    expect(result[0].partNumber).toBe('PART-A');
    expect(result[0].quantity).toBe(20);
    expect(result[0].unitPrice).toBe(25.0);
  });

  it('skips blank lines', () => {
    const input = 'ABC-001\t5\t100.00\n\n\nXYZ-002\t10\t50.00';
    const result = parseMultiLinePaste(input);
    expect(result).toHaveLength(2);
  });

  it('normalises CRLF line endings', () => {
    const input = 'ABC-001\t5\t100.00\r\nXYZ-002\t10\t50.00';
    const result = parseMultiLinePaste(input);
    expect(result).toHaveLength(2);
  });

  it('skips header row when skipHeader is true', () => {
    const input =
      'Part Number\tQuantity\tUnit Price\nABC-001\t5\t100.00\nXYZ-002\t10\t50.00';
    const withHeader = parseMultiLinePaste(input, { skipHeader: false });
    const withoutHeader = parseMultiLinePaste(input, { skipHeader: true });
    expect(withoutHeader.length).toBe(withHeader.length - 1);
  });

  it('preserves raw string on each result', () => {
    const input = 'ABC-001\t5\t100.00';
    const result = parseMultiLinePaste(input);
    expect(result[0].raw).toBe('ABC-001\t5\t100.00');
  });

  it('handles pipe-delimited lines', () => {
    const input = 'PART-B|15|30.00';
    const result = parseMultiLinePaste(input, { delimiter: 'pipe' });
    expect(result).toHaveLength(1);
    expect(result[0].partNumber).toBe('PART-B');
    expect(result[0].quantity).toBe(15);
  });
});
