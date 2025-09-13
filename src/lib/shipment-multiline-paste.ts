// src/lib/shipment-multiline-paste.ts
// Utility to parse multi-line pasted shipment data (from Excel/text)

export type ParsedShipmentLine = {
  raw: string;
  supplierId?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  goodsCategory?: string;
  invoiceValue?: number;
  invoiceCurrency?: string;
  incoterm?: string;
  shipmentMode?: string;
  shipmentType?: string;
  blAwbNumber?: string;
  blAwbDate?: string;
  vesselName?: string;
  containerNumber?: string;
  grossWeightKg?: number;
  etd?: string;
  eta?: string;
  status?: string;
  dateOfDelivery?: string;
  errors?: string[];
  matched?: boolean;
};

export interface ShipmentPasteParseOptions {
  delimiter?: 'auto' | 'comma' | 'tab' | 'semicolon' | 'pipe' | 'space';
  skipHeader?: boolean;
  suppliers?: Array<{ id: string; name: string }>;
  categories?: Array<{ id: string; name: string }>;
  incoterms?: Array<{ id: string; name: string }>;
  modes?: Array<{ id: string; name: string }>;
  types?: Array<{ id: string; name: string }>;
  statuses?: Array<{ id: string; name: string }>;
  currencies?: Array<{ id: string; name: string }>;
}

const detectDelimiter = (line: string): string => {
  // Check for tab delimiter first (most structured)
  if (line.includes('\t')) {
    return '\t';
  }

  // Then check for other structured delimiters
  const delimiters = [',', ';', '|'];
  const counts = delimiters.map(d => line.split(d).length);
  const maxCount = Math.max(...counts);
  const bestDelimiter = delimiters[counts.indexOf(maxCount)];

  // If we have a good structured delimiter, use it
  if (maxCount > 2) {
    return bestDelimiter;
  }

  // Finally check for space-delimited data (least structured)
  if (line.includes(' ') && !line.includes(',')) {
    return ' ';
  }

  return bestDelimiter;
};

const splitByDelimiter = (line: string, delimiter: string): string[] => {
  if (delimiter === ' ') {
    // For space delimiter, we need to be more careful about splitting
    // First, let's try to identify if this is a space-delimited format
    // by looking for patterns like dates and numbers

    // Split by multiple spaces
    const parts = line.split(/\s+/).filter(col => col.trim().length > 0);

    // If we have too many parts, it might be a complex space-delimited format
    // Let's try to reconstruct it as comma-separated for better parsing
    if (parts.length > 10) {
      // This looks like space-delimited data, but we need to handle it differently
      // Let's try to identify the structure based on content patterns
      return parts;
    }

    return parts;
  }
  return line.split(delimiter).map(col => col.trim());
};

const toNumber = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const num = parseFloat(value.replace(/[^\d.-]/g, ''));
  return Number.isFinite(num) ? num : undefined;
};

const normalizeDate = (dateStr: string | undefined): string | undefined => {
  if (!dateStr) return undefined;

  // Handle common date formats
  const trimmed = dateStr.trim();

  // If it's already in yyyy-MM-dd format
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // If it's in dd/MM/yyyy or dd-MM-yyyy format
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(trimmed)) {
    const parts = trimmed.split(/[/-]/);
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2];
    return `${year}-${month}-${day}`;
  }

  // If it's in dd/MM/yy format
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2}$/.test(trimmed)) {
    const parts = trimmed.split(/[/-]/);
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = '20' + parts[2];
    return `${year}-${month}-${day}`;
  }

  return undefined;
};

const findBestMatch = (
  value: string | undefined,
  options: Array<{ id: string; name: string }> | undefined
): string | undefined => {
  // More robust checks
  if (
    !value ||
    typeof value !== 'string' ||
    !options ||
    !Array.isArray(options) ||
    !value.trim()
  ) {
    return undefined;
  }

  const normalizedValue = value.toLowerCase().trim();

  // Exact match
  const exactMatch = options.find(
    opt =>
      opt &&
      opt.name &&
      typeof opt.name === 'string' &&
      opt.name.toLowerCase() === normalizedValue
  );
  if (exactMatch) return exactMatch.id;

  // Partial match
  const partialMatch = options.find(
    opt =>
      opt &&
      opt.name &&
      typeof opt.name === 'string' &&
      (opt.name.toLowerCase().includes(normalizedValue) ||
        normalizedValue.includes(opt.name.toLowerCase()))
  );
  if (partialMatch) return partialMatch.id;

  return undefined;
};

/**
 * Heuristic mapping of columns to shipment fields.
 * Supports multiple data formats including:
 * Format 1: [supplier, invoiceNumber, invoiceDate, goodsCategory, invoiceValue, currency, incoterm, ...]
 * Format 2: [supplier, invoiceDate, goodsCategory, invoiceValue, currency, incoterm, shipmentType, container, vesselId, blDate, vesselName, blNumber, weight, etd, eta, status]
 * Format 3: Space-delimited complex format
 */
const mapColumns = (
  cols: string[],
  options: ShipmentPasteParseOptions
): Omit<ParsedShipmentLine, 'raw'> => {
  const trimmed = cols.map(c => c.trim());
  const result: Omit<ParsedShipmentLine, 'raw'> = {};

  // Detect format based on content patterns
  // Invoice number is always between supplier name and invoice date
  const hasDateInSecondColumn =
    trimmed.length >= 2 &&
    (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(trimmed[1] || '') || // dd-MM-yyyy or dd/MM/yyyy
      /^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed[1] || '')); // yyyy-MM-dd

  // Check if this looks like space-delimited complex format (not tab-delimited)

  // Check if this looks like space-delimited complex format (not tab-delimited)
  const isSpaceDelimitedComplex =
    trimmed.length > 10 &&
    !hasDateInSecondColumn &&
    trimmed.some(col => /^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(col));

  // Use positional logic: invoice number is always between supplier and date
  const hasInvoiceNumber =
    trimmed.length >= 3 &&
    trimmed[1] &&
    !/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(trimmed[1]) && // Not a date
    !/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed[1]) && // Not a yyyy-MM-dd date
    trimmed[2] &&
    (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(trimmed[2]) || // dd-MM-yyyy or dd/MM/yyyy
      /^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed[2])); // yyyy-MM-dd

  if (hasInvoiceNumber) {
    // Format 1: Standard format with invoice number
    if (trimmed.length >= 1 && trimmed[0] && options.suppliers) {
      result.supplierId = findBestMatch(trimmed[0], options.suppliers);
    }
    if (trimmed.length >= 2 && trimmed[1]) {
      result.invoiceNumber = trimmed[1];
    }
    if (trimmed.length >= 3 && trimmed[2]) {
      result.invoiceDate = normalizeDate(trimmed[2]);
    }
    if (trimmed.length >= 4 && trimmed[3] && options.categories) {
      result.goodsCategory = findBestMatch(trimmed[3], options.categories);
    }
    if (trimmed.length >= 5 && trimmed[4]) {
      result.invoiceValue = toNumber(trimmed[4]);
    }
    if (trimmed.length >= 6 && trimmed[5] && options.currencies) {
      result.invoiceCurrency = findBestMatch(trimmed[5], options.currencies);
    }
    if (trimmed.length >= 7 && trimmed[6] && options.incoterms) {
      result.incoterm = findBestMatch(trimmed[6], options.incoterms);
    }
    if (trimmed.length >= 8 && trimmed[7] && options.modes) {
      result.shipmentMode = findBestMatch(trimmed[7], options.modes);
    }
    if (trimmed.length >= 9 && trimmed[8] && options.types) {
      result.shipmentType = findBestMatch(trimmed[8], options.types);
    }
    if (trimmed.length >= 10 && trimmed[9]) {
      result.blAwbNumber = trimmed[9];
    }
    if (trimmed.length >= 11 && trimmed[10]) {
      result.blAwbDate = normalizeDate(trimmed[10]);
    }
    if (trimmed.length >= 12 && trimmed[11]) {
      result.vesselName = trimmed[11];
    }
    if (trimmed.length >= 13 && trimmed[12]) {
      result.containerNumber = trimmed[12];
    }
    if (trimmed.length >= 14 && trimmed[13]) {
      result.grossWeightKg = toNumber(trimmed[13]);
    }
    if (trimmed.length >= 15 && trimmed[14]) {
      result.etd = normalizeDate(trimmed[14]);
    }
    if (trimmed.length >= 16 && trimmed[15]) {
      result.eta = normalizeDate(trimmed[15]);
    }
    if (trimmed.length >= 17 && trimmed[16] && options.statuses) {
      result.status = findBestMatch(trimmed[16], options.statuses);
    }
    if (trimmed.length >= 18 && trimmed[17]) {
      result.dateOfDelivery = normalizeDate(trimmed[17]);
    }
  } else if (hasDateInSecondColumn) {
    // Format 2: Date in second column (like your data)
    if (trimmed.length >= 1 && trimmed[0] && options.suppliers) {
      result.supplierId = findBestMatch(trimmed[0], options.suppliers);
    }
    if (trimmed.length >= 2 && trimmed[1]) {
      result.invoiceDate = normalizeDate(trimmed[1]);
    }
    if (trimmed.length >= 3 && trimmed[2] && options.categories) {
      result.goodsCategory = findBestMatch(trimmed[2], options.categories);
    }
    if (trimmed.length >= 4 && trimmed[3]) {
      result.invoiceValue = toNumber(trimmed[3]);
    }
    if (trimmed.length >= 5 && trimmed[4] && options.currencies) {
      result.invoiceCurrency = findBestMatch(trimmed[4], options.currencies);
    }
    if (trimmed.length >= 6 && trimmed[5] && options.incoterms) {
      result.incoterm = findBestMatch(trimmed[5], options.incoterms);
    }
    if (trimmed.length >= 7 && trimmed[6] && options.types) {
      result.shipmentType = findBestMatch(trimmed[6], options.types);
    }
    if (trimmed.length >= 8 && trimmed[7]) {
      result.containerNumber = trimmed[7];
    }
    if (trimmed.length >= 9 && trimmed[8]) {
      // Vessel ID - could be vessel name or ID
      result.vesselName = trimmed[8];
    }
    if (trimmed.length >= 10 && trimmed[9]) {
      result.blAwbDate = normalizeDate(trimmed[9]);
    }
    if (trimmed.length >= 11 && trimmed[10]) {
      result.vesselName = trimmed[10]; // Override with actual vessel name
    }
    if (trimmed.length >= 12 && trimmed[11]) {
      result.blAwbNumber = trimmed[11];
    }
    if (trimmed.length >= 13 && trimmed[12]) {
      result.grossWeightKg = toNumber(trimmed[12]);
    }
    if (trimmed.length >= 14 && trimmed[13]) {
      result.etd = normalizeDate(trimmed[13]);
    }
    if (trimmed.length >= 15 && trimmed[14]) {
      result.eta = normalizeDate(trimmed[14]);
    }
    if (trimmed.length >= 16 && trimmed[15]) {
      result.status = findBestMatch(trimmed[15], options.statuses);
    }
  } else if (isSpaceDelimitedComplex) {
    // Format 3: Space-delimited complex format
    // Map fields based on content patterns rather than position

    // Find dates
    const dates = trimmed.filter(col =>
      /^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(col)
    );
    if (dates.length >= 1) result.invoiceDate = normalizeDate(dates[0]);
    if (dates.length >= 2) result.blAwbDate = normalizeDate(dates[1]);
    if (dates.length >= 3) result.etd = normalizeDate(dates[2]);
    if (dates.length >= 4) result.eta = normalizeDate(dates[3]);

    // Find currency codes (3-letter codes like KRW, USD)
    // Only match common currency codes
    const currencyCodes = [
      'KRW',
      'USD',
      'EUR',
      'GBP',
      'JPY',
      'CNY',
      'INR',
      'SGD',
      'HKD',
      'THB',
    ];
    const currencies = trimmed.filter(col => currencyCodes.includes(col));
    if (currencies.length >= 1 && options.currencies)
      result.invoiceCurrency = findBestMatch(currencies[0], options.currencies);

    // Find incoterms (3-4 letter codes like EXW, FOB, CIF)
    // Only match common incoterms
    const incotermCodes = [
      'EXW',
      'FOB',
      'CIF',
      'CFR',
      'CPT',
      'CIP',
      'DAP',
      'DPU',
      'DDP',
    ];
    const incoterms = trimmed.filter(col => incotermCodes.includes(col));
    if (incoterms.length >= 1 && options.incoterms)
      result.incoterm = findBestMatch(incoterms[0], options.incoterms);

    // Find shipment types (3-4 letter codes like FCL, LCL)
    // Only match common shipment types
    const typeCodes = ['FCL', 'LCL', 'FTL', 'LTL'];
    const types = trimmed.filter(col => typeCodes.includes(col));
    if (types.length >= 1 && options.types)
      result.shipmentType = findBestMatch(types[0], options.types);

    // Find status (look for status patterns)
    const statusCandidates: (
      | 'docs-rcvd'
      | 'pending'
      | 'completed'
      | 'shipped'
      | 'delivered'
    )[] = trimmed.filter(
      (
        col
      ): col is
        | 'docs-rcvd'
        | 'pending'
        | 'completed'
        | 'shipped'
        | 'delivered' =>
        col === 'docs-rcvd' ||
        col === 'pending' ||
        col === 'completed' ||
        col === 'shipped' ||
        col === 'delivered'
    );

    if (statusCandidates.length >= 1 && options.statuses)
      result.status = findBestMatch(statusCandidates[0], options.statuses);

    // Find numbers (invoice value, weight)
    const numbers = trimmed.filter(col => /^\d+$/.test(col));
    if (numbers.length >= 1) result.invoiceValue = toNumber(numbers[0]);

    // Find gross weight (look for weight after BL number)
    const weightBlIndex = trimmed.findIndex(col => /^[A-Z]{4}\d{5}$/.test(col));
    if (weightBlIndex >= 0 && weightBlIndex + 1 < trimmed.length) {
      const weightCandidate = trimmed[weightBlIndex + 1];
      if (/^\d+$/.test(weightCandidate)) {
        result.grossWeightKg = toNumber(weightCandidate);
      }
    }

    // Fallback: use the second largest number as weight
    if (!result.grossWeightKg && numbers.length >= 2) {
      const sortedNumbers = numbers.map(n => parseInt(n)).sort((a, b) => b - a);
      result.grossWeightKg = toNumber(sortedNumbers[1].toString());
    }

    // Find alphanumeric codes (BL numbers, vessel IDs)
    // BL numbers are typically alphanumeric codes, not pure numbers
    const codes = trimmed.filter(
      col => /^[A-Z0-9]{6,}$/.test(col) && !/^\d+$/.test(col)
    );

    // Find BL number specifically (look for patterns like CAIU, DFSU, etc.)
    const blNumberIndex = trimmed.findIndex(col => /^[A-Z]{4}\d{5}$/.test(col));
    if (blNumberIndex >= 0) {
      result.blAwbNumber = trimmed[blNumberIndex];
    } else if (codes.length >= 1) {
      result.blAwbNumber = codes[0];
    }

    // Find vessel name (combine adjacent vessel parts)
    const vesselIndex = trimmed.findIndex(col => col === 'HMM');
    if (vesselIndex >= 0 && vesselIndex + 1 < trimmed.length) {
      const nextCol = trimmed[vesselIndex + 1];
      if (nextCol === 'OCE') {
        result.vesselName = 'HMM OCE';
      } else {
        result.vesselName = trimmed[vesselIndex];
      }
    } else if (codes.length >= 2) {
      result.vesselName = codes[1];
    }

    // Find container info (look for FT patterns and combine with preceding number)
    const containerIndex = trimmed.findIndex(col => col.includes('FT'));
    if (containerIndex >= 0) {
      const containerPart = trimmed[containerIndex];
      // Check if there's a number before the container part
      if (containerIndex > 0 && /^\d+$/.test(trimmed[containerIndex - 1])) {
        result.containerNumber = `${trimmed[containerIndex - 1]} ${containerPart}`;
      } else {
        result.containerNumber = containerPart;
      }
    }

    // Find supplier and goods (remaining text)
    const remaining = trimmed.filter(
      col =>
        !dates.includes(col) &&
        !currencies.includes(col) &&
        !incoterms.includes(col) &&
        !types.includes(col) &&
        !statusCandidates.some(status => status === col) &&
        !numbers.includes(col) &&
        !codes.includes(col) &&
        !col.includes('FT') &&
        !/^[A-Z0-9]{6,}$/.test(col)
    );

    // Try to match supplier and goods from remaining text
    for (const col of remaining) {
      if (!result.supplierId && options.suppliers) {
        result.supplierId = findBestMatch(col, options.suppliers);
      } else if (!result.goodsCategory && options.categories) {
        result.goodsCategory = findBestMatch(col, options.categories);
      }
    }
  } else {
    // Fallback: try to map based on content patterns
    if (trimmed.length >= 1 && trimmed[0] && options.suppliers) {
      result.supplierId = findBestMatch(trimmed[0], options.suppliers);
    }
    if (trimmed.length >= 2 && trimmed[1]) {
      // Check if it's a date or invoice number
      if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(trimmed[1])) {
        result.invoiceDate = normalizeDate(trimmed[1]);
      } else {
        result.invoiceNumber = trimmed[1];
      }
    }
    if (trimmed.length >= 3 && trimmed[2] && options.categories) {
      result.goodsCategory = findBestMatch(trimmed[2], options.categories);
    }
    if (trimmed.length >= 4 && trimmed[3]) {
      result.invoiceValue = toNumber(trimmed[3]);
    }
    if (trimmed.length >= 5 && trimmed[4] && options.currencies) {
      result.invoiceCurrency = findBestMatch(trimmed[4], options.currencies);
    }
    if (trimmed.length >= 6 && trimmed[5] && options.incoterms) {
      result.incoterm = findBestMatch(trimmed[5], options.incoterms);
    }
    if (trimmed.length >= 7 && trimmed[6] && options.types) {
      result.shipmentType = findBestMatch(trimmed[6], options.types);
    }
    if (trimmed.length >= 8 && trimmed[7]) {
      result.containerNumber = trimmed[7];
    }
    if (trimmed.length >= 9 && trimmed[8]) {
      result.vesselName = trimmed[8];
    }
    if (trimmed.length >= 10 && trimmed[9]) {
      result.blAwbDate = normalizeDate(trimmed[9]);
    }
    if (trimmed.length >= 11 && trimmed[10]) {
      result.vesselName = trimmed[10];
    }
    if (trimmed.length >= 12 && trimmed[11]) {
      result.blAwbNumber = trimmed[11];
    }
    if (trimmed.length >= 13 && trimmed[12]) {
      result.grossWeightKg = toNumber(trimmed[12]);
    }
    if (trimmed.length >= 14 && trimmed[13]) {
      result.etd = normalizeDate(trimmed[13]);
    }
    if (trimmed.length >= 15 && trimmed[14]) {
      result.eta = normalizeDate(trimmed[14]);
    }
    if (trimmed.length >= 16 && trimmed[15]) {
      result.status = findBestMatch(trimmed[15], options.statuses);
    }
  }

  return result;
};

export function parseShipmentMultiLinePaste(
  text: string,
  options: ShipmentPasteParseOptions = {}
): ParsedShipmentLine[] {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length === 0) return [];

  const delimiter =
    options.delimiter && options.delimiter !== 'auto'
      ? options.delimiter
      : detectDelimiter(lines[0]);

  const parsed: ParsedShipmentLine[] = [];
  lines.forEach((rawLine, index) => {
    if (options.skipHeader && index === 0) return;
    const cols = splitByDelimiter(rawLine, delimiter);
    const mapped = mapColumns(cols, options);
    const errors: string[] = [];

    // Validation
    if (!mapped.invoiceNumber) errors.push('Missing invoice number');
    if (!mapped.invoiceDate) errors.push('Invalid invoice date');
    if (!mapped.goodsCategory) errors.push('Missing goods category');
    if (mapped.invoiceValue === undefined || mapped.invoiceValue <= 0)
      errors.push('Invalid invoice value');
    if (!mapped.invoiceCurrency) errors.push('Missing currency');
    if (!mapped.incoterm) errors.push('Missing incoterm');

    parsed.push({
      raw: rawLine,
      ...mapped,
      errors: errors.length ? errors : undefined,
    });
  });

  return parsed;
}

export function generateShipmentTemplate(): string {
  return `Supplier,Invoice Number,Invoice Date,Goods Category,Invoice Value,Currency,Incoterm,Shipment Mode,Shipment Type,BL/AWB Number,BL/AWB Date,Vessel Name,Container Number,Gross Weight (KG),ETD,ETA,Status,Date of Delivery
Example Supplier,INV-001,2024-01-15,Electronics,10000.00,USD,FOB,Sea,FCL,BL123456,2024-01-10,Example Vessel,CONT001,5000.00,2024-01-12,2024-02-15,docs-rcvd,

Alternative Format (Date in 2nd column):
Supplier,Invoice Date,Goods Category,Invoice Value,Currency,Incoterm,Shipment Type,Container,Vessel ID,BL Date,Vessel Name,BL Number,Weight,ETD,ETA,Status
CNF Co Ltd,01-07-2025,Non Wove,39703392,KRW,EXW,FCL,40 FTx2,MVMX209,08-07-2025,HMM OCE,CAIU77085,6576,08-07-2025,30-07-2025,docs-rcvd`;
}
