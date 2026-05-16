// src/components/invoice/columns.tsx (MODIFIED - Formats tax numbers as percentages)
import type { ColumnDef } from '@tanstack/react-table';

import type { InvoiceTableColumnMeta } from '@/components/invoice/table-invoice';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatDateForDisplay } from '@/lib/date-format';
import { formatNumber, formatText, getFieldConfig } from '@/lib/settings';
import type { AppSettings } from '@/lib/settings';
import type { FlattenedInvoiceLine } from '@/types/invoice';

import { InvoiceLineActions } from './actions';

interface GetInvoiceColumnsProps {
  onView: (invoiceId: string) => void;
  onEdit: (invoiceId: string) => void;
  onDelete: (invoiceId: string, invoiceNumber: string) => void;
  onQuickFinalize: (invoiceId: string, invoiceNumber: string) => void;
  settings?: AppSettings;
}

const formatCurrency = (amount: number, currency: string) => {
  // Normalize common currency codes
  const normalizedCurrency =
    currency?.toUpperCase() === 'EURO' ? 'EUR' : currency?.toUpperCase();

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalizedCurrency,
    }).format(amount);
  } catch {
    // Fallback for invalid currency codes
    return `${normalizedCurrency} ${amount.toFixed(2)}`;
  }
};

function InvoiceStatusPill({
  status,
}: {
  status: 'Draft' | 'Finalized' | 'Mismatch';
}) {
  if (status === 'Draft') {
    return (
      <span className="im-inv-pill im-inv-pill--draft">
        <span className="im-inv-pill__dot" />
        DRAFT
      </span>
    );
  }
  if (status === 'Finalized') {
    return (
      <span className="im-inv-pill im-inv-pill--sent">
        <span className="im-inv-pill__dot" />
        SENT
      </span>
    );
  }
  return (
    <span className="im-inv-pill im-inv-pill--overdue">
      <span className="im-inv-pill__dot" />
      OVERDUE
    </span>
  );
}

const numMeta: InvoiceTableColumnMeta = {
  thClass: 'im-th--num',
  tdClass: 'im-td--num',
};

// The columns now expect the flattened data structure
export const getInvoiceColumns = ({
  onView,
  onEdit,
  onDelete,
  onQuickFinalize,
  settings,
}: GetInvoiceColumnsProps): ColumnDef<FlattenedInvoiceLine>[] => {
  // Get all possible columns
  const allColumns: ColumnDef<FlattenedInvoiceLine>[] = [
    {
      id: 'actions',
      size: 120,
      meta: { tdClass: 'im-td--actions' },
      cell: ({ row }) => (
        <InvoiceLineActions
          lineItem={row.original}
          onView={onView}
          onEdit={onEdit}
          onDelete={onDelete}
          onQuickFinalize={onQuickFinalize}
        />
      ),
    },
    {
      accessorKey: 'supplierName',
      header: 'Supplier Name',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('invoice', 'supplierName');
        if (fieldConfig?.case === 'none') {
          return row.getValue('supplierName');
        }
        return formatText(row.getValue('supplierName'), {
          case: fieldConfig?.case || 'sentencecase',
          trimWhitespace: fieldConfig?.trimWhitespace || false,
        });
      },
    },
    {
      accessorKey: 'invoiceNumber',
      header: 'Invoice No',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('invoice', 'invoiceNumber');
        if (fieldConfig?.case === 'none') {
          return row.getValue('invoiceNumber');
        }
        return formatText(row.getValue('invoiceNumber'), {
          case: fieldConfig?.case || 'sentencecase',
          trimWhitespace: fieldConfig?.trimWhitespace || false,
        });
      },
    },
    {
      accessorKey: 'invoiceDate',
      header: 'Invoice Date',
      cell: ({ row }) => formatDateForDisplay(row.original.invoiceDate),
    },
    {
      accessorKey: 'partNumber',
      header: 'Part No',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('invoice', 'partNumber');
        if (fieldConfig?.case === 'none') {
          return row.getValue('partNumber');
        }
        return formatText(row.getValue('partNumber'), {
          case: fieldConfig?.case || 'sentencecase',
          trimWhitespace: fieldConfig?.trimWhitespace || false,
        });
      },
    },
    {
      accessorKey: 'itemDescription',
      header: 'Description',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('invoice', 'itemDescription');
        if (fieldConfig?.case === 'none') {
          return row.getValue('itemDescription');
        }
        return formatText(row.getValue('itemDescription'), {
          case: fieldConfig?.case || 'sentencecase',
          trimWhitespace: fieldConfig?.trimWhitespace || false,
        });
      },
    },
    {
      accessorKey: 'hsnCode',
      header: 'HS.Code',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('invoice', 'hsnCode');
        if (fieldConfig?.case === 'none') {
          return row.getValue('hsnCode');
        }
        return formatText(row.getValue('hsnCode'), {
          case: fieldConfig?.case || 'sentencecase',
          trimWhitespace: fieldConfig?.trimWhitespace || false,
        });
      },
    },
    {
      accessorKey: 'currency',
      header: 'Currency',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('invoice', 'currency');
        if (fieldConfig?.case === 'none') {
          return row.getValue('currency');
        }
        return formatText(row.getValue('currency'), {
          case: fieldConfig?.case || 'sentencecase',
          trimWhitespace: fieldConfig?.trimWhitespace || false,
        });
      },
    },
    {
      accessorKey: 'unit',
      header: 'Unit',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('invoice', 'unit');
        if (fieldConfig?.case === 'none') {
          return row.getValue('unit');
        }
        return formatText(row.getValue('unit'), {
          case: fieldConfig?.case || 'sentencecase',
          trimWhitespace: fieldConfig?.trimWhitespace || false,
        });
      },
    },
    {
      accessorKey: 'quantity',
      header: 'Qty',
      meta: numMeta,
      cell: ({ row }) => (
        <span className="im-inv-num">
          {formatNumber(row.getValue('quantity'), settings?.numberFormat, {
            numberFormat: 'integer',
            precision: 0,
            showSign: false,
          })}
        </span>
      ),
    },
    {
      accessorKey: 'unitPrice',
      header: 'Unit Price',
      meta: numMeta,
      cell: ({ row }) => (
        <span className="im-inv-num">
          {formatCurrency(row.original.unitPrice, row.original.currency)}
        </span>
      ),
    },
    {
      accessorKey: 'lineTotal',
      header: 'Line Total',
      meta: numMeta,
      cell: ({ row }) => (
        <span className="im-inv-num">
          {formatCurrency(row.original.lineTotal, row.original.currency)}
        </span>
      ),
    },
    // FIX: Added a cell renderer to display the BCD number as a percentage
    {
      accessorKey: 'bcd',
      header: 'Duty %',
      meta: numMeta,
      cell: ({ row }) => (
        <span className="im-inv-num">{row.original.bcd}%</span>
      ),
    },
    {
      accessorKey: 'sws',
      header: 'SWS %',
      meta: numMeta,
      cell: ({ row }) => (
        <span className="im-inv-num">{row.original.sws}%</span>
      ),
    },
    {
      accessorKey: 'igst',
      header: 'IGST %',
      meta: numMeta,
      cell: ({ row }) => (
        <span className="im-inv-num">{row.original.igst}%</span>
      ),
    },
    {
      accessorKey: 'invoiceTotal',
      header: 'Invoice Total',
      meta: numMeta,
      cell: ({ row }) => (
        <span className="im-inv-num">
          {formatCurrency(row.original.invoiceTotal, row.original.currency)}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <InvoiceStatusPill status={row.original.status} />,
    },
    {
      accessorKey: 'matchStatus',
      header: 'Match Status',
      cell: ({ row }) => {
        const invoiceTotalDecimals =
          row.original.invoiceTotalDecimals === 0 ? 0 : 2;
        const tolerance = invoiceTotalDecimals === 0 ? 0.5 : 0.01;
        const roundedShipmentTotal =
          Math.round(row.original.shipmentTotal * 10 ** invoiceTotalDecimals) /
          10 ** invoiceTotalDecimals;
        const isMatched =
          Math.abs(roundedShipmentTotal - row.original.invoiceTotal) <
          tolerance;
        const isDraft = row.original.status === 'Draft';
        const difference = roundedShipmentTotal - row.original.invoiceTotal;

        if (!isDraft) {
          return (
            <span className="im-inv-match-muted" style={{ fontSize: 11 }}>
              —
            </span>
          );
        }

        if (isMatched) {
          return (
            <div className="im-inv-match im-inv-match--ok">
              <span className="im-inv-match-dot" />
              <span className="im-inv-match-label">READY TO FINALIZE</span>
            </div>
          );
        }
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="im-inv-match im-inv-match--bad im-inv-match--click">
                <span className="im-inv-match-dot" />
                <span className="im-inv-match-label">MISMATCH</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-xs">
                <div>
                  Shipment Total:{' '}
                  {formatCurrency(
                    row.original.shipmentTotal,
                    row.original.currency
                  )}
                </div>
                <div>
                  Invoice Total:{' '}
                  {formatCurrency(
                    row.original.invoiceTotal,
                    row.original.currency
                  )}
                </div>
                <div
                  className={difference > 0 ? 'text-red-600' : 'text-green-600'}
                >
                  Difference: {difference > 0 ? '+' : ''}
                  {formatCurrency(Math.abs(difference), row.original.currency)}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        );
      },
    },
  ];

  // Filter columns based on visibility settings and sort by order
  const invoiceFields = settings?.modules?.invoice?.fields || {};
  const visibleColumns = allColumns.filter(column => {
    // Always show actions column
    if (column.id === 'actions') {
      return true;
    }

    // Check if the column has an accessorKey and if it's visible in settings
    if (
      'accessorKey' in column &&
      column.accessorKey &&
      typeof column.accessorKey === 'string'
    ) {
      const fieldSettings = invoiceFields[column.accessorKey];
      return fieldSettings?.visible !== false;
    }

    // If no accessorKey, show the column (fallback)
    return true;
  });

  // Sort columns by their order property
  const sortedColumns = visibleColumns.sort((a, b) => {
    // Actions column should always be first
    if (a.id === 'actions') return -1;
    if (b.id === 'actions') return 1;

    // Get order values from settings
    const aOrder =
      'accessorKey' in a && a.accessorKey && typeof a.accessorKey === 'string'
        ? invoiceFields[a.accessorKey]?.order || 999
        : 999;
    const bOrder =
      'accessorKey' in b && b.accessorKey && typeof b.accessorKey === 'string'
        ? invoiceFields[b.accessorKey]?.order || 999
        : 999;

    return aOrder - bOrder;
  });

  return sortedColumns;
};
