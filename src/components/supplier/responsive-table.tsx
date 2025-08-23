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
import { useResponsive } from '@/hooks/useResponsive'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useSettings } from '@/lib/use-settings'
import { DataTablePagination } from './pagination'

interface ResponsiveDataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
}

export function ResponsiveSupplierDataTable<TData, TValue>({ columns, data }: ResponsiveDataTableProps<TData, TValue>) {
  const { settings } = useSettings()
  const { isSmallScreen } = useResponsive()
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = React.useState('')
  const [rowSelection, setRowSelection] = React.useState({})

  // Filter columns based on visibility settings and screen size
  const visibleColumns = columns.filter((column) => {
    if (column.id === 'select') return true // Always show select column

    // Hide less important columns on small screens
    if (isSmallScreen) {
      const hideOnSmall = ['phone', 'bankName', 'branch', 'bankAddress', 'accountNo', 'iban', 'swiftCode']
      if (hideOnSmall.includes(column.id as string)) {
        return false
      }
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
        pageSize: settings.modules.supplier.itemsPerPage,
      },
    },
    state: {
      sorting,
      globalFilter,
      rowSelection,
    },
  })

  // Get responsive table classes based on screen size
  const getTableClasses = () => {
    if (isSmallScreen) {
      return 'table-fluid-compact'
    }
    return 'table-fluid'
  }

  const getContainerClasses = () => {
    return 'w-full overflow-hidden border rounded-md'
  }

  return (
    <div className="w-full space-y-4">
      {/* Search Input */}
      <div className="flex items-center py-2">
        <Input
          placeholder="Search all columns..."
          value={globalFilter ?? ''}
          onChange={(event) => setGlobalFilter(event.target.value)}
          className="input-fluid max-w-sm"
        />
      </div>

      {/* Table Container */}
      <div className={getContainerClasses()}>
        <div className="w-full overflow-x-auto">
          <Table className={getTableClasses()}>
            <TableHeader className="bg-muted/50">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow
                  key={headerGroup.id}
                  className="bg-primary text-primary-foreground"
                >
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead
                        key={header.id}
                        className="text-fluid-sm font-semibold"
                        style={{
                          minWidth:
                            header.id === 'select'
                              ? '40px'
                              : header.id === 'id'
                                ? '80px'
                                : header.id === 'supplierName'
                                  ? '200px'
                                  : header.id === 'shortName'
                                    ? '120px'
                                    : header.id === 'country'
                                      ? '100px'
                                      : header.id === 'email'
                                        ? '180px'
                                        : header.id === 'phone'
                                          ? '120px'
                                          : header.id === 'beneficiaryName'
                                            ? '150px'
                                            : header.id === 'bankName'
                                              ? '150px'
                                              : header.id === 'branch'
                                                ? '120px'
                                                : header.id === 'bankAddress'
                                                  ? '200px'
                                                  : header.id === 'accountNo'
                                                    ? '120px'
                                                    : header.id === 'iban'
                                                      ? '150px'
                                                      : header.id === 'swiftCode'
                                                        ? '100px'
                                                        : header.id === 'isActive'
                                                          ? '80px'
                                                          : header.id === 'actions'
                                                            ? '120px'
                                                            : '100px',
                          maxWidth:
                            header.id === 'supplierName'
                              ? '300px'
                              : header.id === 'email'
                                ? '250px'
                                : header.id === 'bankAddress'
                                  ? '300px'
                                  : '200px',
                        }}
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
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className="text-fluid-sm"
                        style={{
                          minWidth:
                            cell.column.id === 'select'
                              ? '40px'
                              : cell.column.id === 'id'
                                ? '80px'
                                : cell.column.id === 'supplierName'
                                  ? '200px'
                                  : cell.column.id === 'shortName'
                                    ? '120px'
                                    : cell.column.id === 'country'
                                      ? '100px'
                                      : cell.column.id === 'email'
                                        ? '180px'
                                        : cell.column.id === 'phone'
                                          ? '120px'
                                          : cell.column.id === 'beneficiaryName'
                                            ? '150px'
                                            : cell.column.id === 'bankName'
                                              ? '150px'
                                              : cell.column.id === 'branch'
                                                ? '120px'
                                                : cell.column.id === 'bankAddress'
                                                  ? '200px'
                                                  : cell.column.id === 'accountNo'
                                                    ? '120px'
                                                    : cell.column.id === 'iban'
                                                      ? '150px'
                                                      : cell.column.id === 'swiftCode'
                                                        ? '100px'
                                                        : cell.column.id === 'isActive'
                                                          ? '80px'
                                                          : cell.column.id === 'actions'
                                                            ? '120px'
                                                            : '100px',
                          maxWidth:
                            cell.column.id === 'supplierName'
                              ? '300px'
                              : cell.column.id === 'email'
                                ? '250px'
                                : cell.column.id === 'bankAddress'
                                  ? '300px'
                                  : '200px',
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={visibleColumns.length}
                    className="text-fluid-base h-24 text-center"
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
      <DataTablePagination table={table} />
    </div>
  )
}
