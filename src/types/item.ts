// src/types/item.ts (NEW FILE)
// Defines the data structure for an Item in the master list.
export interface Item {
    id: string; // e.g., "ITM-0001"
    partNumber: string;
    itemDescription: string;
    unit: string;
    currency: string;
    unitPrice: number;
    hsnCode: string;
    supplierId?: string; // Optional as per your plan
    isActive: boolean;
    countryOfOrigin?: string;
    bcd?: string; // Basic Customs Duty
    sws?: string; // Social Welfare Surcharge
    igst?: string; // Integrated Goods and Services Tax
    technicalWriteUp?: string;
    category?: string;
    endUse?: string;
    netWeightKg?: number;
    purchaseUom?: string;
    grossWeightPerUomKg?: number;
    photoPath?: string; // Will store a local path to the image
}