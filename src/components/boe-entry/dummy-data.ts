/*
================================================================================
| FILE: src/lib/dummy-data.ts (NEW)                                            |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| Provides the sample shipment data for the frontend prototype.                |
================================================================================
*/
import type { Shipment } from "@/types/boe-entry";

export const dummyShipments: Shipment[] = [
  {
    id: 'SHP-001',
    supplierName: 'KOREA WECOSTA CO LTD',
    invoiceNumber: 'KWC-250121-001',
    invoiceDate: '2025-01-21',
    invoiceValue: 34806.24, 
    invoiceCurrency: 'USD',
    incoterm: 'EXW',
    status: 'Delivered',
    items: [
      {
        partNo: '40450971',
        description: 'Acoustic Assy - AIR (PA-KAPPA)',
        lineTotal: 3657.36,
        actualBcdRate: 15,
        actualSwsRate: 10,
        actualIgstRate: 28,
      },
      {
        partNo: '53130471',
        description: 'Acoustic Assy(Ba K1.0)_인도',
        lineTotal: 3252.48,
        actualBcdRate: 15,
        actualSwsRate: 10,
        actualIgstRate: 28,
      },
       {
        partNo: '548143',
        description: 'Acoustic Assy - AIR (Ai3 K1.0/1.2)',
        lineTotal: 27896.40,
        actualBcdRate: 15,
        actualSwsRate: 10,
        actualIgstRate: 28,
      },
    ],
  },
  {
    id: 'SHP-002',
    supplierName: 'KOREA WECOSTA CO LTD',
    invoiceNumber: 'KWC-250225-001',
    invoiceDate: '2025-02-25',
    invoiceValue: 25747200,
    invoiceCurrency: 'KRW',
    incoterm: 'EXW',
    status: 'In Transit',
    items: [
      {
        partNo: '548143',
        description: 'Acoustic Assy - AIR (Ai3 K1.0/1.2)',
        lineTotal: 25747200,
        actualBcdRate: 15,
        actualSwsRate: 10,
        actualIgstRate: 28,
      },
    ],
  },
  {
    id: 'SHP-006',
    supplierName: 'Hoan Co Ltd',
    invoiceNumber: 'HA-250220-1',
    invoiceDate: '2025-02-20',
    invoiceValue: 12848000,
    invoiceCurrency: 'KRW',
    incoterm: 'EXW',
    status: 'In Transit',
    items: [
      {
        partNo: '548309-A',
        description: 'PF2 UPPER (QXI)',
        lineTotal: 6424000,
        actualBcdRate: 15,
        actualSwsRate: 10,
        actualIgstRate: 28,
      },
      {
        partNo: '548310-C',
        description: 'PF2 LOWER (QXI)',
        lineTotal: 6424000,
        actualBcdRate: 15,
        actualSwsRate: 10,
        actualIgstRate: 28,
      },
    ],
  },
];