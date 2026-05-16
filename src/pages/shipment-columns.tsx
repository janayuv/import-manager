// src/pages/shipment-columns.tsx
// Column definitions for the Industrial Console shipment table.
// Uses CSS classes from table-industrial.css + table-shipment.css.

import { type ColumnDef } from '@tanstack/react-table';
import { CheckCircle, Eye, Pencil } from 'lucide-react';
import * as React from 'react';

import { formatDateForDisplay } from '@/lib/date-format';
import type { Option } from '@/types/options';
import type { Shipment } from '@/types/shipment';

// ── Checkbox ──────────────────────────────────────────────────────────
const CheckboxCell: React.FC<{
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
}> = ({ checked, indeterminate, onChange }) => {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate ?? false;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="im-checkbox"
      checked={checked}
      onChange={onChange}
    />
  );
};

// ── Status pill ───────────────────────────────────────────────────────
function getStatusPillClass(status: string | undefined): string {
  switch (status) {
    case 'delivered':
      return 'im-status-pill im-status-pill--active';
    case 'in-transit':
      return 'im-status-pill im-status-pill--in-transit';
    case 'customs-clearance':
      return 'im-status-pill im-status-pill--customs';
    case 'ready-dly':
      return 'im-status-pill im-status-pill--ready';
    case 'docs-rcvd':
    case 'docu-received':
      return 'im-status-pill im-status-pill--docs';
    default:
      return 'im-status-pill im-status-pill--inactive';
  }
}

function getStatusLabel(status: string | undefined): string {
  switch (status) {
    case 'delivered':
      return 'DELIVERED';
    case 'in-transit':
      return 'IN TRANSIT';
    case 'customs-clearance':
      return 'CUSTOMS';
    case 'ready-dly':
      return 'READY';
    case 'docs-rcvd':
    case 'docu-received':
      return 'DOCS RCVD';
    default:
      return status?.toUpperCase().replace(/-/g, ' ') ?? '—';
  }
}

const StatusPill: React.FC<{ status: string | undefined }> = ({ status }) => (
  <span className={getStatusPillClass(status)}>
    <span className="im-status-pill__dot" />
    {getStatusLabel(status)}
  </span>
);

// ── Invoice + BL/AWB name cell ─────────────────────────────────────────
const InvoiceCell: React.FC<{ invoice: string; blAwb?: string }> = ({
  invoice,
  blAwb,
}) => (
  <div>
    <div className="im-td-name-main">{invoice}</div>
    {blAwb && <div className="im-td-name-short">{blAwb}</div>}
  </div>
);

// ── Row actions ────────────────────────────────────────────────────────
const RowActions: React.FC<{
  shipment: Shipment;
  onView: (s: Shipment) => void;
  onEdit: (s: Shipment) => void;
  onMarkDelivered?: (s: Shipment) => void;
}> = ({ shipment, onView, onEdit, onMarkDelivered }) => (
  <div className="im-row-actions">
    <button
      className="im-row-act-btn"
      title="View"
      onClick={e => {
        e.stopPropagation();
        onView(shipment);
      }}
    >
      <Eye size={11} />
    </button>
    <button
      className="im-row-act-btn"
      title="Edit"
      onClick={e => {
        e.stopPropagation();
        onEdit(shipment);
      }}
    >
      <Pencil size={11} />
    </button>
    {onMarkDelivered && shipment.status !== 'delivered' && (
      <button
        className="im-row-act-btn"
        title="Mark Delivered"
        onClick={e => {
          e.stopPropagation();
          onMarkDelivered(shipment);
        }}
      >
        <CheckCircle size={11} />
      </button>
    )}
  </div>
);

export function createShipmentColumns(
  suppliers: Option[],
  onView: (shipment: Shipment) => void,
  onEdit: (shipment: Shipment) => void,
  onMarkDelivered?: (shipment: Shipment) => void
): ColumnDef<Shipment>[] {
  return [
    // ── Select ─────────────────────────────────────────────────────
    {
      id: 'select',
      size: 44,
      header: ({ table }) => (
        <CheckboxCell
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onChange={() => table.toggleAllPageRowsSelected()}
        />
      ),
      cell: ({ row }) => (
        <CheckboxCell
          checked={row.getIsSelected()}
          onChange={() => row.toggleSelected()}
        />
      ),
      enableSorting: false,
      enableGlobalFilter: false,
    },

    // ── ID ─────────────────────────────────────────────────────────
    {
      accessorKey: 'id',
      size: 80,
      header: 'ID',
      cell: ({ getValue }) => (
        <span className="im-td-id">{getValue<string>()}</span>
      ),
      enableSorting: true,
      enableGlobalFilter: true,
    },

    // ── Invoice + BL/AWB ───────────────────────────────────────────
    {
      accessorKey: 'invoiceNumber',
      size: 200,
      header: 'Invoice / BL',
      cell: ({ row }) => (
        <InvoiceCell
          invoice={row.original.invoiceNumber}
          blAwb={row.original.blAwbNumber}
        />
      ),
      enableSorting: true,
      enableGlobalFilter: true,
    },

    // ── Supplier ───────────────────────────────────────────────────
    {
      accessorKey: 'supplierId',
      size: 160,
      header: 'Supplier',
      cell: ({ getValue }) => {
        const sup = suppliers.find(s => s.value === getValue<string>());
        return (
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'block',
            }}
            title={sup?.label}
          >
            {sup?.label ?? '—'}
          </span>
        );
      },
      enableSorting: false,
      enableGlobalFilter: false,
    },

    // ── Invoice Date ───────────────────────────────────────────────
    {
      accessorKey: 'invoiceDate',
      size: 96,
      header: 'Inv Date',
      cell: ({ getValue }) => (
        <span
          style={{
            fontFamily: "'Consolas','Courier New',monospace",
            fontSize: 11.5,
          }}
        >
          {formatDateForDisplay(getValue<string>())}
        </span>
      ),
      enableSorting: true,
      enableGlobalFilter: false,
    },

    // ── ETA ────────────────────────────────────────────────────────
    {
      accessorKey: 'eta',
      size: 96,
      header: 'ETA',
      cell: ({ getValue }) => {
        const v = getValue<string | undefined>();
        return (
          <span
            style={{
              fontFamily: "'Consolas','Courier New',monospace",
              fontSize: 11.5,
            }}
          >
            {v ? formatDateForDisplay(v) : '—'}
          </span>
        );
      },
      enableSorting: true,
      enableGlobalFilter: false,
    },

    // ── Status ─────────────────────────────────────────────────────
    {
      accessorKey: 'status',
      size: 140,
      header: 'Status',
      cell: ({ getValue }) => (
        <StatusPill status={getValue<string | undefined>()} />
      ),
      enableSorting: true,
      enableGlobalFilter: false,
    },

    // ── Value + Currency ───────────────────────────────────────────
    {
      accessorKey: 'invoiceValue',
      size: 128,
      header: 'Value',
      cell: ({ row }) => {
        const val = row.original.invoiceValue ?? 0;
        const cur = row.original.invoiceCurrency ?? '';
        return (
          <span
            style={{
              fontFamily: "'Consolas','Courier New',monospace",
              fontSize: 11.5,
            }}
          >
            {cur}&nbsp;{val.toFixed(2)}
          </span>
        );
      },
      enableSorting: true,
      enableGlobalFilter: false,
    },

    // ── Actions ────────────────────────────────────────────────────
    {
      id: 'actions',
      size: 104,
      header: '',
      cell: ({ row }) => (
        <RowActions
          shipment={row.original}
          onView={onView}
          onEdit={onEdit}
          onMarkDelivered={onMarkDelivered}
        />
      ),
      enableSorting: false,
      enableGlobalFilter: false,
    },
  ];
}
