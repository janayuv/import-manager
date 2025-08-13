// src/components/boe/columns.tsx (MODIFIED - Added module-specific settings)
import { MoreHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatDateForDisplay } from '@/lib/date-format'
import { formatText, formatNumber, getFieldConfig } from '@/lib/settings'
import type { BoeDetails } from '@/types/boe'
import { type ColumnDef } from '@tanstack/react-table'



interface GetBoeColumnsProps {
  onView: (boe: BoeDetails) => void
  onEdit: (boe: BoeDetails) => void
  onDelete: (boe: BoeDetails) => void
}

export const getBoeColumns = ({
  onView,
  onEdit,
  onDelete,
  settings,
}: GetBoeColumnsProps & { settings?: any }): ColumnDef<BoeDetails>[] => {
  
  // Get all possible columns
  const allColumns: ColumnDef<BoeDetails>[] = [
  {
    accessorKey: 'id',
    header: 'ID',
    cell: ({ row }) => {
      const fieldConfig = getFieldConfig('boe', 'id')
      if (fieldConfig?.case === 'none') {
        return row.getValue('id')
      }
      return formatText(row.getValue('id'), { 
        case: fieldConfig?.case || 'sentencecase', 
        trimWhitespace: fieldConfig?.trimWhitespace || false 
      })
    }
  },
  {
    accessorKey: 'beNumber',
    header: 'BE No.',
    cell: ({ row }) => {
      const fieldConfig = getFieldConfig('boe', 'beNumber')
      if (fieldConfig?.case === 'none') {
        return row.getValue('beNumber')
      }
      return formatText(row.getValue('beNumber'), { 
        case: fieldConfig?.case || 'sentencecase', 
        trimWhitespace: fieldConfig?.trimWhitespace || false 
      })
    }
  },
  {
    accessorKey: 'beDate',
    header: 'BE Date',
    cell: ({ row }) => {
      return formatDateForDisplay(row.original.beDate)
    }
  },
  {
    accessorKey: 'location',
    header: 'Location',
    cell: ({ row }) => {
      const fieldConfig = getFieldConfig('boe', 'location')
      const globalCase = settings.textFormat?.case || 'sentencecase'
      const fieldCase = fieldConfig?.case || 'sentencecase'
      
      // If global case is 'uppercase', it should override field-specific case
      // unless field-specific case is also 'uppercase'
      const finalCase = globalCase === 'uppercase' ? 'uppercase' : fieldCase
      
              return formatText(row.getValue('location'), { 
          case: finalCase as 'lowercase' | 'uppercase' | 'titlecase' | 'sentencecase', 
          trimWhitespace: fieldConfig?.trimWhitespace || false 
        })
    }
  },
  {
    accessorKey: 'totalAssessmentValue',
    header: 'Total Assessment Value',
    cell: ({ row }) => {
      const fieldConfig = getFieldConfig('boe', 'totalAssessmentValue')
      return formatNumber(row.getValue('totalAssessmentValue'), settings.numberFormat, { 
        numberFormat: fieldConfig?.numberFormat || 'currency', 
        precision: fieldConfig?.precision, // Let formatNumber use global setting if not specified
        showSign: fieldConfig?.showSign || false 
      })
    }
  },
  {
    accessorKey: 'dutyAmount',
    header: 'Duty Amount',
    cell: ({ row }) => {
      const fieldConfig = getFieldConfig('boe', 'dutyAmount')
      return formatNumber(row.getValue('dutyAmount'), settings.numberFormat, { 
        numberFormat: fieldConfig?.numberFormat || 'currency', 
        precision: fieldConfig?.precision, // Let formatNumber use global setting if not specified
        showSign: fieldConfig?.showSign || false 
      })
    }
  },
  {
    accessorKey: 'paymentDate',
    header: 'Payment Date',
    cell: ({ row }) => {
      return formatDateForDisplay(row.original.paymentDate)
    }
  },
  {
    accessorKey: 'dutyPaid',
    header: 'Duty Paid',
    cell: ({ row }) => {
      const fieldConfig = getFieldConfig('boe', 'dutyPaid')
      return formatNumber(row.getValue('dutyPaid'), settings.numberFormat, { 
        numberFormat: fieldConfig?.numberFormat || 'currency', 
        precision: fieldConfig?.precision, // Let formatNumber use global setting if not specified
        showSign: fieldConfig?.showSign || false 
      })
    }
  },
  {
    accessorKey: 'challanNumber',
    header: 'Challan No.',
    cell: ({ row }) => {
      const fieldConfig = getFieldConfig('boe', 'challanNumber')
      if (fieldConfig?.case === 'none') {
        return row.getValue('challanNumber')
      }
      return formatText(row.getValue('challanNumber'), { 
        case: fieldConfig?.case || 'sentencecase', 
        trimWhitespace: fieldConfig?.trimWhitespace || false 
      })
    }
  },
  {
    accessorKey: 'refId',
    header: 'Ref ID',
    cell: ({ row }) => {
      const fieldConfig = getFieldConfig('boe', 'refId')
      if (fieldConfig?.case === 'none') {
        return row.getValue('refId')
      }
      return formatText(row.getValue('refId'), { 
        case: fieldConfig?.case || 'sentencecase', 
        trimWhitespace: fieldConfig?.trimWhitespace || false 
      })
    }
  },
  {
    accessorKey: 'transactionId',
    header: 'Transaction ID',
    cell: ({ row }) => {
      const fieldConfig = getFieldConfig('boe', 'transactionId')
      if (fieldConfig?.case === 'none') {
        return row.getValue('transactionId')
      }
      return formatText(row.getValue('transactionId'), { 
        case: fieldConfig?.case || 'sentencecase', 
        trimWhitespace: fieldConfig?.trimWhitespace || false 
      })
    }
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const boe = row.original
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onView(boe)}>View</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(boe)}>Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete(boe)}>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
  ]
  
  // Filter columns based on visibility settings and sort by order
  const boeFields = settings.modules.boe.fields
  const visibleColumns = allColumns.filter(column => {
    // Always show actions column
    if (column.id === 'actions') {
      return true
    }
    
    // Check if the column has an accessorKey and if it's visible in settings
    if ('accessorKey' in column && column.accessorKey && typeof column.accessorKey === 'string') {
      const fieldSettings = boeFields[column.accessorKey]
      return fieldSettings?.visible !== false
    }
    
    // If no accessorKey, show the column (fallback)
    return true
  })
  
  // Sort columns by their order property
  const sortedColumns = visibleColumns.sort((a, b) => {
    // Actions column should always be last
    if (a.id === 'actions') return 1
    if (b.id === 'actions') return -1
    
    // Get order values from settings
    const aOrder = 'accessorKey' in a && a.accessorKey && typeof a.accessorKey === 'string' 
      ? boeFields[a.accessorKey]?.order || 999 
      : 999
    const bOrder = 'accessorKey' in b && b.accessorKey && typeof b.accessorKey === 'string' 
      ? boeFields[b.accessorKey]?.order || 999 
      : 999
    
    return aOrder - bOrder
  })
  
  return sortedColumns
}
