import type { ExpenseType, ServiceProvider } from '@/types/expense'

// Mock Expense Types
export const mockExpenseTypes: ExpenseType[] = [
  {
    id: 'ET-001',
    name: 'Customs Clearance',
    defaultCgstRate: 9,
    defaultSgstRate: 9,
    defaultIgstRate: 18,
    isActive: true,
  },
  {
    id: 'ET-002',
    name: 'Freight Charges',
    defaultCgstRate: 9,
    defaultSgstRate: 9,
    defaultIgstRate: 18,
    isActive: true,
  },
  {
    id: 'ET-003',
    name: 'Port Handling',
    defaultCgstRate: 9,
    defaultSgstRate: 9,
    defaultIgstRate: 18,
    isActive: true,
  },
  {
    id: 'ET-004',
    name: 'Transportation',
    defaultCgstRate: 9,
    defaultSgstRate: 9,
    defaultIgstRate: 18,
    isActive: true,
  },
  {
    id: 'ET-005',
    name: 'Documentation',
    defaultCgstRate: 9,
    defaultSgstRate: 9,
    defaultIgstRate: 18,
    isActive: true,
  },
  {
    id: 'ET-006',
    name: 'Insurance',
    defaultCgstRate: 9,
    defaultSgstRate: 9,
    defaultIgstRate: 18,
    isActive: true,
  },
  {
    id: 'ET-007',
    name: 'Storage Charges',
    defaultCgstRate: 9,
    defaultSgstRate: 9,
    defaultIgstRate: 18,
    isActive: true,
  },
  {
    id: 'ET-008',
    name: 'Inspection Fees',
    defaultCgstRate: 9,
    defaultSgstRate: 9,
    defaultIgstRate: 18,
    isActive: true,
  },
]

// Mock Service Providers
export const mockServiceProviders: ServiceProvider[] = [
  {
    id: 'SP-001',
    name: 'ABC Logistics Ltd',
    gstin: '27AABCA1234A1Z5',
    state: 'Maharashtra',
    contactPerson: 'John Smith',
    contactEmail: 'john@abclogistics.com',
    contactPhone: '+91-9876543210',
  },
  {
    id: 'SP-002',
    name: 'XYZ Customs Brokers',
    gstin: '27AAXYZ5678B2Z6',
    state: 'Maharashtra',
    contactPerson: 'Sarah Johnson',
    contactEmail: 'sarah@xyzcustoms.com',
    contactPhone: '+91-9876543211',
  },
  {
    id: 'SP-003',
    name: 'Global Freight Solutions',
    gstin: '27AAGFS9012C3Z7',
    state: 'Karnataka',
    contactPerson: 'Mike Wilson',
    contactEmail: 'mike@globalfreight.com',
    contactPhone: '+91-9876543212',
  },
  {
    id: 'SP-004',
    name: 'Express Cargo Services',
    gstin: '27AAECS3456D4Z8',
    state: 'Tamil Nadu',
    contactPerson: 'Lisa Brown',
    contactEmail: 'lisa@expresscargo.com',
    contactPhone: '+91-9876543213',
  },
  {
    id: 'SP-005',
    name: 'Premium Transport Co.',
    gstin: '27AAPTC7890E5Z9',
    state: 'Gujarat',
    contactPerson: 'David Lee',
    contactEmail: 'david@premiumtransport.com',
    contactPhone: '+91-9876543214',
  },
  {
    id: 'SP-006',
    name: 'Ocean Shipping Lines',
    gstin: '27AAOSL2345F6Z0',
    state: 'Maharashtra',
    contactPerson: 'Emma Davis',
    contactEmail: 'emma@oceanshipping.com',
    contactPhone: '+91-9876543215',
  },
  {
    id: 'SP-007',
    name: 'Air Cargo Express',
    gstin: '27AAACE6789G7Z1',
    state: 'Delhi',
    contactPerson: 'Robert Taylor',
    contactEmail: 'robert@aircargo.com',
    contactPhone: '+91-9876543216',
  },
  {
    id: 'SP-008',
    name: 'Port Terminal Services',
    gstin: '27AAPTS0123H8Z2',
    state: 'Maharashtra',
    contactPerson: 'Jennifer White',
    contactEmail: 'jennifer@portterminal.com',
    contactPhone: '+91-9876543217',
  },
]

// Mock Shipments for testing
export const mockShipments = [
  {
    id: 'SHP-001',
    supplierId: 'SUP-001',
    invoiceNumber: 'INV-2024-001',
    invoiceDate: '2024-01-15',
    goodsCategory: 'Electronics',
    invoiceValue: 50000,
    invoiceCurrency: 'USD',
    incoterm: 'CIF',
    shipmentMode: 'Sea',
    shipmentType: 'FCL',
    blAwbNumber: 'BL-2024-001',
    blAwbDate: '2024-01-20',
    vesselName: 'MSC Fantasia',
    containerNumber: 'MSCU1234567',
    grossWeightKg: 2500,
    etd: '2024-01-25',
    eta: '2024-02-10',
    status: 'In Transit',
    isFrozen: false,
  },
  {
    id: 'SHP-002',
    supplierId: 'SUP-002',
    invoiceNumber: 'INV-2024-002',
    invoiceDate: '2024-01-20',
    goodsCategory: 'Machinery',
    invoiceValue: 75000,
    invoiceCurrency: 'EUR',
    incoterm: 'FOB',
    shipmentMode: 'Air',
    shipmentType: 'General Cargo',
    blAwbNumber: 'AWB-2024-001',
    blAwbDate: '2024-01-22',
    vesselName: 'Air Cargo Flight',
    grossWeightKg: 1500,
    etd: '2024-01-28',
    eta: '2024-02-02',
    status: 'Delivered',
    isFrozen: false,
  },
  {
    id: 'SHP-003',
    supplierId: 'SUP-003',
    invoiceNumber: 'INV-2024-003',
    invoiceDate: '2024-02-01',
    goodsCategory: 'Textiles',
    invoiceValue: 30000,
    invoiceCurrency: 'USD',
    incoterm: 'CIF',
    shipmentMode: 'Sea',
    shipmentType: 'LCL',
    blAwbNumber: 'BL-2024-002',
    blAwbDate: '2024-02-05',
    vesselName: 'CMA CGM Marco Polo',
    grossWeightKg: 1800,
    etd: '2024-02-10',
    eta: '2024-02-25',
    status: 'In Transit',
    isFrozen: false,
  },
]

// Function to get expense types
export const getExpenseTypes = (): Promise<ExpenseType[]> => {
  return Promise.resolve(mockExpenseTypes)
}

// Function to get service providers
export const getServiceProviders = (): Promise<ServiceProvider[]> => {
  return Promise.resolve(mockServiceProviders)
}

// Function to get shipments
export const getShipments = () => {
  return Promise.resolve(mockShipments)
}
