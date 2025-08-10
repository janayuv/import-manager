// src/types/boe.ts (MODIFIED)
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
