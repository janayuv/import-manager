import React from 'react'
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useResponsiveContext } from '@/providers/ResponsiveProvider'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useSettings } from '@/lib/use-settings'

interface ResponsiveDataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  searchPlaceholder?: string
  showSearch?: boolean
  showPagination?: boolean
  pageSize?: number
  className?: string
  hideColumnsOnSmall?: string[]
  columnWidths?: Record<string, { minWidth: string; maxWidth?: string }>
  // Status filter props
  statusFilter?: React.ReactNode
  statusActions?: React.ReactNode
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
}: ResponsiveDataTableProps<TData, TValue>) {
  const { settings } = useSettings()
  const { isSmallScreen, getTableClass, getInputClass, getTextClass } = useResponsiveContext()

  const [sorting, setSorting] = React.useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = React.useState('')
  const [rowSelection, setRowSelection] = React.useState({})

  // Filter columns based on visibility settings and screen size
  const visibleColumns = columns.filter((column) => {
    if (column.id === 'select') return true // Always show select column

    // Hide specified columns on small screens
    if (isSmallScreen && hideColumnsOnSmall.includes(column.id as string)) {
      return false
    }

    const isVisible = (column.meta as { visible?: boolean })?.visible !== false
    return isVisible
  })

  const table = useReactTable({
    data,
    columns: visibleColumns,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onRowSelectionChange: setRowSelection,
    initialState: {
      pagination: {
        pageSize: pageSize || settings.modules?.supplier?.itemsPerPage || 10,
      },
    },
    state: {
      sorting,
      globalFilter,
      rowSelection,
    },
  })

  // Get column width styles
  const getColumnStyle = (columnId: string) => {
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
    }

    const width = columnWidths[columnId] ||
      defaultWidths[columnId as keyof typeof defaultWidths] || { minWidth: '100px' }

    return {
      minWidth: width.minWidth,
      maxWidth: width.maxWidth,
    }
  }

  return (
    <div className={`w-full space-y-4 ${className}`}>
      {/* Search Input and Status Controls */}
      {(showSearch || statusFilter || statusActions) && (
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-4">
            {showSearch && (
              <Input
                placeholder={searchPlaceholder}
                value={globalFilter ?? ''}
                onChange={(event) => setGlobalFilter(event.target.value)}
                className={`max-w-sm ${getInputClass()}`}
              />
            )}
            {statusFilter}
          </div>
          {statusActions && <div className="flex items-center gap-2">{statusActions}</div>}
        </div>
      )}

      {/* Table Container */}
      <div className="w-full overflow-hidden rounded-md border">
        <div className="w-full overflow-x-auto">
          <Table className={getTableClass()}>
            <TableHeader className="bg-primary text-primary-foreground">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const columnStyle = getColumnStyle(header.id)
                    return (
                      <TableHead
                        key={header.id}
                        className={`${getTextClass('sm')} text-primary-foreground overflow-hidden font-semibold whitespace-nowrap`}
                        style={columnStyle}
                      >
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const columnStyle = getColumnStyle(cell.column.id)
                      return (
                        <TableCell
                          key={cell.id}
                          className={getTextClass('sm')}
                          style={columnStyle}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={visibleColumns.length}
                    className={`h-24 text-center ${getTextClass()}`}
                  >
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {showPagination && (
        <div className="flex items-center justify-between space-x-2 py-4">
          <div className="text-muted-foreground flex-1 text-sm">
            {table.getFilteredSelectedRowModel().rows.length} of {table.getFilteredRowModel().rows.length} row(s)
            selected.
          </div>
          <div className="space-x-2">
            <button
              className="h-8 w-8 p-0 lg:h-9 lg:w-9"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">Go to previous page</span>
              <svg
                className="h-4 w-4"
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
              className="h-8 w-8 p-0 lg:h-9 lg:w-9"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">Go to next page</span>
              <svg
                className="h-4 w-4"
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
      )}
    </div>
  )
}
