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
  defaultCgstRate: number
  defaultSgstRate: number
  defaultIgstRate: number
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

export interface ExpenseAttachment {
  id: string
  expenseId: string
  fileName: string
  filePath: string
  fileType?: string
  uploadedAt: string
  uploadedBy?: string
}
