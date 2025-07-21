// sort-indicator.tsx
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import type { Column } from '@tanstack/react-table';
import type { Shipment } from '@/types/shipment';

export const SortIndicator = ({ column }: { column: Column<Shipment, unknown> }) => {
  const sorted = column.getIsSorted();
  if (sorted === 'asc') return <ArrowUp className="ml-2 h-4 w-4" />;
  if (sorted === 'desc') return <ArrowDown className="ml-2 h-4 w-4" />;
  return <ArrowUpDown className="ml-2 h-4 w-4" />;
};
