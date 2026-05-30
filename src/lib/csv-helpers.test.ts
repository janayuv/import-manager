import { describe, expect, it } from 'vitest';

import {
  generateCsvTemplate,
  normalizeCsvEncoding,
  validateCsvContent,
} from './csv-helpers';

describe('validateCsvContent', () => {
  const itemHeaders = [
    'partNumber',
    'itemDescription',
    'unit',
    'currency',
    'unitPrice',
  ];

  it('returns valid for well-formed items CSV', () => {
    const csv = [
      'partNumber,itemDescription,unit,currency,unitPrice',
      'ABC-001,Widget A,PCS,USD,10.00',
      'XYZ-002,Widget B,KG,USD,5.50',
    ].join('\n');

    const result = validateCsvContent(csv, itemHeaders, 'items');
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.rowCount).toBe(2);
  });

  it('reports error for missing required headers', () => {
    const csv = 'partNumber,itemDescription\nABC-001,Widget A';
    const result = validateCsvContent(csv, itemHeaders, 'items');
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.column === 'headers')).toBe(true);
  });

  it('returns 0 rowCount for empty CSV content', () => {
    const result = validateCsvContent('', itemHeaders, 'items');
    expect(result.rowCount).toBe(0);
  });

  it('accepts BOM-prefixed UTF-8 without encoding errors', () => {
    const bom = '﻿';
    const csv = `${bom}partNumber,itemDescription,unit,currency,unitPrice\nABC-001,Widget,PCS,USD,1.00`;
    const result = validateCsvContent(csv, itemHeaders, 'items');
    expect(result.errors.filter(e => e.column === 'encoding')).toHaveLength(0);
  });
});

describe('normalizeCsvEncoding', () => {
  it('strips UTF-8 BOM prefix', () => {
    const bom = '﻿';
    const content = `${bom}partNumber,description`;
    const normalized = normalizeCsvEncoding(content);
    expect(normalized.startsWith('﻿')).toBe(false);
    expect(normalized).toBe('partNumber,description');
  });

  it('returns content unchanged when no BOM present', () => {
    const content = 'partNumber,description';
    expect(normalizeCsvEncoding(content)).toBe(content);
  });
});

describe('generateCsvTemplate', () => {
  it('generates items template with required headers', () => {
    const template = generateCsvTemplate('items');
    expect(template).toContain('partNumber');
    expect(template).toContain('itemDescription');
    expect(template).toContain('unitPrice');
  });

  it('generates shipments template with required headers', () => {
    const template = generateCsvTemplate('shipments');
    expect(template).toContain('invoiceNumber');
    expect(template).toContain('invoiceDate');
  });

  it('generates suppliers template with required headers', () => {
    const template = generateCsvTemplate('suppliers');
    expect(template).toContain('supplierName');
    expect(template).toContain('country');
  });
});
