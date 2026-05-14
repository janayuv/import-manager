// Derived BOE workflow status for UI (boe_details has no status column).
import { parseFlexibleDate } from '@/lib/date-format';
import type { BoeDetails } from '@/types/boe';

const TOL = 0.01;
/** BE date this old with duty still unpaid → ON HOLD row styling / status. */
const DAYS_ON_HOLD = 45;
/** ASSESSED and BE date this old → pending overdue (blue exception rail). */
const DAYS_PENDING_OVERDUE = 21;

export type BoeUiStatus = 'FILED' | 'ASSESSED' | 'CLEARED' | 'ON_HOLD';

function daysSinceBeDate(boe: BoeDetails): number {
  const d = parseFlexibleDate(boe.beDate);
  if (!d) return 0;
  return (Date.now() - d.getTime()) / 86_400_000;
}

export function deriveBoeUiStatus(boe: BoeDetails): BoeUiStatus {
  const duty = boe.dutyAmount ?? 0;
  const paid = boe.dutyPaid ?? 0;
  const assessed = (boe.totalAssessmentValue ?? 0) > TOL;
  const paidUp = duty <= TOL || Math.abs(paid - duty) < TOL;

  if (paidUp) {
    if (!assessed && duty <= TOL) return 'FILED';
    return 'CLEARED';
  }

  const days = daysSinceBeDate(boe);
  if (days >= DAYS_ON_HOLD && paid < duty - TOL) return 'ON_HOLD';

  return 'ASSESSED';
}

/** ASSESSED with BE aging past threshold — blue “pending overdue” rail. */
export function isBoePendingOverdue(boe: BoeDetails): boolean {
  if (deriveBoeUiStatus(boe) !== 'ASSESSED') return false;
  return daysSinceBeDate(boe) >= DAYS_PENDING_OVERDUE;
}

export function boeMetricsFromList(boes: BoeDetails[]): {
  total: number;
  cleared: number;
  pendingAssessment: number;
  onHold: number;
} {
  let cleared = 0;
  let pendingAssessment = 0;
  let onHold = 0;
  for (const b of boes) {
    const s = deriveBoeUiStatus(b);
    if (s === 'CLEARED') cleared++;
    else if (s === 'ON_HOLD') onHold++;
    else pendingAssessment++;
  }
  return {
    total: boes.length,
    cleared,
    pendingAssessment,
    onHold,
  };
}
