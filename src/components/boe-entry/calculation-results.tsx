'use client';

import { ImSection, ViewField } from '@/components/shared/im';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type CalculationResult = {
  bcdTotal?: number;
  swsTotal?: number;
  igstTotal?: number;
  totalDuty?: number;
  totalAmount?: number;
  items?: Array<Record<string, unknown>>;
  calculatedItems?: Array<Record<string, unknown>>;
  exchangeRate?: number;
  calculationDate?: string;
};

interface CalculationResultsProps {
  results: unknown;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

interface CalculationItem {
  description?: string;
  assessableValue?: number;
  bcd?: number;
  igst?: number;
  compCess?: number;
  total?: number;
  [key: string]: unknown;
}

export function CalculationResults({ results }: CalculationResultsProps) {
  const r = results as CalculationResult;
  const detailItems = (r.items ??
    (r as Record<string, unknown>).calculatedItems ??
    []) as CalculationItem[];
  const safeNum = (v: unknown): number =>
    typeof v === 'number' && isFinite(v) ? v : 0;
  const safeStr = (v: unknown): string => (typeof v === 'string' ? v : '');
  const bcdTotal = safeNum((r as Record<string, unknown>).bcdTotal);
  const swsTotal = safeNum((r as Record<string, unknown>).swsTotal);
  const igstTotal = safeNum((r as Record<string, unknown>).igstTotal);
  const interest = safeNum((r as Record<string, unknown>).interest);
  const totalDuty =
    safeNum((r as Record<string, unknown>).totalDuty) ||
    safeNum((r as Record<string, unknown>).customsDutyTotal) ||
    bcdTotal + swsTotal + igstTotal + interest;

  return (
    <div className="mt-6 flex flex-col gap-3">
      <ImSection
        label="CALCULATION SUMMARY"
        sub="Duty totals from the last successful run."
      >
        <div className="im-grid im-grid__4 gap-3">
          <ViewField label="BCD TOTAL" value={formatCurrency(bcdTotal)} mono />
          <ViewField label="SWS TOTAL" value={formatCurrency(swsTotal)} mono />
          <ViewField
            label="IGST TOTAL"
            value={formatCurrency(igstTotal)}
            mono
          />
          <ViewField
            label="TOTAL DUTY"
            value={formatCurrency(totalDuty)}
            mono
          />
        </div>
      </ImSection>

      <ImSection
        label="LINE BREAKDOWN"
        sub="Per-line assessable value and duty components."
      >
        <div className="border-im-rule bg-im-sub border">
          <Table className="im-table text-xs">
            <TableHeader>
              <TableRow className="border-0 hover:bg-transparent">
                <TableHead className="im-th !h-9 rounded-none font-mono">
                  Item
                </TableHead>
                <TableHead className="im-th !h-9 rounded-none text-right font-mono">
                  Assessable value
                </TableHead>
                <TableHead className="im-th !h-9 rounded-none text-right font-mono">
                  BCD
                </TableHead>
                <TableHead className="im-th !h-9 rounded-none text-right font-mono">
                  SWS
                </TableHead>
                <TableHead className="im-th !h-9 rounded-none text-right font-mono">
                  IGST
                </TableHead>
                <TableHead className="im-th !h-9 rounded-none text-right font-mono">
                  Total
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detailItems.map((item, index) => {
                const description =
                  safeStr(item.description) || `Item ${index + 1}`;
                const assessableValue = safeNum(item.assessableValue);
                const bcd = safeNum(item.bcd ?? item.bcdValue);
                const sws = safeNum(
                  (item as Record<string, unknown>).sws ??
                    (item as Record<string, unknown>).swsValue
                );
                const igst = safeNum(item.igst ?? item.igstValue);
                const total =
                  safeNum((item as Record<string, unknown>).total) ||
                  assessableValue + bcd + sws + igst;
                const alt = index % 2 === 1;
                return (
                  <TableRow
                    key={index}
                    className={
                      alt
                        ? 'im-tr is-alt hover:bg-im-hover border-0'
                        : 'im-tr hover:bg-im-hover border-0'
                    }
                  >
                    <TableCell className="im-td text-im-text !max-w-[min(280px,40vw)] font-medium">
                      {description}
                    </TableCell>
                    <TableCell className="im-td im-td-mono text-right">
                      {formatCurrency(assessableValue)}
                    </TableCell>
                    <TableCell className="im-td im-td-mono text-right">
                      {formatCurrency(bcd)}
                    </TableCell>
                    <TableCell className="im-td im-td-mono text-right">
                      {formatCurrency(sws)}
                    </TableCell>
                    <TableCell className="im-td im-td-mono text-right">
                      {formatCurrency(igst)}
                    </TableCell>
                    <TableCell className="im-td im-td-mono text-im-text text-right font-semibold">
                      {formatCurrency(total)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </ImSection>

      <ImSection
        label="RUN METADATA"
        sub="Reference values for this calculation."
      >
        <div className="im-grid gap-3 md:grid-cols-2">
          <ViewField
            label="EXCHANGE RATE"
            value={
              r.exchangeRate != null && isFinite(r.exchangeRate)
                ? `USD 1 = INR ${r.exchangeRate.toFixed(2)}`
                : undefined
            }
            mono
          />
          <ViewField
            label="CALCULATION DATE"
            value={
              r.calculationDate
                ? new Date(r.calculationDate).toLocaleDateString('en-IN')
                : undefined
            }
            mono
          />
        </div>
      </ImSection>
    </div>
  );
}
