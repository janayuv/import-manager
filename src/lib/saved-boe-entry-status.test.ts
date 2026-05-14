import { describe, expect, it } from 'vitest';

import { defaultSavedBoeStatusForNewEntry } from '@/lib/saved-boe-entry-status';

describe('defaultSavedBoeStatusForNewEntry', () => {
  it('returns Reconciled when a register BOE id is linked', () => {
    expect(defaultSavedBoeStatusForNewEntry('boe-reg-1')).toBe('Reconciled');
  });

  it('returns Awaiting BOE Data when unlinked or blank', () => {
    expect(defaultSavedBoeStatusForNewEntry(undefined)).toBe(
      'Awaiting BOE Data'
    );
    expect(defaultSavedBoeStatusForNewEntry('')).toBe('Awaiting BOE Data');
    expect(defaultSavedBoeStatusForNewEntry('   ')).toBe('Awaiting BOE Data');
  });
});
