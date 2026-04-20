import type { Item } from '@/types/item';

/** Parse Item Master percentage fields ("10%", "7.5") or numeric values into a number. */
export function parsePercentage(
  value: string | number | undefined | null
): number {
  if (value === undefined || value === null) {
    return 0;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const cleanValue = value.replace('%', '').trim();
  const parsed = parseFloat(cleanValue);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Values to store on an invoice line from current Item Master rates. */
export function invoiceTaxSnapshotFromItem(item: Item) {
  return {
    dutyPercent: parsePercentage(item.bcd),
    swsPercent: parsePercentage(item.sws),
    igstPercent: parsePercentage(item.igst),
  };
}
