import { describe, expect, it } from 'vitest';

import {
  formStateToSavePayload,
  validateAiExtractionForm,
  type ExtractionFormState,
} from './ai-invoice-extraction-validate';

const base: ExtractionFormState = {
  supplierName: 'ACME',
  invoiceNumber: 'INV-1',
  invoiceDate: '2025-01-01',
  invoiceValue: '100',
  invoiceCurrency: 'USD',
  shipmentTotal: '100',
  lines: [
    {
      key: 'a',
      partNumber: 'P-1',
      itemName: 'Bolt',
      quantity: '10',
      unitPrice: '5',
    },
  ],
};

describe('validateAiExtractionForm', () => {
  it('passes for valid data', () => {
    const { ok, errors } = validateAiExtractionForm(base);
    expect(ok).toBe(true);
    expect(Object.keys(errors).length).toBe(0);
  });

  it('requires supplierName', () => {
    const { ok, errors } = validateAiExtractionForm({
      ...base,
      supplierName: '  ',
    });
    expect(ok).toBe(false);
    expect(errors.supplierName).toBeDefined();
  });

  it('requires invoiceNumber and invoiceDate', () => {
    const r1 = validateAiExtractionForm({ ...base, invoiceNumber: '' });
    expect(r1.ok).toBe(false);
    expect(r1.errors.invoiceNumber).toBeDefined();
    const r2 = validateAiExtractionForm({ ...base, invoiceDate: '' });
    expect(r2.ok).toBe(false);
    expect(r2.errors.invoiceDate).toBeDefined();
  });

  it('rejects non-positive quantity and unit price', () => {
    const { ok, errors } = validateAiExtractionForm({
      ...base,
      lines: [{ ...base.lines[0]!, quantity: '0', unitPrice: '1' }],
    });
    expect(ok).toBe(false);
    expect(errors.lines?.a?.quantity).toBeDefined();

    const r2 = validateAiExtractionForm({
      ...base,
      lines: [{ ...base.lines[0]!, quantity: '1', unitPrice: '0' }],
    });
    expect(r2.ok).toBe(false);
    expect(r2.errors.lines?.a?.unitPrice).toBeDefined();
  });

  it('requires part number on lines', () => {
    const { ok, errors } = validateAiExtractionForm({
      ...base,
      lines: [{ ...base.lines[0]!, partNumber: '  ' }],
    });
    expect(ok).toBe(false);
    expect(errors.lines?.a?.partNumber).toBeDefined();
  });
});

describe('formStateToSavePayload', () => {
  it('builds lineItems for invoke', () => {
    const p = formStateToSavePayload(base);
    expect(p.lineItems).toHaveLength(1);
    expect(p.lineItems[0]!.partNumber).toBe('P-1');
    expect(p.supplier.supplierName).toBe('ACME');
    expect(p.invoice.shipmentTotal).toBe(100);
  });
});
