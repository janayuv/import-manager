// src/types/invoice.ts (MODIFIED - Exported FlattenedInvoiceLine)
export interface InvoiceLineItem {
  id: string;
  itemId: string;
  itemName?: string;
  quantity: number;
  unitPrice: number;
  /** Snapshot of duty (BCD) % at line save time; editable, not from Item Master at display. */
  dutyPercent?: number;
  swsPercent?: number;
  igstPercent?: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  shipmentId: string;
  invoiceDate: string;
  status: 'Draft' | 'Finalized' | 'Mismatch';
  calculatedTotal: number;
  shipmentTotal: number;
  lineItems?: InvoiceLineItem[];
}

// FIXED: Added export keyword
export interface FlattenedInvoiceLine {
  invoiceId: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  partNumber: string;
  itemDescription: string;
  hsnCode: string;
  currency: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  bcd: number;
  sws: number;
  igst: number;
  invoiceTotal: number;
  shipmentTotal: number;
  status: 'Draft' | 'Finalized' | 'Mismatch';
}
