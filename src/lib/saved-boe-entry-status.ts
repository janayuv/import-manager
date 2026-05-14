import type { BoeStatus } from '@/types/boe-entry';

/**
 * Default `SavedBoe.status` when persisting a **new** BOE Entry calculation from the form.
 * Matches backend `ALLOWED_STATUSES` in `boe_service.rs`: linked register BOE implies the
 * calculation is tied to official BOE data; without a link the invoice calc still awaits BOE.
 */
export function defaultSavedBoeStatusForNewEntry(
  boeId: string | undefined
): BoeStatus {
  return boeId?.trim() ? 'Reconciled' : 'Awaiting BOE Data';
}
