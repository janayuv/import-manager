// src/components/ui/data-table-pagination.tsx
import type { Table } from '@tanstack/react-table'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getModuleSettings } from '@/lib/settings'
import { useSettings } from '@/lib/use-settings'

interface DataTablePaginationProps<TData> {
  table: Table<TData>
  storageKey?: string // Optional key to persist page size
}

export function DataTablePagination<TData>({ table, storageKey = 'table-page-size' }: DataTablePaginationProps<TData>) {
  const { settings } = useSettings()

  // Effect to load the page size from localStorage or module settings on initial render
  React.useEffect(() => {
    const savedPageSize = localStorage.getItem(storageKey)

    // Try to determine the module from the storage key
    let moduleName: keyof typeof settings.modules = 'shipment' // default
    if (storageKey?.includes('shipment')) {
      moduleName = 'shipment'
    } else if (storageKey?.includes('invoice')) {
      moduleName = 'invoice'
    } else if (storageKey?.includes('boe')) {
      moduleName = 'boe'
    } else if (storageKey?.includes('supplier')) {
      moduleName = 'supplier'
    } else if (storageKey?.includes('item')) {
      moduleName = 'itemMaster'
    } else if (storageKey?.includes('expense')) {
      moduleName = 'expenses'
    }

    const moduleSettings = getModuleSettings(moduleName)
    const currentPageSize = table.getState().pagination.pageSize

    // Always use module settings if they differ from current page size
    if (moduleSettings.itemsPerPage !== currentPageSize) {
      console.log(`🔧 Setting page size to ${moduleSettings.itemsPerPage} for ${moduleName} module`)
      table.setPageSize(moduleSettings.itemsPerPage)
    } else if (savedPageSize && Number(savedPageSize) !== currentPageSize) {
      // Use localStorage only if it's different from current
      console.log(`🔧 Using localStorage page size: ${savedPageSize}`)
      table.setPageSize(Number(savedPageSize))
    }
  }, [table, storageKey, settings])

  const pageSize = table.getState().pagination.pageSize

  // Effect to save the page size to localStorage whenever it changes
  React.useEffect(() => {
    localStorage.setItem(storageKey, pageSize.toString())
  }, [pageSize, storageKey])

  return (
    <div className="flex items-center justify-between px-2">
      <div className="text-muted-foreground flex-1 text-sm">
        {table.getFilteredSelectedRowModel().rows.length} of {table.getFilteredRowModel().rows.length} row(s) selected.
      </div>
      <div className="flex items-center space-x-6 lg:space-x-8">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium">Rows per page</p>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value))
            }}
          >
            <SelectTrigger className="h-8 w-[90px]">
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 30, 40, 50].map((pageSize) => (
                <SelectItem
                  key={pageSize}
                  value={`${pageSize}`}
                >
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-[100px] items-center justify-center text-sm font-medium">
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Go to first page</span>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Go to previous page</span>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Go to next page</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Go to last page</span>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
