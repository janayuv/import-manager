/*
================================================================================
| FILE: src/types/index.ts (NEW & CONSOLIDATED)                                |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| A single, central file for all shared TypeScript types, based on your        |
| reference files. This is now the single source of truth.                     |
================================================================================
*/

// --- Core Data Structures ---

export interface BoeDetails {
  id: string
  beNumber: string
  beDate: string
  location: string
  totalAssessmentValue: number
  dutyAmount: number
  paymentDate?: string // Changed from paymentStatus
  dutyPaid?: number
  challanNumber?: string
  refId?: string
  transactionId?: string
}

export interface InvoiceItem {
  partNo: string
  description: string
  qty: number // NEW
  unitPrice: number // NEW
  hsCode: string // NEW
  lineTotal: number
  actualBcdRate: number
  actualSwsRate: number
  actualIgstRate: number
}

export interface Shipment {
  id: string
  supplierName: string
  invoiceNumber: string
  invoiceDate: string
  invoiceValue: number
  invoiceCurrency: string
  incoterm: string
  status: 'Delivered' | 'In Transit' | string
  items: InvoiceItem[]
}

// --- BOE Entry & Calculation Types ---

export type CalculationMethod = 'Standard' | 'CEPA' | 'Rodtep'

export interface BoeItemInput {
  partNo: string
  calculationMethod: CalculationMethod
  boeBcdRate: number
  boeSwsRate: number
  boeIgstRate: number
}

export interface CalculatedDutyItem {
  partNo: string
  description: string
  assessableValue: number
  bcdValue: number
  swsValue: number
  igstValue: number
}

export interface CalculationResult {
  calculatedItems: CalculatedDutyItem[]
  bcdTotal: number
  swsTotal: number
  igstTotal: number
  interest: number
  customsDutyTotal: number
}

// --- Phase 3: Operational Hub additions ---
export type BoeStatus = 'Awaiting BOE Data' | 'Discrepancy Found' | 'Reconciled' | 'Investigation' | 'Closed'

export interface Attachment {
  id: string
  documentType: string // e.g., 'Commercial Invoice', 'BOE Scan', 'Packing List'
  fileName: string
  url: string // link to stored document
  uploadedAt: string // ISO date string
}

// Represents a fully saved BOE record, combining inputs and results
export interface SavedBoe {
  id: string
  shipmentId: string
  boeId?: string
  invoiceNumber: string
  supplierName: string
  status: BoeStatus // NEW: workflow status
  formValues: {
    supplierName: string
    shipmentId: string
    // FIX: Removed redundant boeId from here
    exchangeRate: number
    freightCost: number
    exwCost: number
    insuranceRate: number
    interest?: number
  }
  itemInputs: BoeItemInput[]
  calculationResult: CalculationResult
  attachments?: Attachment[] // NEW: linked documents
}
