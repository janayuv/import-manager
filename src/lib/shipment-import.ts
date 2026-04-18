import Papa from 'papaparse';

import { normalizeCsvEncoding } from '@/lib/csv-helpers';

/** Column order for CSV import and the downloadable template (matches `Shipment` fields). */
export const SHIPMENT_IMPORT_CSV_HEADERS = [
  'supplierId',
  'invoiceNumber',
  'invoiceDate',
  'goodsCategory',
  'invoiceValue',
  'invoiceCurrency',
  'incoterm',
  'shipmentMode',
  'shipmentType',
  'blAwbNumber',
  'blAwbDate',
  'vesselName',
  'containerNumber',
  'grossWeightKg',
  'etd',
  'eta',
  'status',
  'dateOfDelivery',
] as const;

export function escapeShipmentCsvCell(value: string): string {
  if (/[",\n\r\t]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * UTF-8 BOM + header row + example row (comma-separated).
 * Same columns as `parseShipmentImportCsv` expects; safe to open in Excel.
 */
export function buildShipmentImportTemplateCsv(): string {
  const exampleRow: string[] = [
    'Sup-002',
    'CNF-230717-1',
    '45124',
    'Non Woven',
    '15194790',
    'KRW',
    'EXW',
    'FCL',
    '40 FT',
    'MVMX207674',
    '45127',
    'Interasia Inspiration',
    'TCKU6546999',
    '2535',
    '45127',
    '45150',
    '',
    '',
  ];
  const lines = [
    SHIPMENT_IMPORT_CSV_HEADERS.join(','),
    exampleRow.map(escapeShipmentCsvCell).join(','),
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** Normalize header text to match Shipment / template field names (camelCase). */
const HEADER_ALIASES: Record<string, string> = {
  supplierid: 'supplierId',
  invoicenumber: 'invoiceNumber',
  invoicedate: 'invoiceDate',
  goodscategory: 'goodsCategory',
  invoicevalue: 'invoiceValue',
  invoicecurrency: 'invoiceCurrency',
  incoterm: 'incoterm',
  shipmentmode: 'shipmentMode',
  shipmenttype: 'shipmentType',
  blawbnumber: 'blAwbNumber',
  blawbdate: 'blAwbDate',
  vesselname: 'vesselName',
  containernumber: 'containerNumber',
  grossweightkg: 'grossWeightKg',
  etd: 'etd',
  eta: 'eta',
  status: 'status',
  dateofdelivery: 'dateOfDelivery',
  id: 'id',
};

export function canonicalShipmentCsvHeader(raw: string): string {
  const t = raw.replace(/^\uFEFF/, '').trim();
  if (!t) return t;
  const norm = t.toLowerCase().replace(/[\s_-]+/g, '');
  return HEADER_ALIASES[norm] ?? t;
}

/** Pick delimiter from the first non-empty line (tab vs comma vs semicolon). */
export function guessShipmentCsvDelimiter(text: string): string {
  const first =
    text.split(/\r\n|\n|\r/).find(line => line.trim().length > 0) ?? '';
  const tabs = (first.match(/\t/g) ?? []).length;
  const semis = (first.match(/;/g) ?? []).length;
  const commas = (first.match(/,/g) ?? []).length;
  if (tabs >= 1 && tabs >= commas) return '\t';
  if (semis > commas && semis >= tabs) return ';';
  return ',';
}

export function parseShipmentImportCsv(content: string): {
  data: Record<string, string>[];
  errors: Papa.ParseError[];
} {
  const text = normalizeCsvEncoding(content);
  const delimiter = guessShipmentCsvDelimiter(text);
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    delimiter,
    transformHeader: canonicalShipmentCsvHeader,
  });

  const data = parsed.data.map(row => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = v == null ? '' : String(v).trim();
    }
    return out;
  });

  return { data, errors: parsed.errors };
}
