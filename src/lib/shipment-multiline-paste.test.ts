// src/lib/shipment-multiline-paste.test.ts
// Test file for shipment multi-line paste utility
import { describe, it, expect } from 'vitest';
import { parseShipmentMultiLinePaste } from './shipment-multiline-paste';

describe('parseShipmentMultiLinePaste', () => {
  it('should handle empty strings without throwing errors', () => {
    const testData = `,INV-001,2024-01-15,,10000.00,USD,FOB,Sea,FCL,,,,,,,,,`;

    expect(() => {
      const result = parseShipmentMultiLinePaste(testData, {
        suppliers: [{ id: 'supplier1', name: 'Test Supplier' }],
        categories: [{ id: 'cat1', name: 'Electronics' }],
        incoterms: [{ id: 'inc1', name: 'FOB' }],
        modes: [{ id: 'mode1', name: 'Sea' }],
        types: [{ id: 'type1', name: 'FCL' }],
        statuses: [{ id: 'status1', name: 'docs-rcvd' }],
        currencies: [{ id: 'curr1', name: 'USD' }],
      });

      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect(result[0].invoiceNumber).toBe('INV-001');
      expect(result[0].supplierId).toBeUndefined(); // Should be undefined for empty supplier
    }).not.toThrow();
  });

  it('should handle undefined options gracefully', () => {
    const testData = `Supplier,INV-002,2024-01-15,Electronics,10000.00,USD,FOB,Sea,FCL,,,,,,,,,`;

    expect(() => {
      const result = parseShipmentMultiLinePaste(testData, {});

      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect(result[0].invoiceNumber).toBe('INV-002');
    }).not.toThrow();
  });

  it('should parse valid data correctly', () => {
    const testData = `Test Supplier\tINV-2024-001\t2024-01-15\tElectronics\t10000.00\tUSD\tFOB\tSea\tFCL\tBL123\t2024-01-10\tVessel1\tCONT001\t5000.00\t2024-01-12\t2024-02-15\tdocs-rcvd\t2024-02-20`;

    const result = parseShipmentMultiLinePaste(testData, {
      suppliers: [{ id: 'supplier1', name: 'Test Supplier' }],
      categories: [{ id: 'cat1', name: 'Electronics' }],
      incoterms: [{ id: 'inc1', name: 'FOB' }],
      modes: [{ id: 'mode1', name: 'Sea' }],
      types: [{ id: 'type1', name: 'FCL' }],
      statuses: [{ id: 'status1', name: 'docs-rcvd' }],
      currencies: [{ id: 'curr1', name: 'USD' }],
    });

    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    expect(result[0].invoiceNumber).toBe('INV-2024-001');
    expect(result[0].supplierId).toBe('supplier1');
    expect(result[0].goodsCategory).toBe('cat1');
    expect(result[0].invoiceValue).toBe(10000);
    expect(result[0].invoiceCurrency).toBe('curr1');
    expect(result[0].incoterm).toBe('inc1');
    expect(result[0].shipmentMode).toBe('mode1');
    expect(result[0].shipmentType).toBe('type1');
    expect(result[0].blAwbNumber).toBe('BL123');
    expect(result[0].vesselName).toBe('Vessel1');
    expect(result[0].containerNumber).toBe('CONT001');
    expect(result[0].grossWeightKg).toBe(5000);
    expect(result[0].status).toBe('status1');
  });

  it('should parse alternative format with date in second column', () => {
    const testData = `CNF Co Ltd,01-07-2025,Non Wove,39703392,KRW,EXW,FCL,40 FTx2,MVMX209,08-07-2025,HMM OCE,CAIU77085,6576,08-07-2025,30-07-2025,docs-rcvd`;

    const result = parseShipmentMultiLinePaste(testData, {
      suppliers: [{ id: 'supplier1', name: 'CNF Co Ltd' }],
      categories: [{ id: 'cat1', name: 'Non Wove' }],
      incoterms: [{ id: 'inc1', name: 'EXW' }],
      types: [{ id: 'type1', name: 'FCL' }],
      statuses: [{ id: 'status1', name: 'docs-rcvd' }],
      currencies: [{ id: 'curr1', name: 'KRW' }],
    });

    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    expect(result[0].supplierId).toBe('supplier1');
    expect(result[0].invoiceDate).toBe('2025-07-01');
    expect(result[0].goodsCategory).toBe('cat1');
    expect(result[0].invoiceValue).toBe(39703392);
    expect(result[0].invoiceCurrency).toBe('curr1');
    expect(result[0].incoterm).toBe('inc1');
    expect(result[0].shipmentType).toBe('type1');
    expect(result[0].containerNumber).toBe('40 FTx2');
    expect(result[0].vesselName).toBe('HMM OCE');
    expect(result[0].blAwbDate).toBe('2025-07-08');
    expect(result[0].blAwbNumber).toBe('CAIU77085');
    expect(result[0].grossWeightKg).toBe(6576);
    expect(result[0].etd).toBe('2025-07-08');
    expect(result[0].eta).toBe('2025-07-30');
    expect(result[0].status).toBe('status1');
  });

  it('should parse space-delimited data correctly', () => {
    const testData = `CNF Co Lt CNF-2507- 01-07-2025 Non Wove 39703392 KRW EXW FCL 40 FTx2 MVMX209 08-07-2025 HMM OCE CAIU77085 6576 08-07-2025 30-07-2025 docs-rcvd`;

    const result = parseShipmentMultiLinePaste(testData, {
      suppliers: [{ id: 'supplier1', name: 'CNF Co Lt CNF-2507-' }],
      categories: [{ id: 'cat1', name: 'Non Wove' }],
      incoterms: [{ id: 'inc1', name: 'EXW' }],
      types: [{ id: 'type1', name: 'FCL' }],
      statuses: [{ id: 'status1', name: 'docs-rcvd' }],
      currencies: [{ id: 'curr1', name: 'KRW' }],
    });

    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    expect(result[0].supplierId).toBe('supplier1');
    expect(result[0].invoiceDate).toBe('2025-07-01');
    expect(result[0].goodsCategory).toBe('cat1');
    expect(result[0].invoiceValue).toBe(39703392);
    expect(result[0].invoiceCurrency).toBe('curr1');
    expect(result[0].incoterm).toBe('inc1');
    expect(result[0].shipmentType).toBe('type1');
    expect(result[0].containerNumber).toBe('40 FTx2');
    expect(result[0].vesselName).toBe('HMM OCE');
    expect(result[0].blAwbDate).toBe('2025-07-08');
    expect(result[0].blAwbNumber).toBe('CAIU77085');
    expect(result[0].grossWeightKg).toBe(6576);
    expect(result[0].etd).toBe('2025-07-08');
    expect(result[0].eta).toBe('2025-07-30');
    expect(result[0].status).toBe('status1');
  });

  it('should parse tab-delimited data correctly', () => {
    const testData = `CNF Co Ltd\tCNF-2507-01\t01-07-2025\tNon Woven\t39703392\tKRW\tEXW\tFCL\t40 FTx2\tMVMX209646\t08-07-2025\tHMM OCEAN\tCAIU7708523|TXGU8540620\t6576\t08-07-2025\t30-07-2025\tdocs-rcvd`;

    const result = parseShipmentMultiLinePaste(testData, {
      suppliers: [{ id: 'supplier1', name: 'CNF Co Ltd' }],
      categories: [{ id: 'cat1', name: 'Non Woven' }],
      incoterms: [{ id: 'inc1', name: 'EXW' }],
      modes: [{ id: 'type1', name: 'FCL' }],
      types: [{ id: 'type2', name: 'LCL' }],
      statuses: [{ id: 'status1', name: 'docs-rcvd' }],
      currencies: [{ id: 'curr1', name: 'KRW' }],
    });

    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    expect(result[0].supplierId).toBe('supplier1');
    expect(result[0].invoiceNumber).toBe('CNF-2507-01');
    expect(result[0].invoiceDate).toBe('2025-07-01');
    expect(result[0].goodsCategory).toBe('cat1');
    expect(result[0].invoiceValue).toBe(39703392);
    expect(result[0].invoiceCurrency).toBe('curr1');
    expect(result[0].incoterm).toBe('inc1');
    expect(result[0].shipmentMode).toBe('type1');
    expect(result[0].containerNumber).toBe('CAIU7708523|TXGU8540620');
    expect(result[0].vesselName).toBe('HMM OCEAN');
    expect(result[0].blAwbDate).toBe('2025-07-08');
    expect(result[0].blAwbNumber).toBe('MVMX209646');
    expect(result[0].grossWeightKg).toBe(6576);
    expect(result[0].etd).toBe('2025-07-08');
    expect(result[0].eta).toBe('2025-07-30');
    expect(result[0].status).toBe('status1');
  });

  it('should parse your specific invoice number format correctly', () => {
    const testData = `INZI CONTROLS CO LTD\tICKO-CHEN250610\t10-06-2025\tComponents\t225583.84\tUSD\tCIF\tFCL\t40 FT\tLOGIBIN2506001\t12-06-2025\tXIN TIAN JIN\tTEMU7217713\t30410\t12-06-2025\t03-07-2025\tdocs-rcvd`;

    const result = parseShipmentMultiLinePaste(testData, {
      suppliers: [{ id: 'supplier1', name: 'INZI CONTROLS CO LTD' }],
      categories: [{ id: 'cat1', name: 'Components' }],
      incoterms: [{ id: 'inc1', name: 'CIF' }],
      modes: [{ id: 'type1', name: 'FCL' }],
      types: [{ id: 'type2', name: 'LCL' }],
      statuses: [{ id: 'status1', name: 'docs-rcvd' }],
      currencies: [{ id: 'curr1', name: 'USD' }],
    });

    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    expect(result[0].supplierId).toBe('supplier1');
    expect(result[0].invoiceNumber).toBe('ICKO-CHEN250610');
    expect(result[0].invoiceDate).toBe('2025-06-10');
    expect(result[0].goodsCategory).toBe('cat1');
    expect(result[0].invoiceValue).toBe(225583.84);
    expect(result[0].invoiceCurrency).toBe('curr1');
    expect(result[0].incoterm).toBe('inc1');
    expect(result[0].shipmentMode).toBe('type1');
    expect(result[0].containerNumber).toBe('TEMU7217713');
    expect(result[0].vesselName).toBe('XIN TIAN JIN');
    expect(result[0].blAwbDate).toBe('2025-06-12');
    expect(result[0].blAwbNumber).toBe('LOGIBIN2506001');
    expect(result[0].grossWeightKg).toBe(30410);
    expect(result[0].etd).toBe('2025-06-12');
    expect(result[0].eta).toBe('2025-07-03');
    expect(result[0].status).toBe('status1');
  });

  it('should parse any invoice format using positional logic', () => {
    const testData = `DY ELACEN VINA CO LTD\tDEVP/INZI250425-02\t25-04-2025\tGasket\t47964.8\tUSD\tCIF\tLCL\tLCL\tTMMAA25057018\t15-05-2025\t\t\t783.74\t15-05-2025\t27-05-2025\tdocs-rcvd`;

    const result = parseShipmentMultiLinePaste(testData, {
      suppliers: [{ id: 'supplier1', name: 'DY ELACEN VINA CO LTD' }],
      categories: [{ id: 'cat1', name: 'Gasket' }],
      incoterms: [{ id: 'inc1', name: 'CIF' }],
      modes: [{ id: 'mode1', name: 'LCL' }],
      types: [{ id: 'type1', name: 'LCL' }],
      statuses: [{ id: 'status1', name: 'docs-rcvd' }],
      currencies: [{ id: 'curr1', name: 'USD' }],
    });

    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    expect(result[0].supplierId).toBe('supplier1');
    expect(result[0].invoiceNumber).toBe('DEVP/INZI250425-02');
    expect(result[0].invoiceDate).toBe('2025-04-25');
    expect(result[0].goodsCategory).toBe('cat1');
    expect(result[0].invoiceValue).toBe(47964.8);
    expect(result[0].invoiceCurrency).toBe('curr1');
    expect(result[0].incoterm).toBe('inc1');
    expect(result[0].status).toBe('status1');
  });

  it('should parse different invoice formats using positional logic', () => {
    const testData = `INZI CONTROLS CO LTD\tICKO-CHEN250610\t10-06-2025\tComponents\t225583.84\tUSD\tCIF\tFCL\t40 FT\tLOGIBIN2506001\t12-06-2025\tXIN TIAN JIN\tTEMU7217713\t30410\t12-06-2025\t03-07-2025\tdocs-rcvd`;

    const result = parseShipmentMultiLinePaste(testData, {
      suppliers: [{ id: 'supplier1', name: 'INZI CONTROLS CO LTD' }],
      categories: [{ id: 'cat1', name: 'Components' }],
      incoterms: [{ id: 'inc1', name: 'CIF' }],
      modes: [{ id: 'mode1', name: 'FCL' }],
      types: [{ id: 'type1', name: '40 FT' }],
      statuses: [{ id: 'status1', name: 'docs-rcvd' }],
      currencies: [{ id: 'curr1', name: 'USD' }],
    });

    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    expect(result[0].supplierId).toBe('supplier1');
    expect(result[0].invoiceNumber).toBe('ICKO-CHEN250610');
    expect(result[0].invoiceDate).toBe('2025-06-10');
    expect(result[0].goodsCategory).toBe('cat1');
    expect(result[0].invoiceValue).toBe(225583.84);
    expect(result[0].invoiceCurrency).toBe('curr1');
    expect(result[0].incoterm).toBe('inc1');
    expect(result[0].status).toBe('status1');
  });
});
