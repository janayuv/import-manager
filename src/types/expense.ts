export interface ServiceProvider {
  id: string
  name: string
  gstin?: string
  state?: string
  contactPerson?: string
  contactEmail?: string
  contactPhone?: string
}

export interface ExpenseType {
  id: string
  name: string
  defaultCgstRate: number // Now in basis points (900 = 9.00%)
  defaultSgstRate: number // Now in basis points (900 = 9.00%)
  defaultIgstRate: number // Now in basis points (900 = 9.00%)
  isActive: boolean
}

// NEW: Expense Invoice interface
export interface ExpenseInvoice {
  id: string
  shipmentId: string
  serviceProviderId: string
  invoiceNo: string
  invoiceDate: string
  totalAmount: number
  totalCgstAmount: number
  totalSgstAmount: number
  totalIgstAmount: number
  remarks?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}

// UPDATED: Expense interface now references expense invoice
export interface Expense {
  id: string
  expenseInvoiceId: string
  expenseTypeId: string
  amount: number
  cgstRate: number
  sgstRate: number
  igstRate: number
  tdsRate: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  tdsAmount: number
  totalAmount: number
  remarks?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}

// NEW: Combined interface for creating expense invoice with expenses
export interface ExpenseInvoiceWithExpenses {
  shipmentId: string
  serviceProviderId: string
  invoiceNo: string
  invoiceDate: string
  remarks?: string
  expenses: Omit<
    Expense,
    | 'id'
    | 'expenseInvoiceId'
    | 'cgstAmount'
    | 'sgstAmount'
    | 'igstAmount'
    | 'tdsAmount'
    | 'totalAmount'
    | 'createdBy'
    | 'createdAt'
    | 'updatedAt'
  >[]
}

// NEW: Interface for expense with invoice data for display
export interface ExpenseWithInvoice extends Expense {
  serviceProviderId: string
  invoiceNo: string
  invoiceDate: string
}

export interface ExpenseAttachment {
  id: string
  expenseId: string
  fileName: string
  filePath: string
  fileType?: string
  uploadedAt: string
  uploadedBy?: string
}

// ============================================================================
// PRODUCTION-GRADE EXPENSE MODULE INTERFACES
// ============================================================================

/**
 * Core expense line structure for the production-grade module
 * All amounts are in paise (smallest currency unit)
 * Tax rates are in percentages (9 = 9.00%) for frontend, converted to basis points for backend
 */
export interface ExpenseLine {
  expense_type_id: string
  amount_paise: number
  cgst_rate: number // Percentage (9 = 9.00%) in frontend, converted to basis points for backend
  sgst_rate: number
  igst_rate: number
  tds_rate: number
  remarks?: string
}

/**
 * Invoice payload for creation/updates
 */
export interface ExpenseInvoicePayload {
  shipment_id: string
  service_provider_id: string
  invoice_number: string
  invoice_date: string
  currency: string
  idempotency_key?: string
  lines: ExpenseLine[]
}

/**
 * Response from create/update operations
 */
export interface ExpenseInvoiceResponse {
  invoice_id: string
  total_amount_paise: number
  total_cgst_amount_paise: number
  total_sgst_amount_paise: number
  total_igst_amount_paise: number
  total_tds_amount_paise: number
  version: number
}

/**
 * Preview response with detailed line breakdown
 */
export interface ExpenseInvoicePreview {
  lines: ExpenseLinePreview[]
  total_amount_paise: number
  total_cgst_amount_paise: number
  total_sgst_amount_paise: number
  total_igst_amount_paise: number
  total_tds_amount_paise: number
  net_amount_paise: number
}

/**
 * Individual line preview with calculated amounts
 * Tax rates from backend are in basis points, but frontend displays as percentages
 */
export interface ExpenseLinePreview {
  expense_type_id: string
  expense_type_name: string
  amount_paise: number
  cgst_rate: number // From backend in basis points, frontend converts to percentage for display
  sgst_rate: number
  igst_rate: number
  tds_rate: number
  cgst_amount_paise: number
  sgst_amount_paise: number
  igst_amount_paise: number
  tds_amount_paise: number
  total_amount_paise: number
  net_amount_paise: number
  remarks?: string
}

/**
 * Request for combining duplicate expense lines
 */
export interface CombineDuplicatesRequest {
  separator?: string
}
