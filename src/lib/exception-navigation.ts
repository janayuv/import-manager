import type { DashboardException } from '@/types/dashboard-metrics';

/** Resolves backend `navigationUrl` or builds `/shipment?…` from `filterParameters`. */
export function getExceptionNavigationTarget(ex: DashboardException): string {
  const direct = ex.navigationUrl?.trim();
  if (direct) return direct;
  const base =
    (ex.navigationTarget || '/shipment').split('?')[0] || '/shipment';
  const fp = ex.filterParameters;
  if (!fp || typeof fp !== 'object') return base;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(fp)) {
    if (v === undefined || v === null) continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
