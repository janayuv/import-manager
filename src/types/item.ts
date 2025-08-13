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
  bcd?: string | number // Database stores as string (e.g., "7.5%"), but can be number
  sws?: string | number // Database stores as string (e.g., "5%"), but can be number
  igst?: string | number // Database stores as string (e.g., "18%"), but can be number
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
