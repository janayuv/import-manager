// Industrial Console — BOE list table (server-paged).

import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import * as React from 'react';

import '../supplier/table-industrial.css';
import './table-boe.css';

const BOE_STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'All', label: 'All' },
  { value: 'Awaiting BOE Data', label: 'Awaiting BOE Data' },
  { value: 'Discrepancy Found', label: 'Discrepancy Found' },
  { value: 'Reconciled', label: 'Reconciled' },
  { value: 'Investigation', label: 'Investigation' },
  { value: 'Closed', label: 'Cleared' },
];

export type BoeTableColumnMeta = {
  thClass?: string;
  tdClass?: string;
};

export interface BoeDataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchValue: string;
  onSearchChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (f: string) => void;
  /** Server-side total BOE count (all pages). */
  totalCount: number;
  isLoading?: boolean;
  getRowClassName?: (row: TData) => string;
  renderEmptyState?: () => React.ReactNode;
  serverPage: number;
  serverTotalPages: number;
  onServerPrevPage: () => void;
  onServerNextPage: () => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
}

export function BoeDataTable<TData, TValue>({
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
  serverPage,
  serverTotalPages,
  onServerPrevPage,
  onServerNextPage,
  onClearFilters,
  hasActiveFilters,
}: BoeDataTableProps<TData, TValue>) {
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

  return (
    <div className="im-table-shell">
      <div className="im-table-toolbar">
        <div className="im-table-search-wrap im-table-search-wrap--grow">
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
            placeholder="Search BE no., location, challan, ref ID…"
            value={searchValue}
            onChange={e => onSearchChange(e.target.value)}
            disabled={isLoading}
          />
        </div>

        <div className="im-table-status-filter">
          {BOE_STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              type="button"
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

      {hasActiveFilters && (
        <div className="im-boe-toolbar-row2">
          <button
            type="button"
            className="im-boe-clear-btn"
            onClick={onClearFilters}
          >
            Clear
          </button>
        </div>
      )}

      <div className="im-table-scroll">
        <table className="im-table">
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(header => {
                  const meta = header.column.columnDef.meta as
                    | BoeTableColumnMeta
                    | undefined;
                  const thExtra = meta?.thClass ?? '';
                  return (
                    <th
                      key={header.id}
                      className={[
                        header.column.getCanSort() ? 'im-th sortable' : 'im-th',
                        thExtra,
                      ]
                        .filter(Boolean)
                        .join(' ')}
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
                  );
                })}
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
                  {row.getVisibleCells().map(cell => {
                    const meta = cell.column.columnDef.meta as
                      | BoeTableColumnMeta
                      | undefined;
                    const tdExtra = meta?.tdClass ?? '';
                    return (
                      <td
                        key={cell.id}
                        className={['im-td', tdExtra].filter(Boolean).join(' ')}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    );
                  })}
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
            type="button"
            className="im-page-btn"
            onClick={onServerPrevPage}
            disabled={serverPage <= 1}
            aria-label="Previous page"
          >
            ←
          </button>
          <button
            type="button"
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
