// src/components/shipment/columns.tsx (MODIFIED)
// Using the new date formatter for display in the table and adding a custom sorting function.
import type { ColumnDef, Row } from '@tanstack/react-table'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { formatDateForDisplay } from '@/lib/date-format'
import { formatNumber, formatText, getFieldConfig } from '@/lib/settings'
import type { AppSettings } from '@/lib/settings'
import type { Option } from '@/types/options'
import type { Shipment } from '@/types/shipment'

import { ShipmentActions } from './actions'
import { SortIndicator } from './sort-indicator'

// Custom sorting function for "dd-mm-yyyy" dates
const dateSort = (rowA: Row<Shipment>, rowB: Row<Shipment>, columnId: string) => {
  const dateA = (rowA.getValue(columnId) as string).split('-').reverse().join('-')
  const dateB = (rowB.getValue(columnId) as string).split('-').reverse().join('-')
  return dateA.localeCompare(dateB)
}

export const getShipmentColumns = (
  suppliers: Option[],
  onView: (shipment: Shipment) => void,
  onEdit: (shipment: Shipment) => void,
  onMarkAsDelivered?: (shipment: Shipment) => void,
  settings?: AppSettings
): ColumnDef<Shipment>[] => {
  // Get all possible columns
  const allColumns: ColumnDef<Shipment>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          className="custom-checkbox"
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          className="custom-checkbox"
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'supplierId',
      header: 'Supplier',
      cell: ({ row }) => {
        const supplierId = row.getValue('supplierId') as string
        const supplier = suppliers.find((s) => s.value === supplierId)
        return supplier ? supplier.label : 'Unknown'
      },
    },
    {
      accessorKey: 'invoiceNumber',
      header: ({ column }) => (
        <Button
          variant="ghost"
          className="text-primary-foreground hover:bg-primary/10 h-auto p-1 text-xs font-medium whitespace-nowrap"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Invoice No
          <SortIndicator column={column} />
        </Button>
      ),
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('shipment', 'invoiceNumber')
        if (fieldConfig?.case === 'none') {
          return row.getValue('invoiceNumber')
        }
        return formatText(row.getValue('invoiceNumber'), {
          case: fieldConfig?.case || 'sentencecase',
          trimWhitespace: fieldConfig?.trimWhitespace || false,
        })
      },
    },
    {
      accessorKey: 'invoiceDate',
      header: ({ column }) => (
        <Button
          variant="ghost"
          className="text-primary-foreground hover:bg-primary/10 h-auto p-1 text-xs font-medium whitespace-nowrap"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Date
          <SortIndicator column={column} />
        </Button>
      ),
      cell: ({ row }) => formatDateForDisplay(row.getValue('invoiceDate')),
      sortingFn: dateSort,
    },
    {
      accessorKey: 'goodsCategory',
      header: 'Goods Category',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('shipment', 'goodsCategory')
        if (fieldConfig?.case === 'none') {
          return row.getValue('goodsCategory')
        }
        return formatText(row.getValue('goodsCategory'), {
          case: fieldConfig?.case || 'sentencecase',
          trimWhitespace: fieldConfig?.trimWhitespace || false,
        })
      },
    },
    {
      accessorKey: 'invoiceCurrency',
      header: 'Currency',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('shipment', 'invoiceCurrency')
        if (fieldConfig?.case === 'none') {
          return row.getValue('invoiceCurrency')
        }
        return formatText(row.getValue('invoiceCurrency'), {
          case: fieldConfig?.case || 'sentencecase',
          trimWhitespace: fieldConfig?.trimWhitespace || false,
        })
      },
    },
    {
      accessorKey: 'invoiceValue',
      header: 'Invoice Value',
      cell: ({ row }) =>
        formatNumber(row.getValue('invoiceValue'), settings?.numberFormat, {
          numberFormat: 'currency',
          precision: 2,
          showSign: false,
        }),
    },
    {
      accessorKey: 'incoterm',
      header: 'Incoterm',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('shipment', 'incoterm')
        if (fieldConfig?.case === 'none') {
          return row.getValue('incoterm')
        }
        return formatText(row.getValue('incoterm'), {
          case: fieldConfig?.case || 'sentencecase',
          trimWhitespace: fieldConfig?.trimWhitespace || false,
        })
      },
    },
    {
      accessorKey: 'vesselName',
      header: 'Vessel',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('shipment', 'vesselName')
        if (fieldConfig?.case === 'none') {
          return row.getValue('vesselName')
        }
        return formatText(row.getValue('vesselName'), {
          case: fieldConfig?.case || 'sentencecase',
          trimWhitespace: fieldConfig?.trimWhitespace || false,
        })
      },
    },
    {
      accessorKey: 'blAwbNumber',
      header: 'BL/AWB No',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('shipment', 'blAwbNumber')
        if (fieldConfig?.case === 'none') {
          return row.getValue('blAwbNumber')
        }
        return formatText(row.getValue('blAwbNumber'), {
          case: fieldConfig?.case || 'sentencecase',
          trimWhitespace: fieldConfig?.trimWhitespace || false,
        })
      },
    },
    {
      accessorKey: 'blAwbDate',
      header: 'BL/AWB Date',
      cell: ({ row }) => formatDateForDisplay(row.getValue('blAwbDate')),
      sortingFn: dateSort,
    },
    {
      accessorKey: 'shipmentMode',
      header: 'Mode',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('shipment', 'shipmentMode')
        if (fieldConfig?.case === 'none') {
          return row.getValue('shipmentMode')
        }
        return formatText(row.getValue('shipmentMode'), {
          case: fieldConfig?.case || 'sentencecase',
          trimWhitespace: fieldConfig?.trimWhitespace || false,
        })
      },
    },
    {
      accessorKey: 'shipmentType',
      header: 'Type',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('shipment', 'shipmentType')
        if (fieldConfig?.case === 'none') {
          return row.getValue('shipmentType')
        }
        return formatText(row.getValue('shipmentType'), {
          case: fieldConfig?.case || 'sentencecase',
          trimWhitespace: fieldConfig?.trimWhitespace || false,
        })
      },
    },
    {
      accessorKey: 'containerNumber',
      header: 'Container #',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('shipment', 'containerNumber')
        if (fieldConfig?.case === 'none') {
          return row.getValue('containerNumber')
        }
        return formatText(row.getValue('containerNumber'), {
          case: fieldConfig?.case || 'sentencecase',
          trimWhitespace: fieldConfig?.trimWhitespace || false,
        })
      },
    },
    {
      accessorKey: 'grossWeightKg',
      header: 'Gross Weight (Kg)',
      cell: ({ row }) =>
        formatNumber(row.getValue('grossWeightKg'), settings?.numberFormat, {
          numberFormat: 'decimal',
          precision: 2,
          showSign: false,
        }),
    },
    {
      accessorKey: 'etd',
      header: ({ column }) => (
        <Button
          variant="ghost"
          className="text-primary-foreground hover:bg-primary/10 h-auto p-1 text-xs font-medium whitespace-nowrap"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          ETD
          <SortIndicator column={column} />
        </Button>
      ),
      cell: ({ row }) => formatDateForDisplay(row.getValue('etd')),
      sortingFn: dateSort,
    },
    {
      accessorKey: 'eta',
      header: ({ column }) => (
        <Button
          variant="ghost"
          className="text-primary-foreground hover:bg-primary/10 h-auto p-1 text-xs font-medium whitespace-nowrap"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          ETA
          <SortIndicator column={column} />
        </Button>
      ),
      cell: ({ row }) => formatDateForDisplay(row.getValue('eta')),
      sortingFn: dateSort,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.getValue('status') as string
        if (!status) return null

        // Define status colors and labels
        const statusConfig = {
          'docs-rcvd': { label: 'Document Received', color: 'bg-blue-100 text-blue-800 border-blue-200' },
          'docu-received': { label: 'Document Received', color: 'bg-blue-100 text-blue-800 border-blue-200' },
          'in-transit': { label: 'In Transit', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
          'customs-clearance': { label: 'Customs Clearance', color: 'bg-purple-100 text-purple-800 border-purple-200' },
          'ready-dly': { label: 'Ready for Delivery', color: 'bg-orange-100 text-orange-800 border-orange-200' },
          delivered: { label: 'Delivered', color: 'bg-green-100 text-green-800 border-green-200' },
        }

        const config = statusConfig[status as keyof typeof statusConfig] || {
          label: status.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
          color: 'bg-gray-100 text-gray-800 border-gray-200',
        }

        return <Badge className={config.color}>{config.label}</Badge>
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <ShipmentActions
          shipment={row.original}
          onView={() => onView(row.original)}
          onEdit={() => onEdit(row.original)}
          onMarkAsDelivered={onMarkAsDelivered ? () => onMarkAsDelivered(row.original) : undefined}
        />
      ),
    },
  ]

  // Filter columns based on visibility settings and sort by order
  const shipmentFields = settings?.modules?.shipment?.fields || {}
  const visibleColumns = allColumns.filter((column) => {
    // Always show select and actions columns
    if (column.id === 'select' || column.id === 'actions') {
      return true
    }

    // Check if the column has an accessorKey and if it's visible in settings
    if ('accessorKey' in column && column.accessorKey && typeof column.accessorKey === 'string') {
      const fieldSettings = shipmentFields[column.accessorKey]
      return fieldSettings?.visible !== false
    }

    // If no accessorKey, show the column (fallback)
    return true
  })

  // Sort columns by their order property
  const sortedColumns = visibleColumns.sort((a, b) => {
    // Select column should always be first
    if (a.id === 'select') return -1
    if (b.id === 'select') return 1

    // Actions column should always be last
    if (a.id === 'actions') return 1
    if (b.id === 'actions') return -1

    // Get order values from settings
    const aOrder =
      'accessorKey' in a && a.accessorKey && typeof a.accessorKey === 'string'
        ? shipmentFields[a.accessorKey]?.order || 999
        : 999
    const bOrder =
      'accessorKey' in b && b.accessorKey && typeof b.accessorKey === 'string'
        ? shipmentFields[b.accessorKey]?.order || 999
        : 999

    return aOrder - bOrder
  })

  return sortedColumns
}
