// src/pages/supplier-columns.tsx
// Column definitions for the Industrial Console supplier table.
// Uses CSS classes from table-industrial.css (loaded by table-industrial.tsx).

import { type ColumnDef } from '@tanstack/react-table';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import * as React from 'react';

import type { Supplier } from '@/types/supplier';

// ── Checkbox (bulk select) ────────────────────────────────────────
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

// ── Status pill ───────────────────────────────────────────────────
const StatusPill: React.FC<{ active: boolean }> = ({ active }) => (
  <span
    className={`im-status-pill ${active ? 'im-status-pill--active' : 'im-status-pill--inactive'}`}
  >
    <span className="im-status-pill__dot" />
    {active ? 'ACTIVE' : 'INACTIVE'}
  </span>
);

// ── Name cell (name + shortName subtitle) ─────────────────────────
const NameCell: React.FC<{ name: string; short?: string }> = ({
  name,
  short,
}) => (
  <div>
    <div className="im-td-name-main">{name}</div>
    {short && <div className="im-td-name-short">{short}</div>}
  </div>
);

// ── Row action buttons (appear on hover) ──────────────────────────
const RowActions: React.FC<{
  supplier: Supplier;
  onView: (s: Supplier) => void;
  onEdit: (s: Supplier) => void;
  onDelete: (s: Supplier) => void;
}> = ({ supplier, onView, onEdit, onDelete }) => (
  <div className="im-row-actions">
    <button
      className="im-row-act-btn"
      title="View"
      onClick={e => {
        e.stopPropagation();
        onView(supplier);
      }}
    >
      <Eye size={11} />
    </button>
    <button
      className="im-row-act-btn"
      title="Edit"
      onClick={e => {
        e.stopPropagation();
        onEdit(supplier);
      }}
    >
      <Pencil size={11} />
    </button>
    <button
      className="im-row-act-btn im-row-act-btn--danger"
      title="Delete"
      onClick={e => {
        e.stopPropagation();
        onDelete(supplier);
      }}
    >
      <Trash2 size={11} />
    </button>
  </div>
);

export function createSupplierColumns(
  onView: (supplier: Supplier) => void,
  onEdit: (supplier: Supplier) => void,
  onDelete: (supplier: Supplier) => void
): ColumnDef<Supplier>[] {
  return [
    // ── Select ────────────────────────────────────────────────────
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

    // ── ID ────────────────────────────────────────────────────────
    {
      accessorKey: 'id',
      size: 96,
      header: 'ID',
      cell: ({ getValue }) => (
        <span className="im-td-id">{getValue<string>()}</span>
      ),
      enableGlobalFilter: true,
    },

    // ── Supplier Name ─────────────────────────────────────────────
    {
      accessorKey: 'supplierName',
      size: 228,
      header: 'Supplier Name',
      cell: ({ row }) => (
        <NameCell
          name={row.original.supplierName}
          short={row.original.shortName}
        />
      ),
      enableGlobalFilter: true,
    },

    // ── Country ───────────────────────────────────────────────────
    {
      accessorKey: 'country',
      size: 130,
      header: 'Country',
      cell: ({ getValue }) => getValue<string>() ?? '—',
      enableGlobalFilter: true,
    },

    // ── Email ─────────────────────────────────────────────────────
    {
      accessorKey: 'email',
      size: 210,
      header: 'Email',
      cell: ({ getValue }) => (
        <span
          style={{
            fontFamily: "'Consolas','Courier New',monospace",
            fontSize: 11.5,
          }}
        >
          {getValue<string>() ?? '—'}
        </span>
      ),
      enableGlobalFilter: true,
    },

    // ── Bank Name ─────────────────────────────────────────────────
    {
      accessorKey: 'bankName',
      size: 196,
      header: 'Bank Name',
      cell: ({ getValue }) => getValue<string>() ?? '—',
      enableGlobalFilter: false,
    },

    // ── Status ────────────────────────────────────────────────────
    {
      accessorKey: 'isActive',
      size: 112,
      header: 'Status',
      cell: ({ getValue }) => <StatusPill active={getValue<boolean>()} />,
      enableSorting: true,
      enableGlobalFilter: false,
    },

    // ── Actions ───────────────────────────────────────────────────
    {
      id: 'actions',
      size: 100,
      header: '',
      cell: ({ row }) => (
        <RowActions
          supplier={row.original}
          onView={onView}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ),
      enableSorting: false,
      enableGlobalFilter: false,
    },
  ];
}
