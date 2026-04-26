/**
 * Shared validation for AI extraction preview (used by dialog and unit tests).
 */
import type { SaveAiExtractedPayload } from '@/types/ai-invoice-extraction';

export type EditableLineItem = {
  key: string;
  partNumber: string;
  itemName: string;
  quantity: string;
  unitPrice: string;
};

export type FieldErrors = {
  supplierName?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  shipmentTotal?: string;
  lines?: Record<
    string,
    { partNumber?: string; quantity?: string; unitPrice?: string }
  >;
};

export type ExtractionFormState = {
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceValue: string;
  invoiceCurrency: string;
  shipmentTotal: string;
  lines: EditableLineItem[];
};

export function validateAiExtractionForm(s: ExtractionFormState): {
  ok: boolean;
  errors: FieldErrors;
} {
  const errors: FieldErrors = {};
  if (!s.supplierName.trim()) {
    errors.supplierName = 'Supplier name is required.';
  }
  if (!s.invoiceNumber?.trim()) {
    errors.invoiceNumber = 'Invoice number is required';
  }
  if (!s.invoiceDate?.trim()) {
    errors.invoiceDate = 'Invoice date is required';
  }
  const st = parseFloat(s.shipmentTotal);
  if (Number.isNaN(st)) {
    errors.shipmentTotal = 'Shipment total must be a number.';
  }

  const lineErr: NonNullable<FieldErrors['lines']> = {};
  for (const li of s.lines) {
    const le: (typeof lineErr)[string] = {};
    if (!li.partNumber.trim()) {
      le.partNumber = 'Part number is required.';
    }
    const q = parseFloat(li.quantity);
    if (Number.isNaN(q) || q <= 0) {
      le.quantity = 'Quantity must be greater than 0.';
    }
    const p = parseFloat(li.unitPrice);
    if (Number.isNaN(p) || p <= 0) {
      le.unitPrice = 'Unit price must be greater than 0.';
    }
    if (Object.keys(le).length) {
      lineErr[li.key] = le;
    }
  }
  if (Object.keys(lineErr).length) {
    errors.lines = lineErr;
  }

  const ok = Object.keys(errors).length === 0;
  return { ok, errors };
}

export function formStateToSavePayload(
  s: ExtractionFormState
): SaveAiExtractedPayload {
  const lineItems = s.lines.map(li => ({
    partNumber: li.partNumber.trim(),
    itemName: li.itemName.trim(),
    quantity: parseFloat(li.quantity),
    unitPrice: parseFloat(li.unitPrice),
  }));
  const iv = parseFloat(s.invoiceValue);
  const st = parseFloat(s.shipmentTotal);
  return {
    supplier: { supplierName: s.supplierName.trim() },
    shipment: {
      invoiceNumber: s.invoiceNumber.trim(),
      invoiceDate: s.invoiceDate.trim(),
      invoiceValue: Number.isNaN(iv) ? 0 : iv,
      invoiceCurrency: s.invoiceCurrency.trim() || 'USD',
    },
    invoice: { shipmentTotal: Number.isNaN(st) ? 0 : st },
    lineItems,
  };
}
