'use client';

import { type ColumnDef } from '@tanstack/react-table';

import { formatNumber, formatText, getFieldConfig } from '@/lib/settings';
import type { AppSettings } from '@/lib/settings';

// Interface for BOE Summary item data
export interface BoeSummaryItem {
  partNo: string;
  description: string;
  assessableValue: number;
  bcdValue: number;
  swsValue: number;
  igstValue: number;
  totalDuty: number;
  qty: number;
  perUnitDuty: number;
  landedCostPerUnit: number;
  actualDuty: number | null;
  dutySavings: number;
}

// Interface for BOE Summary table props
interface GetBoeSummaryColumnsProps {
  settings?: AppSettings;
}

export const getBoeSummaryColumns = ({
  settings,
}: GetBoeSummaryColumnsProps = {}): ColumnDef<BoeSummaryItem>[] => {
  // Get all possible columns
  const allColumns: ColumnDef<BoeSummaryItem>[] = [
    {
      accessorKey: 'partNo',
      header: 'Part No',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('boeSummary', 'partNo');
        const globalCase = settings?.textFormat?.case || 'sentencecase';
        const fieldCase = fieldConfig?.case || 'sentencecase';

        // If global case is 'uppercase', it should override field-specific case
        const finalCase = globalCase === 'uppercase' ? 'uppercase' : fieldCase;

        return formatText(row.getValue('partNo'), {
          case: finalCase as
            | 'lowercase'
            | 'uppercase'
            | 'titlecase'
            | 'sentencecase',
          trimWhitespace: fieldConfig?.trimWhitespace || false,
        });
      },
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('boeSummary', 'description');
        const globalCase = settings?.textFormat?.case || 'sentencecase';
        const fieldCase = fieldConfig?.case || 'sentencecase';

        // If global case is 'uppercase', it should override field-specific case
        const finalCase = globalCase === 'uppercase' ? 'uppercase' : fieldCase;

        return formatText(row.getValue('description'), {
          case: finalCase as
            | 'lowercase'
            | 'uppercase'
            | 'titlecase'
            | 'sentencecase',
          trimWhitespace: fieldConfig?.trimWhitespace || false,
        });
      },
    },
    {
      accessorKey: 'assessableValue',
      header: 'Assessable Value',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('boeSummary', 'assessableValue');
        return formatNumber(
          row.getValue('assessableValue') as number,
          settings?.numberFormat,
          {
            numberFormat: fieldConfig?.numberFormat || 'currency',
            precision: fieldConfig?.precision, // Let formatNumber use global setting if not specified
            showSign: fieldConfig?.showSign || false,
          }
        );
      },
    },
    {
      accessorKey: 'totalDuty',
      header: 'Total Duty',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('boeSummary', 'totalDuty');
        return formatNumber(
          row.getValue('totalDuty') as number,
          settings?.numberFormat,
          {
            numberFormat: fieldConfig?.numberFormat || 'currency',
            precision: fieldConfig?.precision, // Let formatNumber use global setting if not specified
            showSign: fieldConfig?.showSign || false,
          }
        );
      },
    },
    {
      accessorKey: 'actualDuty',
      header: 'Actual Duty',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('boeSummary', 'actualDuty');
        const value = row.getValue('actualDuty');
        if (value === null || value === undefined) return '-';
        return formatNumber(value as number, settings?.numberFormat, {
          numberFormat: fieldConfig?.numberFormat || 'currency',
          precision: fieldConfig?.precision, // Let formatNumber use global setting if not specified
          showSign: fieldConfig?.showSign || false,
        });
      },
    },
    {
      accessorKey: 'qty',
      header: 'Qty',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('boeSummary', 'qty');
        const value = row.getValue('qty');
        if (!value) return '-';
        return formatNumber(value as number, settings?.numberFormat, {
          numberFormat: fieldConfig?.numberFormat || 'integer',
          precision: fieldConfig?.precision, // Let formatNumber use global setting if not specified
          showSign: fieldConfig?.showSign || false,
        });
      },
    },
    {
      accessorKey: 'landedCostPerUnit',
      header: 'Landed Cost/Unit',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('boeSummary', 'landedCostPerUnit');
        return formatNumber(
          row.getValue('landedCostPerUnit') as number,
          settings?.numberFormat,
          {
            numberFormat: fieldConfig?.numberFormat || 'currency',
            precision: fieldConfig?.precision, // Let formatNumber use global setting if not specified
            showSign: fieldConfig?.showSign || false,
          }
        );
      },
    },
    {
      accessorKey: 'dutySavings',
      header: 'Duty Savings',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('boeSummary', 'dutySavings');
        const value = row.getValue('dutySavings');
        if (value === null || value === undefined) return '-';
        return formatNumber(value as number, settings?.numberFormat, {
          numberFormat: fieldConfig?.numberFormat || 'currency',
          precision: fieldConfig?.precision, // Let formatNumber use global setting if not specified
          showSign: fieldConfig?.showSign || false,
        });
      },
    },
  ];

  return allColumns;
};
