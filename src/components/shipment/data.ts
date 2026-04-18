import type { Option } from '@/types/options';
import type { Shipment } from '@/types/shipment';

export const dummyShipments: Shipment[] = [
  {
    id: 'SHP-0001',
    supplierId: 'Sup-001',
    invoiceNumber: 'INV-JAPAN-101',
    invoiceDate: '15-07-2025',
    goodsCategory: 'electronics',
    invoiceValue: 75000,
    invoiceCurrency: 'USD',
    incoterm: 'fob',
    shipmentMode: 'sea',
    shipmentType: 'fcl',
    blAwbNumber: 'MSCU1234567',
    blAwbDate: '18-07-2025',
    vesselName: 'Evergreen Ace',
    containerNumber: 'MSCU1234567',
    grossWeightKg: 12000,
    etd: '20-07-2025',
    eta: '15-08-2025',
    status: 'in-transit',
    isFrozen: false,
  },
  {
    id: 'SHP-0002',
    supplierId: 'Sup-002',
    invoiceNumber: 'INV-GER-202',
    invoiceDate: '20-07-2025',
    goodsCategory: 'machinery',
    invoiceValue: 150000,
    invoiceCurrency: 'EUR',
    incoterm: 'cif',
    shipmentMode: 'air',
    shipmentType: 'pallet',
    blAwbNumber: 'LH-98765',
    blAwbDate: '22-07-2025',
    vesselName: 'Lufthansa Cargo 123',
    grossWeightKg: 3500,
    etd: '23-07-2025',
    eta: '25-07-2025',
    status: 'delivered',
    dateOfDelivery: '26-07-2025',
    isFrozen: false,
  },
];

// ... rest of the file remains the same
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
  { value: 'docu-received', label: 'Docu Received' },
  { value: 'in-transit', label: 'In Transit' },
  { value: 'custom-clearance', label: 'Custom Clearance' },
  { value: 'delivered', label: 'Delivered' },
];
