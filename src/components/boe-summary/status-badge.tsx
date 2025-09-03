'use client';

import { Badge } from '@/components/ui/badge';
import type { SavedBoe } from '@/types/boe-entry';

const statusToVariant: Record<
  SavedBoe['status'],
  {
    variant: 'info' | 'destructive' | 'success' | 'warning' | 'neutral';
    label: string;
  }
> = {
  'Awaiting BOE Data': { variant: 'info', label: 'Awaiting BOE Data' },
  'Discrepancy Found': { variant: 'destructive', label: 'Discrepancy Found' },
  Reconciled: { variant: 'success', label: 'Reconciled' },
  Investigation: { variant: 'warning', label: 'Investigation' },
  Closed: { variant: 'neutral', label: 'Closed' },
};

export function StatusBadge({ status }: { status: SavedBoe['status'] }) {
  const v = statusToVariant[status] ?? statusToVariant['Awaiting BOE Data'];
  return <Badge variant={v.variant}>{v.label}</Badge>;
}
