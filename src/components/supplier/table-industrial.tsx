// src/components/supplier/table-industrial.tsx
// Industrial Console — Supplier data table shell.
// Toolbar + sticky header + 36px dense rows + alt-row tinting + status bar.

import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import * as React from 'react';

import './table-industrial.css';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** Controlled by parent — triggers the server-side IPC search. */
  searchValue: string;
  onSearchChange: (v: string) => void;
  /** Controlled by parent — client-side status filter applied before data reaches here. */
  statusFilter: 'all' | 'active' | 'inactive';
  onStatusFilterChange: (f: 'all' | 'active' | 'inactive') => void;
  /** Server-side total record count (shown in status bar as "Total"). */
  totalCount: number;
  isLoading?: boolean;
  /** Optional extra CSS class(es) for each data row, keyed by the row's data object. */
  getRowClassName?: (row: TData) => string;
  /** Renders inside the empty-state cell when there are no rows and not loading. */
  renderEmptyState?: () => React.ReactNode;
}

export function SupplierDataTable<TData, TValue>({
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
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [rowSelection, setRowSelection] = React.useState({});

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onRowSelectionChange: setRowSelection,
    initialState: { pagination: { pageSize: 50 } },
    state: { sorting, rowSelection },
  });

  const selectedCount = Object.keys(rowSelection).length;
  const { pageIndex } = table.getState().pagination;
  const pageCount = table.getPageCount();

  return (
    <div className="im-table-shell">
      {/* ── Toolbar ─────────────────────────────────────────────── */}
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
            placeholder="Search by name, email, country…"
            value={searchValue}
            onChange={e => onSearchChange(e.target.value)}
            disabled={isLoading}
          />
        </div>

        <div className="im-table-status-filter">
          {(['all', 'active', 'inactive'] as const).map(f => (
            <button
              key={f}
              className={
                statusFilter === f
                  ? 'im-table-filter-btn is-active'
                  : 'im-table-filter-btn'
              }
              onClick={() => onStatusFilterChange(f)}
            >
              {f === 'all' ? 'All' : f === 'active' ? 'Active' : 'Inactive'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────── */}
      <div className="im-table-scroll">
        <table
          className="im-table"
          aria-rowcount={table.getFilteredRowModel().rows.length}
        >
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
                    aria-sort={
                      header.column.getIsSorted() === 'asc'
                        ? 'ascending'
                        : header.column.getIsSorted() === 'desc'
                          ? 'descending'
                          : header.column.getCanSort()
                            ? 'none'
                            : undefined
                    }
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
                  aria-selected={row.getIsSelected()}
                  aria-rowindex={
                    table.getState().pagination.pageIndex *
                      table.getState().pagination.pageSize +
                    i +
                    1
                  }
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

      {/* ── Status bar ──────────────────────────────────────────── */}
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
          Page {pageIndex + 1} of {pageCount || 1}
          <button
            className="im-page-btn"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Previous page"
          >
            ←
          </button>
          <button
            className="im-page-btn"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Next page"
          >
            →
          </button>
        </span>
      </div>
    </div>
  );
}
