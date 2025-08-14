// src/components/item/columns.tsx (MODIFIED - Added module-specific settings)
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import type { Item } from '@/types/item'
import type { Option } from '@/types/options'
import type { ColumnDef } from '@tanstack/react-table'
import { formatText, formatNumber, getFieldConfig } from '@/lib/settings'
import type { AppSettings } from '@/lib/settings'

import { ItemActions } from './actions'

export const getItemColumns = (
  suppliers: Option[],
  onView: (item: Item) => void,
  onEdit: (item: Item) => void,
  settings?: AppSettings
): ColumnDef<Item>[] => {
  // Get all possible columns
  const allColumns: ColumnDef<Item>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          className="accent-primary"
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          className="accent-primary"
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'partNumber',
      header: 'Part Number',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('itemMaster', 'partNumber')
        if (fieldConfig?.case === 'none') {
          return row.getValue('partNumber')
        }
        return formatText(row.getValue('partNumber'), {
          case: fieldConfig?.case || 'sentencecase',
          trimWhitespace: fieldConfig?.trimWhitespace || false,
        })
      },
    },
    {
      accessorKey: 'itemDescription',
      header: 'Description',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('itemMaster', 'itemDescription')
        if (fieldConfig?.case === 'none') {
          return row.getValue('itemDescription')
        }
        return formatText(row.getValue('itemDescription'), {
          case: fieldConfig?.case || 'sentencecase',
          trimWhitespace: fieldConfig?.trimWhitespace || false,
        })
      },
    },
    {
      accessorKey: 'unit',
      header: 'Unit',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('itemMaster', 'unit')
        if (fieldConfig?.case === 'none') {
          return row.getValue('unit')
        }
        return formatText(row.getValue('unit'), {
          case: fieldConfig?.case || 'sentencecase',
          trimWhitespace: fieldConfig?.trimWhitespace || false,
        })
      },
    },
    {
      accessorKey: 'currency',
      header: 'Currency',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('itemMaster', 'currency')
        if (fieldConfig?.case === 'none') {
          return row.getValue('currency')
        }
        return formatText(row.getValue('currency'), {
          case: fieldConfig?.case || 'sentencecase',
          trimWhitespace: fieldConfig?.trimWhitespace || false,
        })
      },
    },
    {
      accessorKey: 'unitPrice',
      header: 'Unit Price',
      cell: ({ row }) =>
        formatNumber(row.getValue('unitPrice'), settings.numberFormat, {
          numberFormat: 'currency',
          precision: 2,
          showSign: false,
        }),
    },
    {
      accessorKey: 'hsnCode',
      header: 'HSN Code',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('itemMaster', 'hsnCode')
        if (fieldConfig?.case === 'none') {
          return row.getValue('hsnCode')
        }
        return formatText(row.getValue('hsnCode'), {
          case: fieldConfig?.case || 'sentencecase',
          trimWhitespace: fieldConfig?.trimWhitespace || false,
        })
      },
    },
    {
      accessorKey: 'supplierId',
      header: 'Supplier',
      cell: ({ row }) => {
        const supplierId = row.getValue('supplierId') as string
        const supplier = suppliers.find((s) => s.value === supplierId)
        return supplier ? supplier.label : 'N/A'
      },
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) => {
        const isActive = row.getValue('isActive')
        return (
          <Badge className={isActive ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}>
            {isActive ? 'Active' : 'Inactive'}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'countryOfOrigin',
      header: 'Country of Origin',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('itemMaster', 'countryOfOrigin')
        if (fieldConfig?.case === 'none') {
          return row.getValue('countryOfOrigin')
        }
        return formatText(row.getValue('countryOfOrigin'), {
          case: fieldConfig?.case || 'sentencecase',
          trimWhitespace: fieldConfig?.trimWhitespace || false,
        })
      },
    },
    {
      accessorKey: 'bcd',
      header: 'BCD',
      cell: ({ row }) => {
        const value = row.getValue('bcd')
        if (value === null || value === undefined) return '-'
        return `${value}%`
      },
    },
    {
      accessorKey: 'sws',
      header: 'SWS',
      cell: ({ row }) => {
        const value = row.getValue('sws')
        if (value === null || value === undefined) return '-'
        return `${value}%`
      },
    },
    {
      accessorKey: 'igst',
      header: 'IGST',
      cell: ({ row }) => {
        const value = row.getValue('igst')
        if (value === null || value === undefined) return '-'
        return `${value}%`
      },
    },
    {
      accessorKey: 'category',
      header: 'Category',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('itemMaster', 'category')
        if (fieldConfig?.case === 'none') {
          return row.getValue('category')
        }
        return formatText(row.getValue('category'), {
          case: fieldConfig?.case || 'sentencecase',
          trimWhitespace: fieldConfig?.trimWhitespace || false,
        })
      },
    },
    {
      accessorKey: 'endUse',
      header: 'End Use',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('itemMaster', 'endUse')
        if (fieldConfig?.case === 'none') {
          return row.getValue('endUse')
        }
        return formatText(row.getValue('endUse'), {
          case: fieldConfig?.case || 'sentencecase',
          trimWhitespace: fieldConfig?.trimWhitespace || false,
        })
      },
    },
    {
      accessorKey: 'netWeightKg',
      header: 'Net Weight (Kg)',
      cell: ({ row }) =>
        formatNumber(row.getValue('netWeightKg'), settings.numberFormat, {
          numberFormat: 'decimal',
          precision: 2,
          showSign: false,
        }),
    },
    {
      accessorKey: 'purchaseUom',
      header: 'Purchase UOM',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('itemMaster', 'purchaseUom')
        if (fieldConfig?.case === 'none') {
          return row.getValue('purchaseUom')
        }
        return formatText(row.getValue('purchaseUom'), {
          case: fieldConfig?.case || 'sentencecase',
          trimWhitespace: fieldConfig?.trimWhitespace || false,
        })
      },
    },
    {
      accessorKey: 'grossWeightPerUomKg',
      header: 'Gross Weight/UOM (Kg)',
      cell: ({ row }) =>
        formatNumber(row.getValue('grossWeightPerUomKg'), settings.numberFormat, {
          numberFormat: 'decimal',
          precision: 2,
          showSign: false,
        }),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <ItemActions
          item={row.original}
          onView={() => onView(row.original)}
          onEdit={() => onEdit(row.original)}
        />
      ),
    },
  ]

  // Filter columns based on visibility settings and sort by order
  const itemMasterFields = settings.modules.itemMaster.fields
  const visibleColumns = allColumns.filter((column) => {
    // Always show select and actions columns
    if (column.id === 'select' || column.id === 'actions') {
      return true
    }

    // Check if the column has an accessorKey and if it's visible in settings
    if ('accessorKey' in column && column.accessorKey && typeof column.accessorKey === 'string') {
      const fieldSettings = itemMasterFields[column.accessorKey]
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
        ? itemMasterFields[a.accessorKey]?.order || 999
        : 999
    const bOrder =
      'accessorKey' in b && b.accessorKey && typeof b.accessorKey === 'string'
        ? itemMasterFields[b.accessorKey]?.order || 999
        : 999

    return aOrder - bOrder
  })

  return sortedColumns
}
