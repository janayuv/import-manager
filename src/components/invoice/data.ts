// src/components/invoice/data.ts (MODIFIED - Changed bcd and igst to numbers)
import type { Invoice } from '@/types/invoice'
import type { Item } from '@/types/item'
import type { Shipment } from '@/types/shipment'
import type { Supplier } from '@/types/supplier'

// FIXED: Added missing properties to match the Supplier type
export const dummySuppliers: Supplier[] = [
  {
    id: 'SUP-A',
    supplierName: 'Global Electronics Inc.',
    country: 'USA',
    email: 'contact@global.com',
    isActive: true,
  },
  {
    id: 'SUP-B',
    supplierName: 'Machinery Kings',
    country: 'Germany',
    email: 'info@machinerykings.de',
    isActive: true,
  },
  {
    id: 'SUP-C',
    supplierName: 'Precision Parts Co.',
    country: 'Japan',
    email: 'sales@ppc.jp',
    isActive: false,
  },
]

export const dummyInvoices: Invoice[] = [
  {
    id: 'INV-2025-001',
    invoiceNumber: 'SINV-7501',
    shipmentId: 'SHP-001',
    invoiceDate: '2025-07-20',
    status: 'Finalized',
    calculatedTotal: 15000.0,
    shipmentTotal: 15000.0,
    lineItems: [
      { id: 'li-1', itemId: 'ITM-001', quantity: 100, unitPrice: 100 },
      { id: 'li-2', itemId: 'ITM-002', quantity: 20, unitPrice: 250 },
    ],
  },
  {
    id: 'INV-2025-002',
    invoiceNumber: 'SINV-7502',
    shipmentId: 'SHP-002',
    invoiceDate: '2025-07-22',
    status: 'Draft',
    calculatedTotal: 9800.0,
    shipmentTotal: 10000.0,
    lineItems: [
      { id: 'li-3', itemId: 'ITM-003', quantity: 520, unitPrice: 15 },
      { id: 'li-4', itemId: 'ITM-001', quantity: 20, unitPrice: 100 },
    ],
  },
]

export const dummyShipments: Shipment[] = [
  {
    id: 'SHP-001',
    supplierId: 'SUP-A',
    invoiceNumber: 'SINV-7501',
    invoiceDate: '2025-07-20',
    goodsCategory: 'Electronics',
    invoiceValue: 15000,
    invoiceCurrency: 'USD',
    incoterm: 'FOB',
    shipmentMode: 'Sea',
    shipmentType: 'FCL',
    blAwbNumber: 'BL-123',
    blAwbDate: '2025-07-18',
    vesselName: 'Big Ship',
    grossWeightKg: 1200,
    etd: '2025-07-25',
    eta: '2025-08-15',
    status: 'In Transit',
    isFrozen: false,
  },
  {
    id: 'SHP-002',
    supplierId: 'SUP-B',
    invoiceNumber: 'SINV-7502',
    invoiceDate: '2025-07-22',
    goodsCategory: 'Machinery',
    invoiceValue: 10000,
    invoiceCurrency: 'USD',
    incoterm: 'CIF',
    shipmentMode: 'Sea',
    shipmentType: 'LCL',
    blAwbNumber: 'BL-456',
    blAwbDate: '2025-07-20',
    vesselName: 'Bigger Ship',
    grossWeightKg: 3500,
    etd: '2025-07-30',
    eta: '2025-08-20',
    status: 'In Transit',
    isFrozen: false,
  },
  {
    id: 'SHP-003',
    supplierId: 'SUP-C',
    invoiceNumber: 'SINV-7503',
    invoiceDate: '2025-07-25',
    goodsCategory: 'Parts',
    invoiceValue: 10000,
    invoiceCurrency: 'EUR',
    incoterm: 'EXW',
    shipmentMode: 'Air',
    shipmentType: 'Cargo',
    blAwbNumber: 'AWB-789',
    blAwbDate: '2025-07-24',
    vesselName: 'Plane 1',
    grossWeightKg: 500,
    etd: '2025-07-26',
    eta: '2025-07-28',
    status: 'Completed',
    isFrozen: false,
  },
]

export const dummyItems: Item[] = [
  // FIX: Changed bcd and igst from string to number
  {
    id: 'ITM-001',
    partNumber: 'WIDGET-A',
    itemDescription: 'A standard widget',
    unit: 'PCS',
    currency: 'USD',
    unitPrice: 100,
    hsnCode: '840001',
    bcd: 7.5,
    igst: 18,
    isActive: true,
  },
  {
    id: 'ITM-002',
    partNumber: 'GADGET-B',
    itemDescription: 'A premium gadget',
    unit: 'PCS',
    currency: 'USD',
    unitPrice: 250.5,
    hsnCode: '840002',
    bcd: 7.5,
    igst: 18,
    isActive: true,
  },
  {
    id: 'ITM-003',
    partNumber: 'COMP-C',
    itemDescription: 'A necessary component',
    unit: 'PCS',
    currency: 'USD',
    unitPrice: 15,
    hsnCode: '840003',
    bcd: 10,
    igst: 28,
    isActive: true,
  },
]
