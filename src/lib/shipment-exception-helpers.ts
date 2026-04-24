import { parse, isValid } from 'date-fns';

import type { Shipment } from '@/types/shipment';

const DELIVERED_LIKE = new Set(['delivered', 'completed']);

function parseShipmentDate(value?: string | null): Date | null {
  if (!value || !String(value).trim()) return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = parse(s, 'yyyy-MM-dd', new Date());
    return isValid(d) ? d : null;
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const d = parse(s, 'dd-MM-yyyy', new Date());
    return isValid(d) ? d : null;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const d = parse(s, 'dd/MM/yyyy', new Date());
    return isValid(d) ? d : null;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isShipmentEtaOverdue(shipment: Shipment): boolean {
  const eta = parseShipmentDate(shipment.eta);
  if (!eta) return false;
  const st = (shipment.status || '').toLowerCase();
  if (DELIVERED_LIKE.has(st)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const e = new Date(eta);
  e.setHours(0, 0, 0, 0);
  return e < today;
}

export function parseInvoiceDateForFilter(value?: string | null): Date | null {
  return parseShipmentDate(value);
}
