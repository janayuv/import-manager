// src/pages/item-columns.tsx
// Column definitions for the Industrial Console item master table.
// Uses CSS classes from table-industrial.css + table-item.css.

import { type ColumnDef } from '@tanstack/react-table';
import { Eye, Pencil } from 'lucide-react';
import * as React from 'react';

import type { Item } from '@/types/item';
import type { Option } from '@/types/options';

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

// ── Part number + description two-row cell ────────────────────────────
const PartCell: React.FC<{ partNumber: string; description: string }> = ({
  partNumber,
  description,
}) => (
  <div>
    <div className="im-td-name-main">{partNumber}</div>
    {description && (
      <div className="im-td-name-short" title={description}>
        {description.length > 48 ? description.slice(0, 48) + '…' : description}
      </div>
    )}
  </div>
);

// ── Row actions ────────────────────────────────────────────────────────
const RowActions: React.FC<{
  item: Item;
  onView: (i: Item) => void;
  onEdit: (i: Item) => void;
}> = ({ item, onView, onEdit }) => (
  <div className="im-row-actions">
    <button
      className="im-row-act-btn"
      title="View"
      onClick={e => {
        e.stopPropagation();
        onView(item);
      }}
    >
      <Eye size={11} />
    </button>
    <button
      className="im-row-act-btn"
      title="Edit"
      onClick={e => {
        e.stopPropagation();
        onEdit(item);
      }}
    >
      <Pencil size={11} />
    </button>
  </div>
);

export function createItemColumns(
  suppliers: Option[],
  onView: (item: Item) => void,
  onEdit: (item: Item) => void
): ColumnDef<Item>[] {
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

    // ── Part number + description ──────────────────────────────────
    {
      accessorKey: 'partNumber',
      size: 220,
      header: 'Part / Description',
      cell: ({ row }) => (
        <PartCell
          partNumber={row.original.partNumber}
          description={row.original.itemDescription}
        />
      ),
      enableSorting: true,
      enableGlobalFilter: true,
    },

    // ── HSN / HS code ──────────────────────────────────────────────
    {
      accessorKey: 'hsnCode',
      size: 104,
      header: 'HSN Code',
      cell: ({ getValue }) => {
        const v = getValue<string | undefined>();
        return (
          <span
            style={{
              fontFamily: "'Consolas','Courier New',monospace",
              fontSize: 11.5,
            }}
          >
            {v || '—'}
          </span>
        );
      },
      enableSorting: true,
      enableGlobalFilter: false,
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

    // ── Category ───────────────────────────────────────────────────
    {
      accessorKey: 'category',
      size: 128,
      header: 'Category',
      cell: ({ getValue }) => {
        const v = getValue<string | undefined>();
        if (!v) return <span style={{ color: '#56544E' }}>—</span>;
        return <span className="im-category-tag">{v.toUpperCase()}</span>;
      },
      enableSorting: true,
      enableGlobalFilter: false,
    },

    // ── Unit ───────────────────────────────────────────────────────
    {
      accessorKey: 'unit',
      size: 72,
      header: 'UOM',
      cell: ({ getValue }) => {
        const v = getValue<string | undefined>();
        return (
          <span
            className="im-td--right"
            style={{
              display: 'block',
              fontFamily: "'Consolas','Courier New',monospace",
              fontSize: 11.5,
            }}
          >
            {v || '—'}
          </span>
        );
      },
      enableSorting: true,
      enableGlobalFilter: false,
    },

    // ── Unit price + currency ──────────────────────────────────────
    {
      accessorKey: 'unitPrice',
      size: 120,
      header: 'Unit Price',
      cell: ({ row }) => {
        const price = row.original.unitPrice ?? 0;
        const cur = row.original.currency ?? '';
        return (
          <span
            style={{
              fontFamily: "'Consolas','Courier New',monospace",
              fontSize: 11.5,
            }}
          >
            {cur}&nbsp;{price.toFixed(2)}
          </span>
        );
      },
      enableSorting: true,
      enableGlobalFilter: false,
    },

    // ── Actions ────────────────────────────────────────────────────
    {
      id: 'actions',
      size: 80,
      header: '',
      cell: ({ row }) => (
        <RowActions item={row.original} onView={onView} onEdit={onEdit} />
      ),
      enableSorting: false,
      enableGlobalFilter: false,
    },
  ];
}
