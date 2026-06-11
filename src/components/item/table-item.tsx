// src/components/item/table-item.tsx
// Industrial Console — Item Master data table.

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
import './table-item.css';

interface ItemDataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchValue: string;
  onSearchChange: (v: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (v: string) => void;
  supplierFilter: string;
  onSupplierFilterChange: (v: string) => void;
  categoryOptions: Option[];
  supplierOptions: Option[];
  totalCount: number;
  isLoading?: boolean;
  onClearFilters: () => void;
  serverPage: number;
  serverTotalPages: number;
  onServerPrevPage: () => void;
  onServerNextPage: () => void;
}

export function ItemDataTable<TData, TValue>({
  columns,
  data,
  searchValue,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  supplierFilter,
  onSupplierFilterChange,
  categoryOptions,
  supplierOptions,
  totalCount,
  isLoading,
  onClearFilters,
  serverPage,
  serverTotalPages,
  onServerPrevPage,
  onServerNextPage,
}: ItemDataTableProps<TData, TValue>) {
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
  const hasActiveFilter = searchValue || categoryFilter || supplierFilter;

  return (
    <div className="im-table-shell">
      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="im-item-toolbar">
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
            placeholder="Search by part number or description…"
            value={searchValue}
            onChange={e => onSearchChange(e.target.value)}
            disabled={isLoading}
          />
        </div>

        <select
          className="im-item-select"
          value={categoryFilter}
          onChange={e => onCategoryFilterChange(e.target.value)}
          disabled={isLoading}
        >
          <option value="">All categories</option>
          {categoryOptions.map(c => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>

        <select
          className="im-item-select"
          value={supplierFilter}
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

        {hasActiveFilter && (
          <button className="im-clear-btn" onClick={onClearFilters}>
            Clear
          </button>
        )}
      </div>

      {/* ── Table ────────────────────────────────────────────────── */}
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
                  <span style={{ padding: '24px 0', display: 'block' }}>
                    No items found.
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Status bar ───────────────────────────────────────────── */}
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
