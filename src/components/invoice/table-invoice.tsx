// src/components/invoice/table-invoice.tsx
// Industrial Console — Invoice line table (toolbar + sticky header + status bar).

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

import '../supplier/table-industrial.css';
import './table-invoice.css';

const INVOICE_STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'All', label: 'All' },
  { value: 'Draft', label: 'Draft' },
  { value: 'Finalized', label: 'Finalized' },
  { value: 'Mismatch', label: 'Mismatch' },
];

export type InvoiceTableColumnMeta = {
  thClass?: string;
  tdClass?: string;
};

interface InvoiceDataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchValue: string;
  onSearchChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (f: string) => void;
  isLoading?: boolean;
  renderEmptyState?: () => React.ReactNode;
  /** Summary line, e.g. "Showing N invoice(s)" — must match existing copy for tests. */
  showingSummary: string;
  autoFinalizableCount: number;
  onBulkAutoFinalize: () => void;
}

export function InvoiceDataTable<TData, TValue>({
  columns,
  data,
  searchValue,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  isLoading,
  renderEmptyState,
  showingSummary,
  autoFinalizableCount,
  onBulkAutoFinalize,
}: InvoiceDataTableProps<TData, TValue>) {
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
            placeholder="Search supplier, invoice no., part no., description…"
            value={searchValue}
            onChange={e => onSearchChange(e.target.value)}
            disabled={isLoading}
          />
        </div>

        <div className="im-table-status-filter">
          {INVOICE_STATUS_FILTERS.map(f => (
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

      <div className="im-table-toolbar-row2 im-invoice-toolbar-row2">
        <span className="im-invoice-showing">{showingSummary}</span>
        <div className="im-invoice-autofin">
          {autoFinalizableCount > 0 ? (
            <>
              <span className="im-invoice-autofin-hint">
                {autoFinalizableCount} ready to auto-finalize
              </span>
              <button
                type="button"
                className="im-invoice-autofin-btn"
                onClick={onBulkAutoFinalize}
              >
                Auto-Finalize All
              </button>
            </>
          ) : (
            <span className="im-invoice-autofin-hint im-invoice-autofin-hint--muted">
              No invoices ready for auto-finalize
            </span>
          )}
        </div>
      </div>

      <div className="im-table-scroll">
        <table className="im-table">
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(header => {
                  const meta = header.column.columnDef.meta as
                    | InvoiceTableColumnMeta
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
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                >
                  {row.getVisibleCells().map(cell => {
                    const meta = cell.column.columnDef.meta as
                      | InvoiceTableColumnMeta
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
          Total:&nbsp;<strong>{data.length}</strong>
        </span>
        <span className="im-sb-sep">·</span>
        <span className={selectedCount > 0 ? 'is-accent' : ''}>
          Selected:&nbsp;<strong>{selectedCount}</strong>
        </span>
        <span className="im-sb-sep">·</span>
        <span>
          Loaded:&nbsp;<strong>{table.getRowModel().rows.length}</strong>
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
