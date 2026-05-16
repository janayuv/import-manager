// src/components/boe/columns.tsx (MODIFIED - Industrial Console + derived status)
import { type ColumnDef } from '@tanstack/react-table';
import { Eye, Pencil, Trash2 } from 'lucide-react';

import type { BoeTableColumnMeta } from '@/components/boe/table-boe';
import { formatDateForDisplay } from '@/lib/date-format';
import { formatNumber, formatText, getFieldConfig } from '@/lib/settings';
import type { AppSettings } from '@/lib/settings';
import type { BoeDetails } from '@/types/boe';
import type { SavedBoe } from '@/types/boe-entry';

interface GetBoeColumnsProps {
  onView: (boe: BoeDetails) => void;
  onEdit: (boe: BoeDetails) => void;
  onDelete: (boe: BoeDetails) => void;
  settings?: AppSettings;
  getWorkflowStatus: (boe: BoeDetails) => SavedBoe['status'];
}

const numMeta: BoeTableColumnMeta = {
  thClass: 'im-th--num',
  tdClass: 'im-td--num',
};

function BoeStatusPill({ status }: { status: SavedBoe['status'] }) {
  const map = {
    'Awaiting BOE Data': {
      cls: 'im-boe-pill--filed',
      label: 'AWAITING BOE DATA',
    },
    'Discrepancy Found': {
      cls: 'im-boe-pill--hold',
      label: 'DISCREPANCY FOUND',
    },
    Reconciled: { cls: 'im-boe-pill--assessed', label: 'RECONCILED' },
    Investigation: { cls: 'im-boe-pill--hold', label: 'INVESTIGATION' },
    Closed: { cls: 'im-boe-pill--cleared', label: 'CLEARED' },
  }[status];
  return (
    <span className={`im-boe-pill ${map.cls}`}>
      <span className="im-boe-pill__dot" />
      {map.label}
    </span>
  );
}

function BoeRowActions({
  boe,
  onView,
  onEdit,
  onDelete,
}: {
  boe: BoeDetails;
  onView: (b: BoeDetails) => void;
  onEdit: (b: BoeDetails) => void;
  onDelete: (b: BoeDetails) => void;
}) {
  return (
    <div className="im-row-actions">
      <button
        type="button"
        className="im-row-act-btn"
        title="View"
        onClick={e => {
          e.stopPropagation();
          onView(boe);
        }}
      >
        <Eye size={11} />
      </button>
      <button
        type="button"
        className="im-row-act-btn"
        title="Edit"
        onClick={e => {
          e.stopPropagation();
          onEdit(boe);
        }}
      >
        <Pencil size={11} />
      </button>
      <button
        type="button"
        className="im-row-act-btn im-row-act-btn--danger"
        title="Delete"
        onClick={e => {
          e.stopPropagation();
          onDelete(boe);
        }}
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
}

export const getBoeColumns = ({
  onView,
  onEdit,
  onDelete,
  settings,
  getWorkflowStatus,
}: GetBoeColumnsProps): ColumnDef<BoeDetails>[] => {
  const allColumns: ColumnDef<BoeDetails>[] = [
    {
      accessorKey: 'id',
      header: 'ID',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('boe', 'id');
        const raw =
          fieldConfig?.case === 'none'
            ? (row.getValue('id') as string)
            : formatText(row.getValue('id'), {
                case: fieldConfig?.case || 'sentencecase',
                trimWhitespace: fieldConfig?.trimWhitespace || false,
              });
        return <span className="im-td-id">{raw}</span>;
      },
    },
    {
      accessorKey: 'beNumber',
      header: 'BE No.',
      size: 150,
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('boe', 'beNumber');
        const value =
          fieldConfig?.case === 'none'
            ? (row.getValue('beNumber') as string)
            : formatText(row.getValue('beNumber') as string, {
                case: fieldConfig?.case || 'sentencecase',
                trimWhitespace: fieldConfig?.trimWhitespace || false,
              });
        return (
          <span className="im-td-id block max-w-[18ch] truncate" title={value}>
            {value}
          </span>
        );
      },
    },
    {
      id: 'workflowStatus',
      accessorFn: row => getWorkflowStatus(row),
      header: 'Status',
      cell: ({ row }) => (
        <BoeStatusPill status={getWorkflowStatus(row.original)} />
      ),
      enableSorting: true,
    },
    {
      accessorKey: 'beDate',
      header: 'BE Date',
      cell: ({ row }) => {
        return formatDateForDisplay(row.original.beDate);
      },
    },
    {
      accessorKey: 'location',
      header: 'Location',
      size: 180,
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('boe', 'location');
        const globalCase = settings?.textFormat?.case || 'sentencecase';
        const fieldCase = fieldConfig?.case || 'sentencecase';
        const finalCase = globalCase === 'uppercase' ? 'uppercase' : fieldCase;

        const value = formatText(row.getValue('location'), {
          case: finalCase as
            | 'lowercase'
            | 'uppercase'
            | 'titlecase'
            | 'sentencecase',
          trimWhitespace: fieldConfig?.trimWhitespace || false,
        });
        return (
          <span className="block max-w-[20ch] truncate" title={value}>
            {value}
          </span>
        );
      },
    },
    {
      accessorKey: 'totalAssessmentValue',
      header: 'Total Assessment Value',
      meta: numMeta,
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('boe', 'totalAssessmentValue');
        return (
          <span className="im-boe-num">
            {formatNumber(
              row.getValue('totalAssessmentValue'),
              settings?.numberFormat,
              {
                numberFormat: fieldConfig?.numberFormat || 'currency',
                precision: fieldConfig?.precision,
                showSign: fieldConfig?.showSign || false,
              }
            )}
          </span>
        );
      },
    },
    {
      accessorKey: 'dutyAmount',
      header: 'Duty Amount',
      meta: numMeta,
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('boe', 'dutyAmount');
        return (
          <span className="im-boe-num">
            {formatNumber(row.getValue('dutyAmount'), settings?.numberFormat, {
              numberFormat: fieldConfig?.numberFormat || 'currency',
              precision: fieldConfig?.precision,
              showSign: fieldConfig?.showSign || false,
            })}
          </span>
        );
      },
    },
    {
      accessorKey: 'paymentDate',
      header: 'Payment Date',
      cell: ({ row }) => {
        return formatDateForDisplay(row.original.paymentDate);
      },
    },
    {
      accessorKey: 'dutyPaid',
      header: 'Duty Paid',
      meta: numMeta,
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('boe', 'dutyPaid');
        return (
          <span className="im-boe-num">
            {formatNumber(row.getValue('dutyPaid'), settings?.numberFormat, {
              numberFormat: fieldConfig?.numberFormat || 'currency',
              precision: fieldConfig?.precision,
              showSign: fieldConfig?.showSign || false,
            })}
          </span>
        );
      },
    },
    {
      accessorKey: 'challanNumber',
      header: 'Challan No.',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('boe', 'challanNumber');
        const v =
          fieldConfig?.case === 'none'
            ? (row.getValue('challanNumber') as string)
            : formatText(row.getValue('challanNumber'), {
                case: fieldConfig?.case || 'sentencecase',
                trimWhitespace: fieldConfig?.trimWhitespace || false,
              });
        return (
          <span className="im-td-id" title={v}>
            {v}
          </span>
        );
      },
    },
    {
      accessorKey: 'refId',
      header: 'Ref ID',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('boe', 'refId');
        const v =
          fieldConfig?.case === 'none'
            ? (row.getValue('refId') as string)
            : formatText(row.getValue('refId'), {
                case: fieldConfig?.case || 'sentencecase',
                trimWhitespace: fieldConfig?.trimWhitespace || false,
              });
        return (
          <span className="im-td-id" title={v}>
            {v}
          </span>
        );
      },
    },
    {
      accessorKey: 'transactionId',
      header: 'Transaction ID',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('boe', 'transactionId');
        const v =
          fieldConfig?.case === 'none'
            ? (row.getValue('transactionId') as string)
            : formatText(row.getValue('transactionId'), {
                case: fieldConfig?.case || 'sentencecase',
                trimWhitespace: fieldConfig?.trimWhitespace || false,
              });
        return (
          <span className="im-td-id" title={v}>
            {v}
          </span>
        );
      },
    },
    {
      id: 'actions',
      size: 100,
      meta: { tdClass: 'im-td--actions' },
      cell: ({ row }) => (
        <BoeRowActions
          boe={row.original}
          onView={onView}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ),
    },
  ];

  const boeFields = settings?.modules?.boe?.fields || {};
  const visibleColumns = allColumns.filter(column => {
    if (column.id === 'actions' || column.id === 'boeUiStatus') {
      return true;
    }

    if (
      'accessorKey' in column &&
      column.accessorKey &&
      typeof column.accessorKey === 'string'
    ) {
      const fieldSettings = boeFields[column.accessorKey];
      return fieldSettings?.visible !== false;
    }

    return true;
  });

  const sortedColumns = visibleColumns.sort((a, b) => {
    if (a.id === 'actions') return 1;
    if (b.id === 'actions') return -1;
    if (a.id === 'boeUiStatus' && b.id === 'actions') return -1;
    if (b.id === 'boeUiStatus' && a.id === 'actions') return 1;

    const aOrder =
      'accessorKey' in a && a.accessorKey && typeof a.accessorKey === 'string'
        ? boeFields[a.accessorKey]?.order || 999
        : a.id === 'boeUiStatus'
          ? 850
          : 999;
    const bOrder =
      'accessorKey' in b && b.accessorKey && typeof b.accessorKey === 'string'
        ? boeFields[b.accessorKey]?.order || 999
        : b.id === 'boeUiStatus'
          ? 850
          : 999;

    return aOrder - bOrder;
  });

  return sortedColumns;
};
