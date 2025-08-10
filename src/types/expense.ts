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

export interface Expense {
  id: string
  shipmentId: string
  expenseTypeId: string
  serviceProviderId: string
  invoiceNo: string
  invoiceDate: string
  amount: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  totalAmount: number
  remarks?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
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
