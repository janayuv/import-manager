import React from 'react';
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useResponsiveContext } from '@/providers/ResponsiveProvider';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useSettings } from '@/lib/use-settings';

interface ResponsiveDataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchPlaceholder?: string;
  showSearch?: boolean;
  showPagination?: boolean;
  pageSize?: number;
  className?: string;
  hideColumnsOnSmall?: string[];
  columnWidths?: Record<string, { minWidth: string; maxWidth?: string }>;
  // Status filter props
  statusFilter?: React.ReactNode;
  statusActions?: React.ReactNode;
  moduleName?: string;
}

export function ResponsiveDataTable<TData, TValue>({
  columns,
  data,
  searchPlaceholder = 'Search all columns...',
  showSearch = true,
  showPagination = true,
  pageSize,
  className = '',
  hideColumnsOnSmall = [],
  columnWidths = {},
  statusFilter,
  statusActions,
  moduleName,
}: ResponsiveDataTableProps<TData, TValue>) {
  const { settings } = useSettings();
  const { isSmallScreen, getTableClass, getInputClass, getTextClass } =
    useResponsiveContext();

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');

  // Filter columns based on module settings and screen size
  const visibleColumns = columns.filter(column => {
    // Check module settings visibility first
    if ((column.meta as { visible?: boolean })?.visible === false) {
      return false;
    }

    // Hide specified columns on small screens
    if (isSmallScreen && hideColumnsOnSmall.includes(column.id as string)) {
      return false;
    }

    return true;
  });

  const table = useReactTable({
    data,
    columns: visibleColumns,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: {
      pagination: {
        pageSize: pageSize || settings.modules?.supplier?.itemsPerPage || 10,
      },
    },
    state: {
      sorting,
      globalFilter,
    },
  });

  // Get column width styles - respect module settings first, then fall back to responsive defaults
  const getColumnStyle = (columnId: string) => {
    // Try to get width from module settings first
    let moduleWidth: string | undefined;
    if (
      moduleName &&
      settings?.modules?.[moduleName as keyof typeof settings.modules]
        ?.fields?.[columnId]?.width
    ) {
      moduleWidth =
        settings.modules[moduleName as keyof typeof settings.modules].fields[
          columnId
        ].width;
    }

    // If module width is set, use it as minWidth
    if (moduleWidth) {
      return {
        minWidth: moduleWidth,
        maxWidth: columnWidths[columnId]?.maxWidth || moduleWidth,
      };
    }

    // Fall back to responsive column widths
    const defaultWidths = {
      select: { minWidth: '40px', maxWidth: '40px' },
      id: { minWidth: '80px', maxWidth: '100px' },
      actions: { minWidth: '120px', maxWidth: '150px' },
      status: { minWidth: '80px', maxWidth: '100px' },
      date: { minWidth: '100px', maxWidth: '120px' },
      amount: { minWidth: '100px', maxWidth: '120px' },
      quantity: { minWidth: '80px', maxWidth: '100px' },
      price: { minWidth: '100px', maxWidth: '120px' },
      total: { minWidth: '120px', maxWidth: '150px' },
      supplierName: { minWidth: '200px', maxWidth: '300px' },
      supplierId: { minWidth: '100px', maxWidth: '120px' },
      shipmentId: { minWidth: '120px', maxWidth: '150px' },
      invoiceId: { minWidth: '120px', maxWidth: '150px' },
      itemName: { minWidth: '150px', maxWidth: '250px' },
      itemCode: { minWidth: '100px', maxWidth: '120px' },
      category: { minWidth: '100px', maxWidth: '120px' },
      country: { minWidth: '100px', maxWidth: '120px' },
      email: { minWidth: '180px', maxWidth: '250px' },
      phone: { minWidth: '120px', maxWidth: '150px' },
      address: { minWidth: '200px', maxWidth: '300px' },
      description: { minWidth: '150px', maxWidth: '250px' },
      notes: { minWidth: '150px', maxWidth: '250px' },
    };

    const width = columnWidths[columnId] ||
      defaultWidths[columnId as keyof typeof defaultWidths] || {
        minWidth: '100px',
      };

    return {
      minWidth: width.minWidth,
      maxWidth: width.maxWidth,
    };
  };

  return (
    <div className={`w-full space-y-6 ${className}`}>
      {/* Enhanced Search and Controls Section */}
      {(showSearch || statusFilter || statusActions) && (
        <div className="bg-muted/50 rounded-lg border p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              {showSearch && (
                <div className="relative">
                  <Input
                    placeholder={searchPlaceholder}
                    value={globalFilter ?? ''}
                    onChange={event => setGlobalFilter(event.target.value)}
                    className={`h-10 w-full pl-10 sm:w-80 ${getInputClass()}`}
                  />
                  <div className="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2 transform">
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>
                </div>
              )}
              {statusFilter}
            </div>
            {statusActions && (
              <div className="flex items-center gap-2">{statusActions}</div>
            )}
          </div>
        </div>
      )}

      {/* Professional Table Container */}
      <div className="bg-card w-full overflow-hidden rounded-lg border shadow-sm">
        <div className="w-full overflow-x-auto">
          <Table className={getTableClass()}>
            <TableHeader className="bg-accent border-b">
              {table.getHeaderGroups().map(headerGroup => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map(header => {
                    const columnStyle = getColumnStyle(header.id);
                    return (
                      <TableHead
                        key={header.id}
                        className={`${getTextClass('sm')} text-accent-foreground overflow-hidden px-4 py-4 font-semibold whitespace-nowrap`}
                        style={columnStyle}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row, index) => (
                  <TableRow
                    key={row.id}
                    className={`hover:bg-muted/50 transition-colors ${
                      index % 2 === 0 ? 'bg-card' : 'bg-muted/20'
                    }`}
                  >
                    {row.getVisibleCells().map(cell => {
                      const columnStyle = getColumnStyle(cell.column.id);
                      return (
                        <TableCell
                          key={cell.id}
                          className={`${getTextClass('sm')} border-b px-4 py-4`}
                          style={columnStyle}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={visibleColumns.length}
                    className={`h-32 text-center ${getTextClass()} text-muted-foreground`}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full">
                        <svg
                          className="text-muted-foreground h-6 w-6"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                          />
                        </svg>
                      </div>
                      <p className="font-medium">No suppliers found</p>
                      <p className="text-sm">
                        Try adjusting your search criteria
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Enhanced Pagination */}
      {showPagination && (
        <div className="bg-muted/50 rounded-lg border p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-muted-foreground text-sm">
              <span className="font-medium">
                {table.getFilteredRowModel().rows.length}
              </span>{' '}
              suppliers total
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground mr-2 text-sm">
                Page {table.getState().pagination.pageIndex + 1} of{' '}
                {table.getPageCount()}
              </span>
              <button
                className="bg-background hover:bg-muted h-9 w-9 rounded-md border p-0 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Go to previous page</span>
                <svg
                  className="text-foreground h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <button
                className="bg-background hover:bg-muted h-9 w-9 rounded-md border p-0 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Go to next page</span>
                <svg
                  className="text-foreground h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
