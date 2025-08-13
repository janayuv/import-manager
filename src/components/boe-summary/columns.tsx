'use client'

import { Badge } from '@/components/ui/badge'
import { formatText, formatNumber, getFieldConfig } from '@/lib/settings'
import type { SavedBoe } from '@/types/boe-entry'
import { type ColumnDef } from '@tanstack/react-table'

const statusToVariant: Record<SavedBoe['status'], { color: string; label: string }> = {
  'Awaiting BOE Data': { color: 'bg-blue-600', label: 'Awaiting BOE Data' },
  'Discrepancy Found': { color: 'bg-red-600', label: 'Discrepancy Found' },
  Reconciled: { color: 'bg-green-600', label: 'Reconciled' },
  Investigation: { color: 'bg-yellow-600', label: 'Investigation' },
  Closed: { color: 'bg-gray-500', label: 'Closed' },
}

export function StatusBadge({ status }: { status: SavedBoe['status'] }) {
  const v = statusToVariant[status] ?? statusToVariant['Awaiting BOE Data']
  return <Badge className={`${v.color} text-white`}>{v.label}</Badge>
}

// Interface for BOE Summary item data
export interface BoeSummaryItem {
  partNo: string
  description: string
  assessableValue: number
  bcdValue: number
  swsValue: number
  igstValue: number
  totalDuty: number
  qty: number
  perUnitDuty: number
  landedCostPerUnit: number
  actualDuty: number | null
  dutySavings: number
}

// Interface for BOE Summary table props
interface GetBoeSummaryColumnsProps {
  settings?: any
}

export const getBoeSummaryColumns = ({
  settings,
}: GetBoeSummaryColumnsProps = {}): ColumnDef<BoeSummaryItem>[] => {
  

  
  // Get all possible columns
  const allColumns: ColumnDef<BoeSummaryItem>[] = [
    {
      accessorKey: 'partNo',
      header: 'Part No',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('boeSummary', 'partNo')
        const globalCase = settings?.textFormat?.case || 'sentencecase'
        const fieldCase = fieldConfig?.case || 'sentencecase'
        
        // If global case is 'uppercase', it should override field-specific case
        const finalCase = globalCase === 'uppercase' ? 'uppercase' : fieldCase
        
        return formatText(row.getValue('partNo'), { 
          case: finalCase as 'lowercase' | 'uppercase' | 'titlecase' | 'sentencecase', 
          trimWhitespace: fieldConfig?.trimWhitespace || false 
        })
      }
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('boeSummary', 'description')
        const globalCase = settings?.textFormat?.case || 'sentencecase'
        const fieldCase = fieldConfig?.case || 'sentencecase'
        
        // If global case is 'uppercase', it should override field-specific case
        const finalCase = globalCase === 'uppercase' ? 'uppercase' : fieldCase
        
        return formatText(row.getValue('description'), { 
          case: finalCase as 'lowercase' | 'uppercase' | 'titlecase' | 'sentencecase', 
          trimWhitespace: fieldConfig?.trimWhitespace || false 
        })
      }
    },
    {
      accessorKey: 'assessableValue',
      header: 'Assessable Value',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('boeSummary', 'assessableValue')
        return formatNumber(row.getValue('assessableValue') as number, settings?.numberFormat, { 
          numberFormat: fieldConfig?.numberFormat || 'currency', 
          precision: fieldConfig?.precision, // Let formatNumber use global setting if not specified
          showSign: fieldConfig?.showSign || false 
        })
      }
    },
    {
      accessorKey: 'totalDuty',
      header: 'Total Duty',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('boeSummary', 'totalDuty')
        return formatNumber(row.getValue('totalDuty') as number, settings?.numberFormat, {
          numberFormat: fieldConfig?.numberFormat || 'currency',
          precision: fieldConfig?.precision, // Let formatNumber use global setting if not specified
          showSign: fieldConfig?.showSign || false
        })
      }
    },
    {
      accessorKey: 'actualDuty',
      header: 'Actual Duty',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('boeSummary', 'actualDuty')
        const value = row.getValue('actualDuty')
        if (value === null || value === undefined) return '-'
        return formatNumber(value as number, settings?.numberFormat, {
          numberFormat: fieldConfig?.numberFormat || 'currency',
          precision: fieldConfig?.precision, // Let formatNumber use global setting if not specified
          showSign: fieldConfig?.showSign || false
        })
      }
    },
    {
      accessorKey: 'qty',
      header: 'Qty',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('boeSummary', 'qty')
        const value = row.getValue('qty')
        if (!value) return '-'
        return formatNumber(value as number, settings?.numberFormat, {
          numberFormat: fieldConfig?.numberFormat || 'integer',
          precision: fieldConfig?.precision, // Let formatNumber use global setting if not specified
          showSign: fieldConfig?.showSign || false
        })
      }
    },
    {
      accessorKey: 'landedCostPerUnit',
      header: 'Landed Cost / Unit',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('boeSummary', 'landedCostPerUnit')
        const value = row.getValue('landedCostPerUnit')
        if (!value) return '-'
        return formatNumber(value as number, settings?.numberFormat, {
          numberFormat: fieldConfig?.numberFormat || 'currency',
          precision: fieldConfig?.precision, // Let formatNumber use global setting if not specified
          showSign: fieldConfig?.showSign || false
        })
      }
    },
    {
      accessorKey: 'perUnitDuty',
      header: 'Per-Unit Duty',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('boeSummary', 'perUnitDuty')
        const value = row.getValue('perUnitDuty')
        if (!value) return '-'
        return formatNumber(value as number, settings?.numberFormat, {
          numberFormat: fieldConfig?.numberFormat || 'currency',
          precision: fieldConfig?.precision, // Let formatNumber use global setting if not specified
          showSign: fieldConfig?.showSign || false
        })
      }
    },
    {
      accessorKey: 'bcd',
      header: 'BCD',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('boeSummary', 'bcd')
        return formatNumber(row.getValue('bcdValue') as number, settings?.numberFormat, { 
          numberFormat: fieldConfig?.numberFormat || 'decimal', 
          precision: fieldConfig?.precision, // Let formatNumber use global setting if not specified
          showSign: fieldConfig?.showSign || false 
        })
      }
    },
    {
      accessorKey: 'sws',
      header: 'SWS',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('boeSummary', 'sws')
        return formatNumber(row.getValue('swsValue') as number, settings?.numberFormat, { 
          numberFormat: fieldConfig?.numberFormat || 'decimal', 
          precision: fieldConfig?.precision, // Let formatNumber use global setting if not specified
          showSign: fieldConfig?.showSign || false 
        })
      }
    },
    {
      accessorKey: 'igst',
      header: 'IGST',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('boeSummary', 'igst')
        return formatNumber(row.getValue('igstValue') as number, settings?.numberFormat, { 
          numberFormat: fieldConfig?.numberFormat || 'decimal', 
          precision: fieldConfig?.precision, // Let formatNumber use global setting if not specified
          showSign: fieldConfig?.showSign || false 
        })
      }
    },
    {
      accessorKey: 'savings',
      header: 'Savings',
      cell: ({ row }) => {
        const fieldConfig = getFieldConfig('boeSummary', 'savings')
        return formatNumber(row.getValue('dutySavings') as number, settings?.numberFormat, {
          numberFormat: fieldConfig?.numberFormat || 'currency',
          precision: fieldConfig?.precision,
          showSign: fieldConfig?.showSign || false
        })
      }
    }
  ]
  
  // Filter columns based on visibility settings and sort by order
  const boeSummaryFields = settings?.modules?.boeSummary?.fields
  
  const visibleColumns = allColumns.filter(column => {
    // Check if the column has an accessorKey and if it's visible in settings
    if ('accessorKey' in column && column.accessorKey && typeof column.accessorKey === 'string') {
      const fieldSettings = boeSummaryFields?.[column.accessorKey]
      return fieldSettings?.visible !== false
    }
    
    // If no accessorKey, show the column (fallback)
    return true
  })
  
  // Sort columns by their order property
  const sortedColumns = visibleColumns.sort((a, b) => {
    // Get order values from settings
    const aOrder = 'accessorKey' in a && a.accessorKey && typeof a.accessorKey === 'string' 
      ? boeSummaryFields?.[a.accessorKey]?.order || 999 
      : 999
    const bOrder = 'accessorKey' in b && b.accessorKey && typeof b.accessorKey === 'string' 
      ? boeSummaryFields?.[b.accessorKey]?.order || 999 
      : 999
    
    return aOrder - bOrder
  })
  
  return sortedColumns
}
