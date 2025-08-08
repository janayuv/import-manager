// src/lib/csv-helpers.ts (FIXED)
// Corrected parsing logic and type handling for CSV import.

import Papa from 'papaparse';
import type { Item } from '@/types/item';
import type { Option } from '@/types/options';

// A type for the raw CSV data row where all values are initially strings.
type CsvRow = {
    [key: string]: string;
};

/**
 * Exports an array of Item objects to a CSV formatted string.
 * @param itemsToExport The items to be included in the CSV.
 * @param suppliers An array of supplier options to map supplierId to supplierName.
 * @returns A string containing the data in CSV format.
 */
export const exportItemsToCsv = (itemsToExport: Item[], suppliers: Option[]): string => {
    const exportableData = itemsToExport.map(item => {
        const supplier = suppliers.find(s => s.value === item.supplierId);
        // Ensure all fields are present and correctly formatted for the CSV output.
        return {
            id: item.id || '',
            partNumber: item.partNumber || '',
            itemDescription: item.itemDescription || '',
            unit: item.unit || '',
            currency: item.currency || '',
            unitPrice: item.unitPrice || 0,
            hsnCode: item.hsnCode || '',
            supplierName: supplier ? supplier.label : (item.supplierId || ''), // Export name, fallback to ID
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

/**
 * Imports items from a CSV string, skipping duplicates.
 * @param csvContent The string content of the CSV file.
 * @param existingItems An array of current items to check for duplicates.
 * @param suppliers An array of supplier options to map supplierName back to supplierId.
 * @returns An object containing the new items and a count of skipped items.
 */
export const importItemsFromCsv = (
    csvContent: string,
    existingItems: Item[],
    suppliers: Option[]
): { newItems: Item[], skippedCount: number } => {
    // Parse the CSV content without dynamic typing to handle all conversions manually.
    const results = Papa.parse<CsvRow>(csvContent, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false, // Set to false for full control over type conversion.
    });

    if (results.errors.length) {
        console.error("CSV Parsing Errors:", results.errors);
        // Handle parsing errors, perhaps by notifying the user.
        return { newItems: [], skippedCount: 0 };
    }

    const existingPartNumbers = new Set(existingItems.map(item => item.partNumber));
    let skippedCount = 0;

    // Determine the next available ID to avoid collisions.
    const maxId = existingItems.reduce((max, item) => {
        const num = parseInt(item.id.replace('ITM-', ''), 10);
        return !isNaN(num) && num > max ? num : max;
    }, 0);
    let nextId = maxId + 1;

    const newItems: Item[] = [];

    for (const row of results.data) {
        // Skip if part number is missing or already exists.
        if (!row.partNumber || existingPartNumbers.has(row.partNumber)) {
            skippedCount++;
            continue;
        }

        // Find the supplierId by matching the name from the CSV.
        const supplier = suppliers.find(s => s.label.toLowerCase() === row.supplierName?.toLowerCase());

        // Manually construct the new Item object with correct data types.
        const newItem: Item = {
            id: `ITM-${(nextId++).toString().padStart(3, '0')}`,
            partNumber: row.partNumber || '',
            itemDescription: row.itemDescription || '',
            unit: row.unit || '',
            currency: row.currency || '',
            unitPrice: parseFloat(row.unitPrice || '0'),
            hsnCode: row.hsnCode || '',
            supplierId: supplier ? supplier.value : undefined,
            isActive: row.isActive ? row.isActive.toLowerCase() === 'true' : true,
            countryOfOrigin: row.countryOfOrigin || '',
            // FIX: Parse tax fields as numbers (float). Return undefined if empty.
            bcd: row.bcd ? parseFloat(row.bcd) : undefined,
            sws: row.sws ? parseFloat(row.sws) : undefined,
            igst: row.igst ? parseFloat(row.igst) : undefined,
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
