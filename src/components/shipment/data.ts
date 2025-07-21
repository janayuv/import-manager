// src/data/shipment.ts (MODIFIED)
// Added initialShipmentTypes
import type { Shipment } from '@/types/shipment';
import type { Option } from '@/types/options';

export const dummyShipments: Shipment[] = [
  {
    id: 'SHP-0001',
    supplierId: 'Sup-001',
    invoiceNumber: 'INV-JAPAN-101',
    invoiceDate: '2025-07-15',
    goodsCategory: 'electronics',
    invoiceValue: 75000,
    invoiceCurrency: 'USD',
    incoterm: 'fob',
    shipmentMode: 'sea',
    shipmentType: 'fcl',
    blAwbNumber: 'MSCU1234567',
    blAwbDate: '2025-07-18',
    vesselName: 'Evergreen Ace',
    containerNumber: 'MSCU1234567',
    grossWeightKg: 12000,
    etd: '2025-07-20',
    eta: '2025-08-15',
    status: 'in-transit',
  },
  {
    id: 'SHP-0002',
    supplierId: 'Sup-002',
    invoiceNumber: 'INV-GER-202',
    invoiceDate: '2025-07-20',
    goodsCategory: 'machinery',
    invoiceValue: 150000,
    invoiceCurrency: 'EUR',
    incoterm: 'cif',
    shipmentMode: 'air',
    shipmentType: 'pallet',
    blAwbNumber: 'LH-98765',
    blAwbDate: '2025-07-22',
    vesselName: 'Lufthansa Cargo 123',
    grossWeightKg: 3500,
    etd: '2025-07-23',
    eta: '2025-07-25',
    status: 'delivered',
    dateOfDelivery: '2025-07-26',
  },
];

export const initialGoodsCategories: Option[] = [
  { value: 'raw-materials', label: 'Raw Materials' },
  { value: 'capital-goods', label: 'Capital Goods' },
  { value: 'samples', label: 'Samples' },
  { value: 'electronics', label: 'Electronics' },
  { value: 'machinery', label: 'Machinery' },
];

export const initialIncoterms: Option[] = [
  { value: 'fob', label: 'FOB' },
  { value: 'cif', label: 'CIF' },
  { value: 'exw', label: 'EXW' },
  { value: 'dap', label: 'DAP' },
];

export const initialShipmentModes: Option[] = [
  { value: 'sea', label: 'Sea' },
  { value: 'air', label: 'Air' },
  { value: 'courier', label: 'Courier' },
];

export const initialShipmentTypes: Option[] = [
    { value: 'fcl', label: 'FCL' },
    { value: 'lcl', label: 'LCL' },
    { value: 'pallet', label: 'Pallet' },
];

export const initialShipmentStatuses: Option[] = [
  { value: 'booking-confirmed', label: 'Booking Confirmed' },
  { value: 'in-transit', label: 'In Transit' },
  { value: 'customs-clearance', label: 'Customs Clearance' },
  { value: 'delivered', label: 'Delivered' },
];