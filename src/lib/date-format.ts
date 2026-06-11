// src/lib/date-format.ts
// Robust date formatting helpers using date-fns
import { format as formatDate, isValid, parse } from 'date-fns';

const INPUT_FORMAT = 'yyyy-MM-dd';
const DISPLAY_FORMAT = 'dd-MM-yyyy';

/** Parse BOE/shipment-style date strings (dd-MM-yyyy, yyyy-MM-dd, ISO). */
export function parseFlexibleDate(
  dateString: string | undefined | null
): Date | null {
  if (!dateString) return null;
  return tryParse(dateString);
}

function tryParse(dateString: string): Date | null {
  // Accept common formats: dd-MM-yyyy, yyyy-MM-dd
  const trimmed = (dateString || '').trim();
  if (!trimmed) return null;

  // Try dd-MM-yyyy
  const dmy = parse(trimmed, DISPLAY_FORMAT, new Date());
  if (isValid(dmy)) return dmy;

  // Try yyyy-MM-dd
  const ymd = parse(trimmed, INPUT_FORMAT, new Date());
  if (isValid(ymd)) return ymd;

  // Fallback: native Date parser (ISO etc.)
  const native = new Date(trimmed);
  return isValid(native) ? native : null;
}

// Converts any acceptable date string to dd-MM-yyyy for display in text fields
export const formatDateForDisplay = (
  dateString: string | undefined | null
): string => {
  if (!dateString) return '';
  const parsed = tryParse(dateString);
  return parsed ? formatDate(parsed, DISPLAY_FORMAT) : '';
};

// Converts any acceptable date string to yyyy-MM-dd for input[type="date"]
export const formatDateForInput = (
  dateString: string | undefined | null
): string => {
  if (!dateString) return '';
  const parsed = tryParse(dateString);
  return parsed ? formatDate(parsed, INPUT_FORMAT) : '';
};

// Formats as DD/MM/YYYY — used in PDF exports
export const formatDateDDMMYYYY = (iso: string): string => {
  const parsed = tryParse(iso);
  return parsed ? formatDate(parsed, 'dd/MM/yyyy') : '—';
};

// Formats as DD-MMM-YYYY (e.g. 15-Jun-2024) — used in Excel exports
export const formatDateDDMMMYYYY = (iso: string): string => {
  const parsed = tryParse(iso);
  return parsed ? formatDate(parsed, 'dd-MMM-yyyy') : '—';
};
