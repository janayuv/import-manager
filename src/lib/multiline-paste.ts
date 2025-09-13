// src/lib/multiline-paste.ts
// Utility to parse multi-line pasted invoice lines (from Excel/text)

export type ParsedPasteLine = {
  raw: string;
  partNumber?: string;
  description?: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number;
  currency?: string;
  hsnCode?: string;
  bcd?: number;
  igst?: number;
  errors?: string[];
  priceWarning?: {
    itemMasterPrice: number;
    pastedPrice: number;
    difference: number;
  };
  matched?: boolean;
};

export interface PasteParseOptions {
  delimiter?: 'auto' | 'comma' | 'tab' | 'semicolon' | 'pipe';
  skipHeader?: boolean;
}

const detectDelimiter = (line: string): PasteParseOptions['delimiter'] => {
  if (line.includes('\t')) return 'tab';
  if (line.includes(',')) return 'comma';
  if (line.includes(';')) return 'semicolon';
  if (line.includes('|')) return 'pipe';
  return 'auto';
};

const splitByDelimiter = (
  line: string,
  delimiter: PasteParseOptions['delimiter']
): string[] => {
  switch (delimiter) {
    case 'tab':
      return line.split('\t');
    case 'comma':
      return line.split(',');
    case 'semicolon':
      return line.split(';');
    case 'pipe':
      return line.split('|');
    case 'auto':
    default: {
      // Prefer tabs over commas for typical Excel copy
      if (line.includes('\t')) return line.split('\t');
      if (line.includes(',')) return line.split(',');
      if (line.includes(';')) return line.split(';');
      if (line.includes('|')) return line.split('|');
      return [line];
    }
  }
};

const toNumber = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const cleaned = value.replace(/[^0-9.-]/g, '').trim();
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return undefined;
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? num : undefined;
};

/**
 * Heuristic mapping of columns to fields.
 * Accepts 3-8 columns in common orders:
 * [partNumber, quantity, unitPrice, description?, unit?, hsnCode?, bcd?, igst?]
 * or [partNumber, description, unit, quantity, unitPrice, ...]
 */
const mapColumns = (cols: string[]): Omit<ParsedPasteLine, 'raw'> => {
  const trimmed = cols.map(c => c.trim());
  const result: Omit<ParsedPasteLine, 'raw'> = {};

  // Try pattern with description after part number
  // If col1 looks like a part number (alnum with dashes) and col2 is numeric -> assume [PN, QTY, PRICE]
  const isLikelyPart =
    /[A-Za-z]/.test(trimmed[0] || '') && /[\w.-]/.test(trimmed[0] || '');
  const n1 = toNumber(trimmed[1]);
  const n2 = toNumber(trimmed[2]);

  if (isLikelyPart && n1 !== undefined && n2 !== undefined) {
    result.partNumber = trimmed[0];
    result.quantity = n1;
    result.unitPrice = n2;
    result.description = trimmed[3];
    result.unit = trimmed[4];
    result.hsnCode = trimmed[5];
    result.bcd = toNumber(trimmed[6]);
    result.igst = toNumber(trimmed[7]);
    return result;
  }

  // Try pattern with description and unit between
  // [PN, DESC, UNIT, QTY, PRICE, HSN, BCD, IGST]
  const qIdx = 3;
  const pIdx = 4;
  if (
    isLikelyPart &&
    toNumber(trimmed[qIdx]) !== undefined &&
    toNumber(trimmed[pIdx]) !== undefined
  ) {
    result.partNumber = trimmed[0];
    result.description = trimmed[1];
    result.unit = trimmed[2];
    result.quantity = toNumber(trimmed[qIdx]);
    result.unitPrice = toNumber(trimmed[pIdx]);
    result.hsnCode = trimmed[5];
    result.bcd = toNumber(trimmed[6]);
    result.igst = toNumber(trimmed[7]);
    return result;
  }

  // Fallback: assume first three are PN, QTY, PRICE
  result.partNumber = trimmed[0];
  result.quantity = toNumber(trimmed[1]);
  result.unitPrice = toNumber(trimmed[2]);
  result.description = trimmed[3];
  result.unit = trimmed[4];
  result.hsnCode = trimmed[5];
  result.bcd = toNumber(trimmed[6]);
  result.igst = toNumber(trimmed[7]);
  return result;
};

export function parseMultiLinePaste(
  text: string,
  options: PasteParseOptions = {}
): ParsedPasteLine[] {
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

  const parsed: ParsedPasteLine[] = [];
  lines.forEach((rawLine, index) => {
    if (options.skipHeader && index === 0) return;
    const cols = splitByDelimiter(rawLine, delimiter);
    const mapped = mapColumns(cols);
    const errors: string[] = [];
    if (!mapped.partNumber) errors.push('Missing part number');
    if (mapped.quantity === undefined || mapped.quantity <= 0)
      errors.push('Invalid quantity');
    if (mapped.unitPrice === undefined || mapped.unitPrice < 0)
      errors.push('Invalid unit price');
    parsed.push({
      raw: rawLine,
      ...mapped,
      errors: errors.length ? errors : undefined,
    });
  });

  return parsed;
}

export function normalizePartNumber(
  partNumber: string | undefined
): string | undefined {
  return partNumber?.trim() || undefined;
}
