// src/components/ui/data-table-pagination.tsx
import type { Table } from '@tanstack/react-table';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

import * as React from 'react';

import { getModuleSettings } from '@/lib/settings';
import { useSettings } from '@/lib/use-settings';

const IM = {
  alt: '#0C0C0B',
  header: '#0D0D0B',
  text: '#EFEDE8',
  muted: '#8C8A82',
  rule: '#1F1E1A',
  accent: '#E8A23A',
  accentBg: 'rgba(232,162,58,0.10)',
  mono: "Consolas, 'Courier New', monospace",
} as const;

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
  storageKey?: string; // Optional key to persist page size
}

const PAGE_SIZES = [10, 20, 30, 40, 50];

export function DataTablePagination<TData>({
  table,
  storageKey = 'table-page-size',
}: DataTablePaginationProps<TData>) {
  const { settings } = useSettings();

  // Effect to load the page size from localStorage or module settings on initial render
  React.useEffect(() => {
    const savedPageSize = localStorage.getItem(storageKey);

    // Try to determine the module from the storage key
    let moduleName: keyof typeof settings.modules = 'shipment'; // default
    if (storageKey?.includes('shipment')) {
      moduleName = 'shipment';
    } else if (storageKey?.includes('invoice')) {
      moduleName = 'invoice';
    } else if (storageKey?.includes('boe')) {
      moduleName = 'boe';
    } else if (storageKey?.includes('supplier')) {
      moduleName = 'supplier';
    } else if (storageKey?.includes('item')) {
      moduleName = 'itemMaster';
    } else if (storageKey?.includes('expense')) {
      moduleName = 'expenses';
    }

    const moduleSettings = getModuleSettings(moduleName);
    const currentPageSize = table.getState().pagination.pageSize;

    // Always use module settings if they differ from current page size
    if (moduleSettings.itemsPerPage !== currentPageSize) {
      table.setPageSize(moduleSettings.itemsPerPage);
    } else if (savedPageSize && Number(savedPageSize) !== currentPageSize) {
      // Use localStorage only if it's different from current
      table.setPageSize(Number(savedPageSize));
    }
  }, [table, storageKey, settings]);

  const pageSize = table.getState().pagination.pageSize;

  // Effect to save the page size to localStorage whenever it changes
  React.useEffect(() => {
    localStorage.setItem(storageKey, pageSize.toString());
  }, [pageSize, storageKey]);

  const pageIndex = table.getState().pagination.pageIndex;
  const pageCount = table.getPageCount();
  const selectedCount = table.getFilteredSelectedRowModel().rows.length;
  const totalCount = table.getFilteredRowModel().rows.length;

  const btnBase: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    background: IM.header,
    border: `1px solid ${IM.rule}`,
    color: IM.muted,
    cursor: 'pointer',
    padding: 0,
  };

  const btnDisabled: React.CSSProperties = {
    ...btnBase,
    opacity: 0.35,
    cursor: 'not-allowed',
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 2px',
        borderTop: `1px solid ${IM.rule}`,
      }}
    >
      {/* Left: selection info */}
      <span
        style={{
          fontFamily: IM.mono,
          fontSize: 10,
          color: IM.muted,
          letterSpacing: '0.04em',
        }}
      >
        {selectedCount > 0 ? (
          <span style={{ color: IM.accent }}>{selectedCount} selected · </span>
        ) : null}
        {totalCount} row{totalCount !== 1 ? 's' : ''}
      </span>

      {/* Right: rows-per-page + nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Rows per page */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontFamily: IM.mono,
              fontSize: 10,
              color: IM.muted,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Rows
          </span>
          <select
            value={pageSize}
            onChange={e => table.setPageSize(Number(e.target.value))}
            style={{
              background: IM.alt,
              border: `1px solid ${IM.rule}`,
              color: IM.text,
              fontFamily: IM.mono,
              fontSize: 11,
              padding: '2px 6px',
              outline: 'none',
              height: 26,
            }}
          >
            {PAGE_SIZES.map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Page indicator */}
        <span
          style={{
            fontFamily: IM.mono,
            fontSize: 10,
            color: IM.muted,
            letterSpacing: '0.04em',
            minWidth: 70,
            textAlign: 'center',
          }}
        >
          Page{' '}
          <span style={{ color: IM.text, fontWeight: 700 }}>
            {pageIndex + 1}
          </span>{' '}
          / {pageCount || 1}
        </span>

        {/* Nav buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            style={!table.getCanPreviousPage() ? btnDisabled : btnBase}
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            title="First page"
          >
            <ChevronsLeft size={13} />
          </button>
          <button
            style={!table.getCanPreviousPage() ? btnDisabled : btnBase}
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            title="Previous page"
          >
            <ChevronLeft size={13} />
          </button>
          <button
            style={!table.getCanNextPage() ? btnDisabled : btnBase}
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            title="Next page"
          >
            <ChevronRight size={13} />
          </button>
          <button
            style={!table.getCanNextPage() ? btnDisabled : btnBase}
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
            title="Last page"
          >
            <ChevronsRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
