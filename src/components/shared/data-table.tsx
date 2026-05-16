// src/components/shared/data-table.tsx
import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';

import * as React from 'react';

import { DataTablePagination } from './data-table-pagination';

const IM = {
  panel: '#101010',
  alt: '#0C0C0B',
  header: '#0D0D0B',
  text: '#EFEDE8',
  muted: '#8C8A82',
  rule: '#1F1E1A',
  hover: '#161513',
  mono: "Consolas, 'Courier New', monospace",
} as const;

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  storageKey?: string;
  toolbar?: React.ReactNode;
}

const GLOBAL_FILTER_DEBOUNCE_MS = 300;

export function DataTable<TData, TValue>({
  columns,
  data,
  storageKey,
  toolbar,
}: DataTableProps<TData, TValue>) {
  const [searchInput, setSearchInput] = React.useState('');
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setGlobalFilter(searchInput);
    }, GLOBAL_FILTER_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    // Provide more aggressive column sizing to prevent truncation
    defaultColumn: { minSize: 150, size: 200, maxSize: 600 },
    columnResizeMode: 'onChange',
    state: {
      globalFilter,
      columnFilters,
    },
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Search / toolbar row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <input
          placeholder="SEARCH ALL COLUMNS..."
          value={searchInput}
          onChange={event => setSearchInput(event.target.value)}
          style={{
            background: IM.alt,
            border: `1px solid ${IM.rule}`,
            color: IM.text,
            padding: '6px 12px',
            fontSize: 11,
            fontFamily: IM.mono,
            letterSpacing: '0.04em',
            outline: 'none',
            width: 260,
          }}
        />
        {toolbar}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', border: `1px solid ${IM.rule}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} style={{ background: IM.header }}>
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    style={{
                      padding: '8px 12px',
                      textAlign: 'left',
                      fontFamily: IM.mono,
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: IM.muted,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      borderBottom: `1px solid ${IM.rule}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row, i) => (
                <ImRow key={row.id} even={i % 2 === 0}>
                  {row.getVisibleCells().map(cell => (
                    <td
                      key={cell.id}
                      style={{
                        padding: '0 12px',
                        height: 36,
                        fontSize: 12,
                        color: IM.text,
                        fontFamily: IM.mono,
                        borderBottom: `1px solid ${IM.rule}`,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </ImRow>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{
                    padding: 32,
                    textAlign: 'center',
                    color: IM.muted,
                    fontFamily: IM.mono,
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  No results
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <DataTablePagination table={table} storageKey={storageKey} />
    </div>
  );
}

function ImRow({
  children,
  even,
}: {
  children: React.ReactNode;
  even: boolean;
}) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <tr
      style={{
        background: hovered ? '#161513' : even ? '#101010' : '#0C0C0B',
        transition: 'background 80ms',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </tr>
  );
}
