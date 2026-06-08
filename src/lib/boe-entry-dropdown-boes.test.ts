import { describe, expect, it } from 'vitest';

import { selectBoesForEntryDropdown } from '@/lib/boe-entry-dropdown-boes';
import type { BoeDetails } from '@/types/boe';
import type { SavedBoe } from '@/types/boe-entry';

const baseBoe = (
  over: Partial<BoeDetails> & Pick<BoeDetails, 'id'>
): BoeDetails => ({
  beNumber: 'BE123',
  beDate: '2024-06-01',
  location: 'LOC',
  totalAssessmentValue: 10_000,
  dutyAmount: 1000,
  dutyPaid: 0,
  ...over,
});

const minimalSaved = (
  over: Partial<SavedBoe> & Pick<SavedBoe, 'id' | 'status'>
): SavedBoe =>
  ({
    shipmentId: 's1',
    invoiceNumber: 'INV1',
    supplierName: 'Sup',
    formValues: {
      supplierName: 'Sup',
      shipmentId: 's1',
      exchangeRate: 1,
      freightCost: 0,
      exwCost: 0,
      insuranceRate: 0,
    },
    itemInputs: [],
    calculationResult: {
      calculatedItems: [],
      bcdTotal: 0,
      swsTotal: 0,
      igstTotal: 0,
      interest: 0,
      customsDutyTotal: 0,
    },
    ...over,
  }) as SavedBoe;

describe('selectBoesForEntryDropdown', () => {
  it('includes fully paid (CLEARED) but unused BOEs for new entry', () => {
    // Fix: a fully paid BOE (dutyPaid == dutyAmount) must remain selectable —
    // the BOE Entry form reconciles the calculated duty against dutyPaid, so a
    // paid BOE is the normal linkable case. Only "already used" BOEs are hidden.
    const cleared = baseBoe({
      id: 'b-cleared',
      dutyPaid: 1000,
      dutyAmount: 1000,
      totalAssessmentValue: 10_000,
    });
    const assessed = baseBoe({
      id: 'b-open',
      dutyPaid: 0,
      dutyAmount: 1000,
      totalAssessmentValue: 10_000,
    });
    const ids = selectBoesForEntryDropdown([cleared, assessed], [], null).map(
      b => b.id
    );
    expect(ids).toContain('b-open');
    expect(ids).toContain('b-cleared');
  });

  it('still includes the linked BOE when editing that saved record (even if CLEARED)', () => {
    const cleared = baseBoe({
      id: 'b-cleared',
      dutyPaid: 1000,
      dutyAmount: 1000,
      totalAssessmentValue: 10_000,
    });
    const initial = minimalSaved({
      id: 'save-1',
      status: 'Awaiting BOE Data',
      boeId: 'b-cleared',
    });
    const rows = selectBoesForEntryDropdown([cleared], [], initial);
    expect(rows.map(b => b.id)).toEqual(['b-cleared']);
  });

  it('excludes BOEs already on a Closed saved calculation unless editing that BOE', () => {
    const b1 = baseBoe({ id: 'b1', dutyAmount: 500, dutyPaid: 0 });
    const closed = minimalSaved({
      id: 'closed-save',
      status: 'Closed',
      boeId: 'b1',
    });
    const ids = selectBoesForEntryDropdown([b1], [closed], null).map(b => b.id);
    expect(ids).not.toContain('b1');
  });
});
