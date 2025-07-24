// src/data/item.ts (MODIFIED)
// Corrected the photoPath to be a clean URL.
import type { Item } from '@/types/item';
import type { Option } from '@/types/options';

export const dummyItems: Item[] = [
    {
        id: "ITM-0001",
        partNumber: "SS-SCREW-5MM",
        itemDescription: "5mm Stainless Steel Screws - Box of 1000",
        unit: "PCS",
        currency: "USD",
        unitPrice: 0.05,
        hsnCode: "73181500",
        supplierId: "Sup-001",
        isActive: true,
        countryOfOrigin: "Japan",
        bcd: "10%",
        sws: "10%",
        igst: "18%",
        technicalWriteUp: "High-grade 304 stainless steel screws, suitable for all weather conditions. Phillips head.",
        category: "Fasteners",
        endUse: "Air Cleaner Assembly",
        netWeightKg: 0.002,
        purchaseUom: "Box",
        grossWeightPerUomKg: 2.1,
        photoPath: "https://placehold.co/400x400/eee/ccc?text=SS-SCREW-5MM",
    },
    {
        id: "ITM-0002",
        partNumber: "FIL-OIL-XYZ",
        itemDescription: "Engine Oil Filter Model XYZ",
        unit: "PCS",
        currency: "EUR",
        unitPrice: 12.50,
        hsnCode: "84212300",
        supplierId: "Sup-002",
        isActive: true,
        countryOfOrigin: "Germany",
        bcd: "7.5%",
        sws: "10%",
        igst: "28%",
        technicalWriteUp: "High-performance oil filter for XYZ series engines. Recommended replacement every 10,000 km.",
        category: "Filters",
        endUse: "Engine Assembly",
        netWeightKg: 0.8,
        purchaseUom: "Carton",
        grossWeightPerUomKg: 10,
        photoPath: "https://placehold.co/400x400/eee/ccc?text=FIL-OIL-XYZ",
    }
];

// ... rest of file is unchanged
export const initialUnits: Option[] = [ { value: 'PCS', label: 'PCS' }, { value: 'KGS', label: 'KGS' }, { value: 'Roll', label: 'Roll' } ];
export const initialCurrencies: Option[] = [ { value: 'USD', label: 'USD' }, { value: 'EUR', label: 'EUR' }, { value: 'INR', label: 'INR' } ];
export const initialCountries: Option[] = [ { value: 'China', label: 'China' }, { value: 'Germany', label: 'Germany' }, { value: 'USA', label: 'USA' }, { value: 'Japan', label: 'Japan' } ];
export const initialBcdRates: Option[] = [ { value: '10%', label: '10%' }, { value: '7.5%', label: '7.5%' }, { value: '15%', label: '15%' } ];
export const initialSwsRates: Option[] = [ { value: '10%', label: '10%' } ];
export const initialIgstRates: Option[] = [ { value: '12%', label: '12%' }, { value: '18%', label: '18%' }, { value: '28%', label: '28%' } ];
export const initialCategories: Option[] = [ { value: 'Components', label: 'Components' }, { value: 'Consumables', label: 'Consumables' }, { value: 'Fasteners', label: 'Fasteners' }, { value: 'Filters', label: 'Filters' } ];
export const initialEndUses: Option[] = [ { value: 'Air Cleaner Assembly', label: 'Air Cleaner Assembly' }, { value: 'Engine Assembly', label: 'Engine Assembly' }, { value: 'Manifold', label: 'Manifold' } ];
export const initialPurchaseUoms: Option[] = [ { value: 'Box', label: 'Box' }, { value: 'Roll', label: 'Roll' }, { value: 'Litter', label: 'Litter' }, { value: 'Carton', label: 'Carton' } ];
