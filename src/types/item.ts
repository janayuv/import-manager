// src/types/item.ts (NEW FILE)
// Defines the data structure for an Item in the master list.
export interface Item {
  id: string
  partNumber: string
  itemDescription: string
  unit: string
  currency: string
  unitPrice: number
  hsnCode: string
  supplierId?: string
  isActive: boolean
  countryOfOrigin?: string
  bcd?: number
  sws?: number
  igst?: number
  technicalWriteUp?: string
  category?: string
  endUse?: string
  netWeightKg?: number
  purchaseUom?: string
  grossWeightPerUomKg?: number
  photoPath?: string
}
export interface Option {
  value: string
  label: string
}
