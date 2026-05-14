import { deriveBoeUiStatus } from '@/lib/boe-display-status';
import type { BoeDetails } from '@/types/boe';
import type { SavedBoe } from '@/types/boe-entry';

/**
 * BOE rows eligible for the BOE Entry “BOE No” combobox.
 * Excludes register-cleared BOEs (see deriveBoeUiStatus) except the row being edited.
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
    if (deriveBoeUiStatus(boe) === 'CLEARED' && !isCurrentlyEditing) {
      return false;
    }
    const isUnused = !usedBoeIds.has(boe.id);
    return isUnused || isCurrentlyEditing;
  });
}
