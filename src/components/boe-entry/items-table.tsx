'use client';

import { toast } from 'sonner';

import type { Dispatch, SetStateAction } from 'react';
import React from 'react';

import { ImInput } from '@/components/shared/im';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  BoeItemInput,
  CalculationMethod,
  InvoiceItem,
} from '@/types/boe-entry';

const IM_SELECT_TRIGGER =
  'im-select !h-[34px] w-full min-w-0 rounded-none px-2 text-left text-xs shadow-none focus:ring-0 focus-visible:ring-0 data-[size=default]:!h-[34px]';

interface ItemsTableProps {
  items: InvoiceItem[];
  itemInputs: BoeItemInput[];
  setItemInputs: Dispatch<SetStateAction<BoeItemInput[]>>;
}

export function ItemsTable({
  items = [],
  itemInputs,
  setItemInputs,
}: ItemsTableProps) {
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportHeight, setViewportHeight] = React.useState(360);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const rowHeight = 60;
  const overscan = 6;

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const update = () => setViewportHeight(node.clientHeight || 360);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  const handleInputChange = (
    index: number,
    field: keyof BoeItemInput,
    value: string | number
  ) => {
    const updatedInputs = [...itemInputs];

    updatedInputs[index] = {
      ...updatedInputs[index],
      [field]: value,
    };
    setItemInputs(updatedInputs);

    // Validate BCD rates when BOE BCD is changed
    if (field === 'boeBcdRate') {
      const item = items[index];
      const actualBcd = item.actualBcdRate;
      const boeBcd = value as number;

      // Show warning if BOE BCD > Actual BCD (BOE BCD should not be higher than Actual BCD)
      if (boeBcd > 0 && boeBcd > actualBcd) {
        toast.warning(`BCD Discrepancy Alert`, {
          description: `Part ${item.partNo}: BOE BCD (${boeBcd}%) > Actual BCD (${actualBcd}%). Please verify the rates.`,
          duration: 5000,
        });
      }
    }
  };

  // Removed unused function

  // Validate all items on component mount and when items change
  React.useEffect(() => {
    if (items.length > 0 && itemInputs.length > 0) {
      // Show discrepancies if BOE BCD > Actual BCD (BOE BCD should not be higher than Actual BCD)
      const discrepancies = items
        .map((item, index) => {
          const actualBcd = item.actualBcdRate;

          const boeBcd = itemInputs[index]?.boeBcdRate || 0;
          return {
            partNo: item.partNo,
            actualBcd,
            boeBcd,
            hasDiscrepancy: boeBcd > 0 && boeBcd > actualBcd, // BOE BCD > Actual BCD
          };
        })
        .filter(d => d.hasDiscrepancy);

      if (discrepancies.length > 0) {
        const partNumbers = discrepancies.map(d => d.partNo).join(', ');
        toast.error(`BCD Discrepancy Found`, {
          description: `BOE BCD > Actual BCD for parts: ${partNumbers}. Please review and correct.`,
          duration: 8000,
        });
      }
    }
  }, [items, itemInputs]);

  return (
    <div className="border-im-rule bg-im-panel border">
      <div
        ref={containerRef}
        className="im-table-scroll max-h-[520px]"
        onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
      >
        <Table className="im-table text-xs">
          <TableHeader>
            <TableRow className="border-0 hover:bg-transparent">
              <TableHead className="im-th !h-9 w-[140px] rounded-none">
                Part no
              </TableHead>
              <TableHead className="im-th !h-9 min-w-[120px] rounded-none">
                Description
              </TableHead>
              <TableHead className="im-th !h-9 rounded-none text-right">
                Qty
              </TableHead>
              <TableHead className="im-th !h-9 rounded-none text-right">
                Unit price
              </TableHead>
              <TableHead className="im-th !h-9 rounded-none text-right">
                HS code
              </TableHead>
              <TableHead className="im-th !h-9 rounded-none text-right">
                Act. BCD %
              </TableHead>
              <TableHead className="im-th !h-9 rounded-none text-right">
                Act. SWS %
              </TableHead>
              <TableHead className="im-th !h-9 rounded-none text-right">
                Act. IGST %
              </TableHead>
              <TableHead className="im-th !h-9 w-[130px] rounded-none">
                Calc method
              </TableHead>
              <TableHead className="im-th !h-9 w-[110px] rounded-none text-right">
                BOE BCD %
              </TableHead>
              <TableHead className="im-th !h-9 w-[110px] rounded-none text-right">
                BOE SWS %
              </TableHead>
              <TableHead className="im-th !h-9 w-[110px] rounded-none text-right">
                BOE IGST %
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(() => {
              const shouldVirtualize = items.length > 25;
              const start = shouldVirtualize
                ? Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
                : 0;
              const count = shouldVirtualize
                ? Math.ceil(viewportHeight / rowHeight) + overscan * 2
                : items.length;
              const end = shouldVirtualize
                ? Math.min(items.length, start + count)
                : items.length;
              const topSpacer = shouldVirtualize ? start * rowHeight : 0;
              const bottomSpacer = shouldVirtualize
                ? Math.max(0, (items.length - end) * rowHeight)
                : 0;
              const visible = items.slice(start, end);
              return (
                <>
                  {topSpacer > 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={12}
                        style={{
                          height: `${topSpacer}px`,
                          padding: 0,
                          border: 'none',
                        }}
                      />
                    </TableRow>
                  )}
                  {visible.map((item, visibleIndex) => {
                    const index = start + visibleIndex;
                    const actualBcd = item.actualBcdRate;

                    const boeBcd = itemInputs[index]?.boeBcdRate || 0;
                    const hasBcdDiscrepancy = boeBcd > 0 && boeBcd > actualBcd;

                    return (
                      <TableRow
                        key={item.partNo}
                        className={cn(
                          'im-tr hover:bg-im-hover border-0',
                          index % 2 === 1 && 'is-alt',
                          hasBcdDiscrepancy && 'bg-im-bad-bg'
                        )}
                      >
                        <TableCell className="im-td im-td-id !max-w-none">
                          {item.partNo}
                        </TableCell>
                        <TableCell className="im-td text-im-text !max-w-[min(220px,28vw)]">
                          {item.description}
                        </TableCell>
                        <TableCell className="im-td im-td-mono text-right">
                          {item.qty ?? '-'}
                        </TableCell>
                        <TableCell className="im-td im-td-mono text-right">
                          {item.unitPrice != null
                            ? item.unitPrice.toFixed(2)
                            : '-'}
                        </TableCell>
                        <TableCell className="im-td im-td-mono text-right">
                          {item.hsCode ?? '-'}
                        </TableCell>
                        <TableCell className="im-td im-td-mono text-right">
                          {item.actualBcdRate.toFixed(2)}%
                        </TableCell>
                        <TableCell className="im-td im-td-mono text-right">
                          {item.actualSwsRate.toFixed(2)}%
                        </TableCell>
                        <TableCell className="im-td im-td-mono text-right">
                          {item.actualIgstRate.toFixed(2)}%
                        </TableCell>
                        <TableCell className="im-td !max-w-none py-1">
                          <Select
                            value={
                              itemInputs[index]?.calculationMethod || 'Standard'
                            }
                            onValueChange={(value: CalculationMethod) =>
                              handleInputChange(
                                index,
                                'calculationMethod',
                                value
                              )
                            }
                          >
                            <SelectTrigger className={IM_SELECT_TRIGGER}>
                              <SelectValue placeholder="Select method" />
                            </SelectTrigger>
                            <SelectContent className="border-im-rule bg-im-panel text-im-text">
                              <SelectItem value="Standard">Standard</SelectItem>
                              <SelectItem value="CEPA">CEPA</SelectItem>
                              <SelectItem value="Rodtep">Rodtep</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="im-td py-1">
                          <ImInput
                            type="number"
                            mono
                            hasError={hasBcdDiscrepancy}
                            className="text-right"
                            value={itemInputs[index]?.boeBcdRate ?? ''}
                            onChange={e =>
                              handleInputChange(
                                index,
                                'boeBcdRate',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            title={
                              hasBcdDiscrepancy
                                ? `Actual BCD (${actualBcd}%) > BOE BCD (${boeBcd}%)`
                                : ''
                            }
                          />
                        </TableCell>
                        <TableCell className="im-td py-1">
                          <ImInput
                            type="number"
                            mono
                            className="text-right"
                            value={itemInputs[index]?.boeSwsRate ?? ''}
                            onChange={e =>
                              handleInputChange(
                                index,
                                'boeSwsRate',
                                parseFloat(e.target.value) || 0
                              )
                            }
                          />
                        </TableCell>
                        <TableCell className="im-td py-1">
                          <ImInput
                            type="number"
                            mono
                            readOnly
                            className="text-right"
                            value={itemInputs[index]?.boeIgstRate ?? ''}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {bottomSpacer > 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={12}
                        style={{
                          height: `${bottomSpacer}px`,
                          padding: 0,
                          border: 'none',
                        }}
                      />
                    </TableRow>
                  )}
                </>
              );
            })()}
          </TableBody>
        </Table>
      </div>

      {/* BCD Discrepancy Summary */}
      {items.some((item, index) => {
        const actualBcd = item.actualBcdRate;

        const boeBcd = itemInputs[index]?.boeBcdRate || 0;
        return boeBcd > 0 && boeBcd > actualBcd;
      }) && (
        <div className="border-im-bad-bdr bg-im-bad-bg border-t px-3 py-2">
          <div className="text-im-bad flex items-center gap-2 font-mono text-xs font-semibold tracking-wide">
            <svg
              className="h-4 w-4 shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span>BCD Discrepancy Alert</span>
          </div>
          <p className="text-im-muted mt-1 font-sans text-[11px] leading-snug">
            BOE BCD rates are higher than Actual BCD rates for some items.
            Please review and correct the rates.
          </p>
        </div>
      )}
    </div>
  );
}
