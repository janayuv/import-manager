// src/components/shipment/table-shipment.tsx
// Industrial Console — Shipment data table with two-row toolbar.

import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import * as React from 'react';

import type { Option } from '@/types/options';
import '../supplier/table-industrial.css';
import './table-shipment.css';

const SHIPMENT_STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'All', label: 'All' },
  { value: 'docs-rcvd', label: 'Docs Rcvd' },
  { value: 'in-transit', label: 'In Transit' },
  { value: 'customs-clearance', label: 'Customs' },
  { value: 'ready-dly', label: 'Ready' },
  { value: 'delivered', label: 'Delivered' },
];

interface ShipmentDataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchValue: string;
  onSearchChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (f: string) => void;
  totalCount: number;
  isLoading?: boolean;
  getRowClassName?: (row: TData) => string;
  renderEmptyState?: () => React.ReactNode;
  supplierOptions: Option[];
  supplierFilterId: string;
  onSupplierFilterChange: (v: string) => void;
  dateFrom: string;
  onDateFromChange: (v: string) => void;
  dateTo: string;
  onDateToChange: (v: string) => void;
  urlOverdue: boolean;
  onOverdueToggle: () => void;
  urlBoeMissing: boolean;
  onBoeMissingToggle: () => void;
  urlExpenseMissing: boolean;
  onExpenseMissingToggle: () => void;
  onClearFilters: () => void;
  overdueCount?: number;
  boeMissingCount?: number;
  expenseMissingCount?: number;
  serverPage: number;
  serverTotalPages: number;
  onServerPrevPage: () => void;
  onServerNextPage: () => void;
}

export function ShipmentDataTable<TData, TValue>({
  columns,
  data,
  searchValue,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  totalCount,
  isLoading,
  getRowClassName,
  renderEmptyState,
  supplierOptions,
  supplierFilterId,
  onSupplierFilterChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  urlOverdue,
  onOverdueToggle,
  urlBoeMissing,
  onBoeMissingToggle,
  urlExpenseMissing,
  onExpenseMissingToggle,
  onClearFilters,
  overdueCount,
  boeMissingCount,
  expenseMissingCount,
  serverPage,
  serverTotalPages,
  onServerPrevPage,
  onServerNextPage,
}: ShipmentDataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [rowSelection, setRowSelection] = React.useState({});

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onRowSelectionChange: setRowSelection,
    state: { sorting, rowSelection },
  });

  const selectedCount = Object.keys(rowSelection).length;
  const hasActiveException = urlOverdue || urlBoeMissing || urlExpenseMissing;

  return (
    <div className="im-table-shell">
      {/* ── Toolbar row 1: search + status filter ─────────────────── */}
      <div className="im-table-toolbar">
        <div className="im-table-search-wrap">
          <svg
            className="im-table-search-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            className="im-table-search"
            placeholder="Search by invoice, BL/AWB, vessel…"
            value={searchValue}
            onChange={e => onSearchChange(e.target.value)}
            disabled={isLoading}
          />
        </div>

        <div className="im-table-status-filter">
          {SHIPMENT_STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              className={
                statusFilter === f.value
                  ? 'im-table-filter-btn is-active'
                  : 'im-table-filter-btn'
              }
              onClick={() => onStatusFilterChange(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Toolbar row 2: supplier + dates + exception toggles ───── */}
      <div className="im-table-toolbar-row2">
        <select
          className="im-toolbar-select"
          value={supplierFilterId || ''}
          onChange={e => onSupplierFilterChange(e.target.value)}
          disabled={isLoading}
        >
          <option value="">All suppliers</option>
          {supplierOptions.map(s => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <div className="im-toolbar-date-wrap">
          <span className="im-toolbar-date-label">From</span>
          <input
            type="date"
            className="im-toolbar-date"
            value={dateFrom}
            onChange={e => onDateFromChange(e.target.value)}
            disabled={isLoading}
          />
        </div>

        <div className="im-toolbar-date-wrap">
          <span className="im-toolbar-date-label">To</span>
          <input
            type="date"
            className="im-toolbar-date"
            value={dateTo}
            onChange={e => onDateToChange(e.target.value)}
            disabled={isLoading}
          />
        </div>

        <div className="im-exception-btns">
          <button
            className={
              urlOverdue
                ? 'im-exception-btn im-exception-btn--overdue is-active'
                : 'im-exception-btn im-exception-btn--overdue'
            }
            onClick={onOverdueToggle}
            title={`${overdueCount ?? 0} overdue`}
          >
            Overdue{overdueCount ? ` (${overdueCount})` : ''}
          </button>
          <button
            className={
              urlBoeMissing ? 'im-exception-btn is-active' : 'im-exception-btn'
            }
            onClick={onBoeMissingToggle}
            title={`${boeMissingCount ?? 0} missing BOE`}
          >
            No BOE{boeMissingCount ? ` (${boeMissingCount})` : ''}
          </button>
          <button
            className={
              urlExpenseMissing
                ? 'im-exception-btn is-active'
                : 'im-exception-btn'
            }
            onClick={onExpenseMissingToggle}
            title={`${expenseMissingCount ?? 0} missing expenses`}
          >
            No Exp{expenseMissingCount ? ` (${expenseMissingCount})` : ''}
          </button>
          {(hasActiveException ||
            supplierFilterId ||
            dateFrom ||
            dateTo ||
            statusFilter !== 'All') && (
            <button className="im-clear-btn" onClick={onClearFilters}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Table ────────────────────────────────────────────────────── */}
      <div className="im-table-scroll">
        <table className="im-table">
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(header => (
                  <th
                    key={header.id}
                    className={
                      header.column.getCanSort() ? 'im-th sortable' : 'im-th'
                    }
                    onClick={header.column.getToggleSortingHandler()}
                    style={{ width: header.getSize() }}
                  >
                    {header.isPlaceholder ? null : (
                      <div className="im-th-inner">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {header.column.getCanSort() && (
                          <em
                            className={
                              header.column.getIsSorted()
                                ? 'im-sort-icon sorted'
                                : 'im-sort-icon'
                            }
                          >
                            {header.column.getIsSorted() === 'asc'
                              ? '↑'
                              : header.column.getIsSorted() === 'desc'
                                ? '↓'
                                : '↕'}
                          </em>
                        )}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody>
            {isLoading ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="im-td-empty"
                  style={{ color: '#56544E', fontFamily: 'monospace' }}
                >
                  Loading…
                </td>
              </tr>
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row, i) => (
                <tr
                  key={row.id}
                  className={[
                    'im-tr',
                    row.getIsSelected() ? 'is-selected' : '',
                    i % 2 !== 0 ? 'is-alt' : '',
                    getRowClassName ? getRowClassName(row.original) : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                >
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="im-td">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="im-td-empty">
                  {renderEmptyState ? (
                    renderEmptyState()
                  ) : (
                    <span style={{ padding: '24px 0', display: 'block' }}>
                      No results found.
                    </span>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Status bar ────────────────────────────────────────────────── */}
      <div className="im-table-statusbar">
        <span>
          Total:&nbsp;<strong>{totalCount}</strong>
        </span>
        <span className="im-sb-sep">·</span>
        <span className={selectedCount > 0 ? 'is-accent' : ''}>
          Selected:&nbsp;<strong>{selectedCount}</strong>
        </span>
        <span className="im-sb-sep">·</span>
        <span>
          Loaded:&nbsp;<strong>{data.length}</strong>
        </span>

        <span className="im-sb-right">
          <span className="im-sb-pipe">|</span>
          Page {serverPage} of {serverTotalPages || 1}
          <button
            className="im-page-btn"
            onClick={onServerPrevPage}
            disabled={serverPage <= 1}
            aria-label="Previous page"
          >
            ←
          </button>
          <button
            className="im-page-btn"
            onClick={onServerNextPage}
            disabled={serverPage >= serverTotalPages}
            aria-label="Next page"
          >
            →
          </button>
        </span>
      </div>
    </div>
  );
}
