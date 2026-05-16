'use client';

import { Eye, Pencil, Trash2 } from 'lucide-react';
import React from 'react';

import { ImSection } from '@/components/shared/im';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { SavedBoe } from '@/types/boe-entry';

interface SavedBoeListProps {
  savedBoes: SavedBoe[];
  onView: (boeId: string) => void;
  onEdit: (boeId: string) => void;
  onDelete: (boeId: string) => void;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(amount);
};

export function SavedBoeList({
  savedBoes,
  onView,
  onEdit,
  onDelete,
}: SavedBoeListProps) {
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportHeight, setViewportHeight] = React.useState(320);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const rowHeight = 56;
  const overscan = 6;

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const update = () => setViewportHeight(node.clientHeight || 320);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const shouldVirtualize = savedBoes.length > 20;
  const start = shouldVirtualize
    ? Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
    : 0;
  const count = shouldVirtualize
    ? Math.ceil(viewportHeight / rowHeight) + overscan * 2
    : savedBoes.length;
  const end = shouldVirtualize
    ? Math.min(savedBoes.length, start + count)
    : savedBoes.length;
  const visibleBoes = savedBoes.slice(start, end);
  const topSpacer = shouldVirtualize ? start * rowHeight : 0;
  const bottomSpacer = shouldVirtualize
    ? Math.max(0, (savedBoes.length - end) * rowHeight)
    : 0;

  if (savedBoes.length === 0) {
    return null;
  }

  return (
    <ImSection
      label="SAVED BOE CALCULATIONS"
      sub="Saved duty runs on this device — view, edit, or remove a record."
    >
      <div className="border-im-rule bg-im-panel border">
        <div
          ref={containerRef}
          className="im-table-scroll max-h-[420px]"
          onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
        >
          <Table className="im-table text-xs">
            <TableHeader>
              <TableRow className="border-0 hover:bg-transparent">
                <TableHead className="im-th !h-9 rounded-none font-mono">
                  Invoice number
                </TableHead>
                <TableHead className="im-th !h-9 rounded-none font-mono">
                  Supplier
                </TableHead>
                <TableHead className="im-th !h-9 rounded-none text-right font-mono">
                  Total duty
                </TableHead>
                <TableHead className="im-th im-th-actions !h-9 rounded-none text-right font-mono">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topSpacer > 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    style={{
                      height: `${topSpacer}px`,
                      padding: 0,
                      border: 'none',
                    }}
                  />
                </TableRow>
              )}
              {visibleBoes.map((boe, visibleIndex) => {
                const rowIndex = start + visibleIndex;
                return (
                  <TableRow
                    key={boe.id}
                    className={cn(
                      'im-tr hover:bg-im-hover border-0',
                      rowIndex % 2 === 1 && 'is-alt'
                    )}
                  >
                    <TableCell className="im-td im-td-name-main !max-w-none">
                      {boe.invoiceNumber}
                    </TableCell>
                    <TableCell className="im-td text-im-text !max-w-[min(280px,40vw)]">
                      {boe.supplierName}
                    </TableCell>
                    <TableCell className="im-td im-td-mono text-right">
                      {formatCurrency(boe.calculationResult.customsDutyTotal)}
                    </TableCell>
                    <TableCell className="im-td im-td-actions">
                      <div className="im-row-actions">
                        <button
                          type="button"
                          className="im-btn-icon"
                          aria-label="View saved calculation"
                          onClick={() => onView(boe.id)}
                        >
                          <Eye size={13} strokeWidth={1.75} />
                        </button>
                        <button
                          type="button"
                          className="im-btn-icon"
                          aria-label="Edit saved calculation"
                          onClick={() => onEdit(boe.id)}
                        >
                          <Pencil size={13} strokeWidth={1.75} />
                        </button>
                        <button
                          type="button"
                          className="im-btn-icon text-im-bad hover:border-im-bad-bdr"
                          aria-label="Delete saved calculation"
                          onClick={() => onDelete(boe.id)}
                        >
                          <Trash2 size={13} strokeWidth={1.75} />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {bottomSpacer > 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    style={{
                      height: `${bottomSpacer}px`,
                      padding: 0,
                      border: 'none',
                    }}
                  />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </ImSection>
  );
}
