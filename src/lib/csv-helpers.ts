// src/lib/csv-helpers.ts (MODIFIED)
// Added a specific type for parsed CSV data to avoid using `any`.

import Papa from 'papaparse';
import type { Item } from '@/types/item';
import type { Option } from '@/types/options';

// Define a type for the raw CSV data row. All values are strings.
type CsvRow = {
    [key: string]: string | undefined;
};

export const exportItemsToCsv = (itemsToExport: Item[], suppliers: Option[]): string => {
  const exportableData = itemsToExport.map(item => {
    const supplier = suppliers.find(s => s.value === item.supplierId);
    // Create a new object for the CSV row to ensure all fields are present and in order
    return {
        id: item.id || '',
        partNumber: item.partNumber || '',
        itemDescription: item.itemDescription || '',
        unit: item.unit || '',
        currency: item.currency || '',
        unitPrice: item.unitPrice || 0,
        hsnCode: item.hsnCode || '',
        supplierName: supplier ? supplier.label : 'N/A', // Map ID to Name
        isActive: item.isActive,
        countryOfOrigin: item.countryOfOrigin || '',
        bcd: item.bcd || '',
        sws: item.sws || '',
        igst: item.igst || '',
        technicalWriteUp: item.technicalWriteUp || '',
        category: item.category || '',
        endUse: item.endUse || '',
        netWeightKg: item.netWeightKg || 0,
        purchaseUom: item.purchaseUom || '',
        grossWeightPerUomKg: item.grossWeightPerUomKg || 0,
        photoPath: item.photoPath || '',
    };
  });

  return Papa.unparse(exportableData);
};

export const importItemsFromCsv = (
  csvContent: string,
  existingItems: Item[],
  suppliers: Option[]
): { newItems: Item[], skippedCount: number } => {
  const results = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  const existingPartNumbers = new Set(existingItems.map(item => item.partNumber));
  let skippedCount = 0;

  const maxId = existingItems.reduce((max, item) => {
    const num = parseInt(item.id.split('-')[1]);
    return num > max ? num : max;
  }, 0);
  let nextId = maxId + 1;

  const newItems: Item[] = [];
  // Use the specific CsvRow type here instead of `any[]`
  const parsedData = results.data as CsvRow[];

  for (const row of parsedData) {
    if (!row.partNumber || existingPartNumbers.has(row.partNumber)) {
      skippedCount++;
      continue;
    }

    // Convert supplier name from CSV back to supplierId
    const supplier = suppliers.find(s => s.label === row.supplierName || s.value === row.supplierId);

    // Create a complete Item object, INCLUDING the ID
    const newItem: Item = {
      id: `ITM-${(nextId++).toString().padStart(3, '0')}`, // Generate the new ID
      partNumber: row.partNumber,
      itemDescription: row.itemDescription || '',
      unit: row.unit || '',
      currency: row.currency || '',
      unitPrice: parseFloat(row.unitPrice || '0'),
      hsnCode: row.hsnCode || '',
      supplierId: supplier ? supplier.value : undefined,
      isActive: row.isActive ? row.isActive.toString().toLowerCase() === 'true' : true,
      countryOfOrigin: row.countryOfOrigin || '',
      bcd: row.bcd || '',
      sws: row.sws || '',
      igst: row.igst || '',
      technicalWriteUp: row.technicalWriteUp || '',
      category: row.category || '',
      endUse: row.endUse || '',
      netWeightKg: parseFloat(row.netWeightKg || '0'),
      purchaseUom: row.purchaseUom || '',
      grossWeightPerUomKg: parseFloat(row.grossWeightPerUomKg || '0'),
      photoPath: row.photoPath || '',
    };
    newItems.push(newItem);
  }
  
  return { newItems, skippedCount };
};
