/**
 * JSON shape from `extract_invoice_with_ai` (serde camelCase).
 */

/** In-app extraction backend (Tauri; `local` = Ollama). */
export type AiExtractionProvider = 'mock' | 'deepseek' | 'local';

/** Input body for `extract_invoice_with_ai` (camelCase). */
export type ExtractInvoiceWithAiRequest = {
  fileBytes: number[];
  fileName: string;
  supplierHint: string | null;
  /** Defaults to `mock` on the backend when omitted. */
  provider: AiExtractionProvider;
};

export type ExtractInvoiceSupplier = {
  supplierName: string;
};

export type ExtractInvoiceShipment = {
  /** `null` when the model sent JSON `null` or omitted the field. */
  invoiceNumber: string | null;
  invoiceDate: string | null;
  invoiceValue: number | null;
  invoiceCurrency: string | null;
};

export type ExtractInvoiceLineItem = {
  partNumber: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
};

export type ExtractInvoiceInvoice = {
  shipmentTotal: number | null;
  lineItems: ExtractInvoiceLineItem[];
};

export type ExtractInvoiceResponse = {
  supplier: ExtractInvoiceSupplier;
  shipment: ExtractInvoiceShipment;
  invoice: ExtractInvoiceInvoice;
  confidenceScore: number;
  logId: number;
};

/** Payload for `save_ai_extracted_invoice` (camelCase). */
export type SaveAiExtractedPayload = {
  supplier: { supplierName: string };
  shipment: {
    invoiceNumber: string;
    invoiceDate: string;
    invoiceValue: number;
    invoiceCurrency: string;
  };
  invoice: { shipmentTotal: number };
  lineItems: {
    partNumber: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
  }[];
};

export type SaveAiExtractedResult = {
  shipmentId: string;
  invoiceId: string;
  warnings: string[];
};

/** One row in [`process_invoice_batch`] (camelCase). */
export type BatchInvoiceItemResult = {
  fileName: string;
  status: 'success' | 'error';
  error: string | null;
  confidenceScore: number | null;
  logId: number | null;
  /** Present when `status` is `success` */
  extraction: ExtractInvoiceResponse | null;
};

/** Result of [`process_invoice_batch`] (camelCase). */
export type ProcessInvoiceBatchResult = {
  results: BatchInvoiceItemResult[];
  total: number;
  successCount: number;
  errorCount: number;
};

/** Emitted on channel `ai-invoice-batch-progress` */
export type AiInvoiceBatchProgressPayload = {
  current: number;
  total: number;
  fileName: string;
};
