'use client';

import { ImSection } from '@/components/shared/im';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateForDisplay } from '@/lib/date-format';
import type { BoeDetails } from '@/types/boe';

interface BoeDetailsTableProps {
  boe: BoeDetails;
}

const formatCurrency = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined) return '-';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(amount);
};

export function BoeDetailsTable({ boe }: BoeDetailsTableProps) {
  return (
    <ImSection
      label="SELECTED BOE (REFERENCE)"
      sub={`Official record for BE #${boe.beNumber}.`}
    >
      <div className="border-im-rule bg-im-sub border">
        <Table className="im-table text-xs">
          <TableHeader>
            <TableRow className="border-0 hover:bg-transparent">
              <TableHead className="im-th !h-9 rounded-none font-mono">
                BE date
              </TableHead>
              <TableHead className="im-th !h-9 rounded-none font-mono">
                Location
              </TableHead>
              <TableHead className="im-th !h-9 rounded-none text-right font-mono">
                Assess. value
              </TableHead>
              <TableHead className="im-th !h-9 rounded-none text-right font-mono">
                Duty paid
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="hover:bg-im-hover border-0">
              <TableCell className="im-td text-im-text !max-w-none font-mono">
                {formatDateForDisplay(boe.beDate)}
              </TableCell>
              <TableCell className="im-td text-im-text !max-w-none">
                {boe.location}
              </TableCell>
              <TableCell className="im-td im-td-mono text-right">
                {formatCurrency(boe.totalAssessmentValue)}
              </TableCell>
              <TableCell className="im-td im-td-mono text-right">
                {formatCurrency(boe.dutyPaid)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </ImSection>
  );
}
