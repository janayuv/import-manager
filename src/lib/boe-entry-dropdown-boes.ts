import type { BoeDetails } from '@/types/boe';
import type { SavedBoe } from '@/types/boe-entry';

/**
 * BOE rows eligible for the BOE Entry “BOE No” combobox.
 *
 * A BOE is shown unless it is already consumed by a `Closed` saved calculation
 * (tracked via `usedBoeIds`), with the row currently being edited always kept.
 *
 * Fix: previously this also excluded any BOE whose derived status was `CLEARED`
 * (i.e. dutyPaid == dutyAmount). That was wrong — a fully paid BOE is exactly
 * what the BOE Entry form reconciles the calculated duty against (see the
 * dutyPaid vs. customsDutyTotal check in form.tsx). Excluding paid BOEs hid the
 * normal, linkable case (e.g. BE 7321003). The "already used" guard below is the
 * correct, narrower de-duplication, so the CLEARED-status filter was removed.
 */
export function selectBoesForEntryDropdown(
  allBoes: BoeDetails[],
  savedBoes: SavedBoe[],
  initialData: SavedBoe | null
): BoeDetails[] {
  const usedBoeIds = new Set(
    savedBoes
      .filter(savedBoe => savedBoe.status === 'Closed')
      .map(savedBoe => savedBoe.boeId)
      .filter((id): id is string => !!id)
  );

  return allBoes.filter(boe => {
    const isCurrentlyEditing = initialData?.boeId === boe.id;
    const isUnused = !usedBoeIds.has(boe.id);
    return isUnused || isCurrentlyEditing;
  });
}
