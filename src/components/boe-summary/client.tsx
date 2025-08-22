'use client'

import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import * as ExcelJS from 'exceljs'
import { toast } from 'sonner'

import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  computeDutyFromRates,
  computeLandedCostPerUnit,
  computePerUnitDuty,
  computeSavingsFromActualVsBoe,
} from '@/lib/financial'
import { formatCurrency as formatCurrencyWithSettings, loadSettings } from '@/lib/settings'
import type { BoeDetails } from '@/types/boe'
import type { CalculatedDutyItem, SavedBoe, Shipment } from '@/types/boe-entry'

import { StatusBadge } from './status-badge'

const formatCurrency = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined) return '-'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

const formatCurrencyNoDecimals = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined) return '-'
  return formatCurrencyWithSettings(amount)
}

// Function to get ordered fields based on settings
const getOrderedFields = () => {
  const settings = loadSettings()
  const boeSummaryFields = settings.modules.boeSummary.fields

  // Convert to array and sort by order
  return Object.entries(boeSummaryFields)
    .filter(([, config]) => config.visible)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([fieldName]) => fieldName)
}

// Function to get field display name
const getFieldDisplayName = (fieldName: string) => {
  const fieldMap: Record<string, string> = {
    partNo: 'Part No',
    description: 'Description',
    assessableValue: 'Assessable',
    bcd: 'BCD',
    sws: 'SWS',
    igst: 'IGST',
    totalDuty: 'Total Duty',
    qty: 'Qty',
    perUnitDuty: 'Per-Unit Duty',
    landedCostPerUnit: 'Landed Cost / Unit',
    actualDuty: 'Actual Duty',
    savings: 'Savings',
  }

  return fieldMap[fieldName] || fieldName
}

// Function to render cell value
const renderCellValue = (
  fieldName: string,
  row: {
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
) => {
  switch (fieldName) {
    case 'partNo':
      return <TableCell className="font-medium">{row.partNo}</TableCell>
    case 'description':
      return <TableCell>{row.description}</TableCell>
    case 'assessableValue':
      return <TableCell className="text-right font-mono">{formatCurrencyNoDecimals(row.assessableValue)}</TableCell>
    case 'bcd':
      return <TableCell className="text-right font-mono">{formatCurrencyNoDecimals(row.bcdValue)}</TableCell>
    case 'sws':
      return <TableCell className="text-right font-mono">{formatCurrencyNoDecimals(row.swsValue)}</TableCell>
    case 'igst':
      return <TableCell className="text-right font-mono">{formatCurrencyNoDecimals(row.igstValue)}</TableCell>
    case 'totalDuty':
      return <TableCell className="text-right font-mono">{formatCurrencyNoDecimals(row.totalDuty)}</TableCell>
    case 'qty':
      return <TableCell className="text-right font-mono">{row.qty || '-'}</TableCell>
    case 'perUnitDuty':
      return <TableCell className="text-right font-mono">{row.qty ? formatCurrency(row.perUnitDuty) : '-'}</TableCell>
    case 'landedCostPerUnit':
      return (
        <TableCell className="text-right font-mono">{row.qty ? formatCurrency(row.landedCostPerUnit) : '-'}</TableCell>
      )
    case 'actualDuty':
      return (
        <TableCell className="text-right font-mono">
          {row.actualDuty != null ? formatCurrencyNoDecimals(row.actualDuty) : '-'}
        </TableCell>
      )
    case 'savings':
      return <TableCell className="text-right font-mono">{formatCurrencyNoDecimals(row.dutySavings)}</TableCell>
    default:
      return <TableCell>-</TableCell>
  }
}

// Function to render totals cell value
const renderTotalsCellValue = (
  fieldName: string,
  totals: {
    assessableValue: number
    bcdValue: number
    swsValue: number
    igstValue: number
    totalDuty: number
    dutySavings: number
    actualDuty: number
  },
  orderedFields: string[]
) => {
  // Find the index of the current field in the ordered fields
  const fieldIndex = orderedFields.indexOf(fieldName)

  // If this is the first field (partNo), create a cell that spans the first two columns
  if (fieldIndex === 0) {
    return (
      <TableCell
        colSpan={2}
        className="text-right font-semibold"
      >
        Totals
      </TableCell>
    )
  }

  // If this is the second field (description), skip it since it's covered by the colspan
  if (fieldIndex === 1) {
    return null
  }

  // For all other fields, render the appropriate value
  switch (fieldName) {
    case 'assessableValue':
      return (
        <TableCell className="text-right font-mono font-semibold">
          {formatCurrencyNoDecimals(totals.assessableValue)}
        </TableCell>
      )
    case 'bcd':
      return (
        <TableCell className="text-right font-mono font-semibold">
          {formatCurrencyNoDecimals(totals.bcdValue)}
        </TableCell>
      )
    case 'sws':
      return (
        <TableCell className="text-right font-mono font-semibold">
          {formatCurrencyNoDecimals(totals.swsValue)}
        </TableCell>
      )
    case 'igst':
      return (
        <TableCell className="text-right font-mono font-semibold">
          {formatCurrencyNoDecimals(totals.igstValue)}
        </TableCell>
      )
    case 'totalDuty':
      return (
        <TableCell className="text-right font-mono font-semibold">
          {formatCurrencyNoDecimals(totals.totalDuty)}
        </TableCell>
      )
    case 'qty':
      return <TableCell className="text-right font-mono font-semibold">-</TableCell>
    case 'perUnitDuty':
      return <TableCell className="text-right font-mono font-semibold">-</TableCell>
    case 'landedCostPerUnit':
      return <TableCell className="text-right font-mono font-semibold">-</TableCell>
    case 'actualDuty':
      return (
        <TableCell className="text-right font-mono font-semibold">
          {formatCurrencyNoDecimals(totals.actualDuty)}
        </TableCell>
      )
    case 'savings':
      return (
        <TableCell className="text-right font-mono font-semibold">
          {formatCurrencyNoDecimals(totals.dutySavings)}
        </TableCell>
      )
    default:
      return <TableCell className="text-right font-mono font-semibold">-</TableCell>
  }
}

function downloadCsv(filename: string, rows: Array<Record<string, string | number>>) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const escape = (val: string | number) => {
    const s = String(val ?? '')
    if (s.includes(',') || s.includes('\n') || s.includes('"')) {
      return '"' + s.replace(/"/g, '""') + '"'
    }
    return s
  }
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h] ?? '')).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

type SummaryRow = { label: string; calculated: number; boe: number | null; variance: number | null }

async function exportXlsx(params: { itemsRows?: Array<Record<string, string | number>>; summary: SummaryRow[] }) {
  const { itemsRows = [], summary } = params
  const summaryRows = summary.map((r) => ({
    Metric: r.label,
    Calculated: r.calculated,
    BOE: r.boe ?? '',
    Variance: r.variance ?? '',
  }))

  const workbook = new ExcelJS.Workbook()

  if (itemsRows.length) {
    const itemsSheet = workbook.addWorksheet('Items')
    const headers = Object.keys(itemsRows[0])
    itemsSheet.addRow(headers)
    itemsRows.forEach((row) => {
      itemsSheet.addRow(
        headers.map((header) => {
          return row[header]
        })
      )
    })
  }

  const summarySheet = workbook.addWorksheet('Summary')
  const summaryHeaders = ['Metric', 'Calculated', 'BOE', 'Variance']
  summarySheet.addRow(summaryHeaders)
  summaryRows.forEach((row) => {
    summarySheet.addRow([row.Metric, row.Calculated, row.BOE, row.Variance])
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'boe-report.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}

function printReport(params: {
  itemsRows: Array<Record<string, string | number>>
  summary: SummaryRow[]
  title: string
}) {
  console.log('🖨️ Starting printReport function...')
  console.log('📋 Print params:', params)

  const { itemsRows, summary, title } = params

  console.log('📊 Items rows count:', itemsRows.length)
  console.log('📈 Summary rows count:', summary.length)
  console.log('📝 Title:', title)

  try {
    // Get the ordered fields for consistent column order
    console.log('🔧 Getting ordered fields...')
    const orderedFields = getOrderedFields()
    console.log('📋 Ordered fields:', orderedFields)

    const fieldDisplayNames = orderedFields.map((fieldName) => getFieldDisplayName(fieldName))
    console.log('🏷️ Field display names:', fieldDisplayNames)

    console.log('🔨 Building item rows HTML...')
    const itemRowsHtml = itemsRows
      .map((r, index) => {
        console.log(`📦 Processing row ${index}:`, r)
        const cells = orderedFields
          .map((fieldName) => {
            const displayName = getFieldDisplayName(fieldName)

            const value = r[displayName] ?? '-'
            const isNumeric = [
              'assessableValue',
              'bcd',
              'sws',
              'igst',
              'totalDuty',
              'qty',
              'perUnitDuty',
              'landedCostPerUnit',
              'actualDuty',
              'savings',
            ].includes(fieldName)
            console.log(`  📄 Field: ${fieldName}, Display: ${displayName}, Value: ${value}, Numeric: ${isNumeric}`)
            return `<td class="${isNumeric ? 'num' : ''}">${value}</td>`
          })
          .join('')

        const rowHtml = `<tr>${cells}</tr>`
        console.log(`  ✅ Row ${index} HTML:`, rowHtml)
        return rowHtml
      })
      .join('')

    console.log('📊 Final item rows HTML length:', itemRowsHtml.length)

    console.log('📈 Building summary rows HTML...')
    const summaryRowsHtml = summary
      .map((r: { label: string; calculated: number; boe: number | null; variance: number | null }, index) => {
        console.log(`📊 Processing summary row ${index}:`, r)
        const rowHtml = `
          <tr>
            <td>${r.label}</td>
            <td class="num">${r.calculated.toFixed(2)}</td>
            <td class="num">${r.boe != null ? r.boe.toFixed(2) : '-'}</td>
            <td class="num">${r.variance != null ? r.variance.toFixed(2) : '-'}</td>
          </tr>`
        console.log(`  ✅ Summary row ${index} HTML:`, rowHtml)
        return rowHtml
      })
      .join('')

    console.log('📊 Final summary rows HTML length:', summaryRowsHtml.length)

    console.log('🏗️ Building complete HTML...')
    const html = `<!doctype html>
    <html><head>
      <meta charset="utf-8"/>
      <title>${title}</title>
      <style>
        body { font: 12px system-ui, -apple-system, Segoe UI, Roboto, Arial; color: #111; margin: 24px; }
        h1 { font-size: 18px; margin: 0 0 12px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th, td { border: 1px solid #ddd; padding: 6px 8px; }
        th { background: #f5f5f5; text-align: left; }
        td.num, th.num { text-align: right; font-feature-settings: "tnum"; font-variant-numeric: tabular-nums; }
        @media print { button { display: none; } }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      <h2>Item Details</h2>
           <table>
         <thead>
           <tr>
             ${fieldDisplayNames
               .map((displayName) => {
                 const isNumeric = [
                   'Assessable',
                   'BCD',
                   'SWS',
                   'IGST',
                   'Total Duty',
                   'Qty',
                   'Per-Unit Duty',
                   'Landed Cost / Unit',
                   'Actual Duty',
                   'Savings',
                 ].includes(displayName)
                 return `<th class="${isNumeric ? 'num' : ''}">${displayName}</th>`
               })
               .join('')}
           </tr>
         </thead>
         <tbody>${itemRowsHtml}</tbody>
       </table>
      <h2>BOE Summary & Variance</h2>
      <table>
        <thead>
          <tr>
            <th>Metric</th><th class="num">Calculated</th><th class="num">BOE</th><th class="num">Variance (Calc - BOE)</th>
          </tr>
        </thead>
        <tbody>${summaryRowsHtml}</tbody>
      </table>
      <script>window.onload = () => window.print();</script>
    </body></html>`

    console.log('📄 Complete HTML length:', html.length)
    console.log('🌐 Opening print window...')

    // Try to open the print window
    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1024,height=768')

    if (!printWindow) {
      console.error('❌ Failed to open print window - popup blocked?')
      console.log('🔄 Trying alternative print method...')

      // Fallback: Create a temporary iframe for printing
      try {
        const iframe = document.createElement('iframe')
        iframe.style.position = 'fixed'
        iframe.style.right = '0'
        iframe.style.bottom = '0'
        iframe.style.width = '0'
        iframe.style.height = '0'
        iframe.style.border = '0'
        iframe.style.visibility = 'hidden'

        document.body.appendChild(iframe)

        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
        if (iframeDoc) {
          iframeDoc.open()
          iframeDoc.write(html)
          iframeDoc.close()

          console.log('✅ HTML written to iframe successfully')

          // Wait a moment for content to load, then print
          setTimeout(() => {
            iframe.contentWindow?.print()
            console.log('🖨️ Print command sent to iframe')

            // Remove iframe after printing
            setTimeout(() => {
              document.body.removeChild(iframe)
              console.log('🧹 Iframe removed')
            }, 1000)
          }, 500)
        } else {
          console.error('❌ Failed to access iframe document')
          alert('Print failed: Popup blocked and iframe method unavailable. Please allow popups for this site.')
        }
      } catch (error) {
        console.error('💥 Error in iframe print method:', error)
        alert('Print failed: Popup blocked and alternative method failed. Please allow popups for this site.')
      }
      return
    }

    console.log('✅ Print window opened successfully')
    console.log('📝 Writing HTML to print window...')

    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()

    console.log('✅ HTML written to print window successfully')
    console.log('🖨️ Print function completed successfully')
  } catch (error) {
    console.error('💥 Error in printReport function:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
  }
}

function ItemDetailsTable({
  items,
  quantities,
  actualRatesByPart,
  methodByPart,
}: {
  items: CalculatedDutyItem[]
  quantities?: Record<string, number>
  actualRatesByPart?: Record<string, { bcdRate: number; swsRate: number; igstRate: number }>
  methodByPart?: Record<string, 'Standard' | 'CEPA' | 'Rodtep'>
}) {
  const rows = items.map((it) => {
    const qty = quantities?.[it.partNo] ?? 0
    const perUnitDuty = computePerUnitDuty(it.bcdValue + it.swsValue + it.igstValue, qty)
    const landedCostPerUnit = computeLandedCostPerUnit(
      it.assessableValue,
      it.bcdValue + it.swsValue + it.igstValue,
      qty
    )
    const boeDuty = {
      bcd: it.bcdValue,
      sws: it.swsValue,
      igst: it.igstValue,
      total: it.bcdValue + it.swsValue + it.igstValue,
    }
    const ratesForItem = actualRatesByPart?.[it.partNo]
    const methodForItem = methodByPart?.[it.partNo] ?? 'Standard'
    const actual = ratesForItem ? computeDutyFromRates(it.assessableValue, ratesForItem) : null
    const savings =
      actual && methodForItem !== 'Standard'
        ? computeSavingsFromActualVsBoe({
            method: methodForItem,
            assessableValue: it.assessableValue,
            actualRates: ratesForItem!,
            boe: boeDuty,
          })
        : 0
    return {
      partNo: it.partNo,
      description: it.description,
      assessableValue: it.assessableValue,
      bcdValue: it.bcdValue,
      swsValue: it.swsValue,
      igstValue: it.igstValue,
      totalDuty: Math.round((it.bcdValue + it.swsValue + it.igstValue) * 100) / 100,
      qty,
      perUnitDuty,
      landedCostPerUnit,
      actualDuty: actual?.total ?? null,
      dutySavings: savings,
    }
  })

  const totals = rows.reduce(
    (acc, r) => {
      acc.assessableValue += r.assessableValue
      acc.bcdValue += r.bcdValue
      acc.swsValue += r.swsValue
      acc.igstValue += r.igstValue
      acc.totalDuty += r.totalDuty
      acc.dutySavings += r.dutySavings
      acc.actualDuty += r.actualDuty || 0
      return acc
    },
    {
      assessableValue: 0,
      bcdValue: 0,
      swsValue: 0,
      igstValue: 0,
      totalDuty: 0,
      dutySavings: 0,
      actualDuty: 0,
    }
  )

  const exportRows = rows.map((r) => ({
    'Part No': r.partNo,
    Description: r.description,
    Assessable: Math.round(r.assessableValue),
    BCD: Math.round(r.bcdValue),
    SWS: Math.round(r.swsValue),
    IGST: Math.round(r.igstValue),
    'Total Duty': Math.round(r.totalDuty),
    Qty: r.qty,
    'Per-Unit Duty': r.qty ? r.perUnitDuty : '',
    'Landed Cost / Unit': r.qty ? r.landedCostPerUnit : '',
    'Actual Duty': r.actualDuty != null ? Math.round(r.actualDuty) : '',
    Savings: Math.round(r.dutySavings),
  }))

  const handleExport = () => {
    downloadCsv('boe-item-details.csv', exportRows)
  }

  const handleExportXlsx = async () => await exportXlsx({ itemsRows: exportRows, summary: [] })

  const handlePrint = () => {
    console.log('🖨️ ItemDetailsTable handlePrint clicked')
    console.log('📊 Export rows for print:', exportRows)

    // Show a helpful message about popup blockers
    toast.info('Printing... If nothing happens, please allow popups for this site.', {
      duration: 3000,
    })

    printReport({ itemsRows: exportRows, summary: [], title: 'BOE Item Details' })
  }

  const orderedFields = getOrderedFields()

  return (
    <Card className="mt-2">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Item Details</CardTitle>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleExport}
          >
            CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportXlsx}
          >
            Excel
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handlePrint}
          >
            Print
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                {orderedFields.map((fieldName) => (
                  <TableHead
                    key={fieldName}
                    className={fieldName !== 'partNo' && fieldName !== 'description' ? 'text-right' : ''}
                  >
                    {getFieldDisplayName(fieldName)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.partNo}>
                  {orderedFields.map((fieldName) => (
                    <React.Fragment key={fieldName}>{renderCellValue(fieldName, r)}</React.Fragment>
                  ))}
                </TableRow>
              ))}
              <TableRow className="bg-muted/30">
                {orderedFields.map((fieldName) => {
                  const cell = renderTotalsCellValue(fieldName, totals, orderedFields)
                  return cell ? <React.Fragment key={fieldName}>{cell}</React.Fragment> : null
                })}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

function BoeSummaryTable({
  assessableTotal,
  bcdTotal,
  swsTotal,
  igstTotal,
  interest,
  calcDutyTotal,
  boeAssessable,
  boeDutyPaid,
}: {
  assessableTotal: number
  bcdTotal: number
  swsTotal: number
  igstTotal: number
  interest: number
  calcDutyTotal: number
  boeAssessable?: number
  boeDutyPaid?: number
}) {
  const summaryRows = [
    {
      label: 'Assessable Total',
      calculated: assessableTotal,
      boe: boeAssessable ?? null,
      variance: boeAssessable != null ? assessableTotal - boeAssessable : null,
    },
    { label: 'BCD Total', calculated: bcdTotal, boe: null, variance: null },
    { label: 'SWS Total', calculated: swsTotal, boe: null, variance: null },
    { label: 'IGST Total', calculated: igstTotal, boe: null, variance: null },
    { label: 'Interest', calculated: interest, boe: null, variance: null },
    {
      label: 'Duty Total',
      calculated: calcDutyTotal,
      boe: boeDutyPaid ?? null,
      variance: boeDutyPaid != null ? calcDutyTotal - boeDutyPaid : null,
    },
  ]

  const handleExport = () => {
    downloadCsv(
      'boe-summary.csv',
      summaryRows.map((r) => ({
        Metric: r.label,
        Calculated: r.calculated,
        BOE: r.boe ?? '',
        Variance: r.variance ?? '',
      }))
    )
  }

  const handleExportXlsx = async () => await exportXlsx({ itemsRows: [], summary: summaryRows })

  const handlePrint = () => {
    console.log('🖨️ BoeSummaryTable handlePrint clicked')
    console.log('📊 Summary rows for print:', summaryRows)

    // Show a helpful message about popup blockers
    toast.info('Printing... If nothing happens, please allow popups for this site.', {
      duration: 3000,
    })

    printReport({ itemsRows: [], summary: summaryRows, title: 'BOE Summary' })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>BOE Summary & Variance</CardTitle>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleExport}
          >
            CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportXlsx}
          >
            Excel
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handlePrint}
          >
            Print
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Metric</TableHead>
                <TableHead className="text-right">Calculated</TableHead>
                <TableHead className="text-right">BOE</TableHead>
                <TableHead className="text-right">Variance (Calc - BOE)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaryRows.map((r) => (
                <TableRow key={r.label}>
                  <TableCell className="font-medium">{r.label}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(r.calculated)}</TableCell>
                  <TableCell className="text-right font-mono">{r.boe != null ? formatCurrency(r.boe) : '-'}</TableCell>
                  <TableCell className="text-right font-mono">
                    {r.variance != null ? formatCurrency(r.variance) : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

interface BoeSummaryClientProps {
  savedBoes: SavedBoe[]
  shipments: Shipment[]
  allBoes: BoeDetails[]
}

export function BoeSummaryClient({ savedBoes, shipments, allBoes }: BoeSummaryClientProps) {
  const [selectedSupplier, setSelectedSupplier] = React.useState<string>('')
  const [selectedInvoiceId, setSelectedInvoiceId] = React.useState<string>('')
  const [statusFilter, setStatusFilter] = React.useState<string>('All')
  const [pendingStatus, setPendingStatus] = React.useState<string>('')
  const [isUpdatingStatus, setIsUpdatingStatus] = React.useState<boolean>(false)

  const suppliers = React.useMemo(() => {
    const supplierSet = new Set(savedBoes.map((boe) => boe.supplierName))
    return Array.from(supplierSet)
  }, [savedBoes])

  const availableInvoices = React.useMemo(() => {
    if (!selectedSupplier) return []
    return savedBoes.filter(
      (boe) => boe.supplierName === selectedSupplier && (statusFilter === 'All' || boe.status === statusFilter)
    )
  }, [selectedSupplier, savedBoes, statusFilter])

  const selectedData = React.useMemo(() => {
    if (!selectedInvoiceId) return null
    const savedBoe = savedBoes.find((b) => b.id === selectedInvoiceId)
    if (!savedBoe) return null
    // NOTE: shipments passed earlier might exclude some; fetch fresh for summary
    const shipment = shipments.find((s) => s.id === savedBoe.shipmentId) || null
    const boeDetails = savedBoe.boeId ? allBoes.find((b) => b.id === savedBoe.boeId) || null : null

    const assessableTotal = savedBoe.calculationResult.calculatedItems.reduce((sum, it) => sum + it.assessableValue, 0)
    const { bcdTotal, swsTotal, igstTotal, interest, customsDutyTotal } = savedBoe.calculationResult

    return {
      savedBoe,
      shipment,
      boeDetails,
      assessableTotal,
      bcdTotal,
      swsTotal,
      igstTotal,
      interest,
      customsDutyTotal,
    }
  }, [selectedInvoiceId, savedBoes, shipments, allBoes])

  React.useEffect(() => {
    // Keep local pending status in sync when selection changes
    if (selectedData?.savedBoe?.status) {
      setPendingStatus(selectedData.savedBoe.status)
    } else {
      setPendingStatus('')
    }
  }, [selectedData?.savedBoe?.id, selectedData?.savedBoe?.status])

  const handleSupplierChange = (supplier: string) => {
    setSelectedSupplier(supplier)
    setSelectedInvoiceId('')
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 md:flex-row">
          <div className="grid w-full max-w-sm items-center gap-1.5">
            <Label htmlFor="supplier-select">Supplier</Label>
            <Select
              onValueChange={handleSupplierChange}
              value={selectedSupplier}
            >
              <SelectTrigger id="supplier-select">
                <SelectValue placeholder="Select a supplier" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem
                    key={s}
                    value={s}
                  >
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid w-full max-w-sm items-center gap-1.5">
            <Label htmlFor="invoice-select">Invoice</Label>
            <Select
              onValueChange={setSelectedInvoiceId}
              value={selectedInvoiceId}
              disabled={!selectedSupplier}
            >
              <SelectTrigger id="invoice-select">
                <SelectValue placeholder="Select an invoice" />
              </SelectTrigger>
              <SelectContent>
                {availableInvoices.map((inv) => (
                  <SelectItem
                    key={inv.id}
                    value={inv.id}
                  >
                    {inv.invoiceNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid w-full max-w-sm items-center gap-1.5">
            <Label htmlFor="status-filter">Status</Label>
            <Select
              onValueChange={setStatusFilter}
              value={statusFilter}
            >
              <SelectTrigger id="status-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {['All', 'Awaiting BOE Data', 'Discrepancy Found', 'Reconciled', 'Investigation', 'Closed'].map((s) => (
                  <SelectItem
                    key={s}
                    value={s}
                  >
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="mt-6 space-y-8">
        {selectedData ? (
          <>
            <ItemDetailsTable
              items={selectedData.savedBoe.calculationResult.calculatedItems}
              quantities={Object.fromEntries(
                (selectedData.shipment?.items ?? []).map((it: { partNo: string; qty?: number }) => [
                  it.partNo,
                  it.qty ?? 0,
                ])
              )}
              actualRatesByPart={Object.fromEntries(
                (selectedData.shipment?.items ?? []).map((it) => [
                  it.partNo,
                  {
                    bcdRate: it.actualBcdRate,
                    swsRate: it.actualSwsRate,
                    igstRate: it.actualIgstRate,
                  },
                ])
              )}
              methodByPart={Object.fromEntries(
                (selectedData.savedBoe.itemInputs ?? []).map((ii) => [ii.partNo, ii.calculationMethod])
              )}
            />
            <BoeSummaryTable
              assessableTotal={selectedData.assessableTotal}
              bcdTotal={selectedData.bcdTotal}
              swsTotal={selectedData.swsTotal}
              igstTotal={selectedData.igstTotal}
              interest={selectedData.interest}
              calcDutyTotal={selectedData.customsDutyTotal}
              boeAssessable={selectedData.boeDetails?.totalAssessmentValue}
              boeDutyPaid={selectedData.boeDetails?.dutyPaid}
            />
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Status <StatusBadge status={selectedData.savedBoe.status} />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end">
                  <div className="grid w-full max-w-xs items-center gap-1.5">
                    <Label htmlFor="status-change">Change Status</Label>
                    <Select
                      value={pendingStatus || selectedData.savedBoe.status}
                      onValueChange={setPendingStatus}
                    >
                      <SelectTrigger id="status-change">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {['Awaiting BOE Data', 'Discrepancy Found', 'Reconciled', 'Investigation', 'Closed'].map(
                          (s) => (
                            <SelectItem
                              key={s}
                              value={s}
                            >
                              {s}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    disabled={isUpdatingStatus || !pendingStatus || pendingStatus === selectedData.savedBoe.status}
                    onClick={async () => {
                      const idx = savedBoes.findIndex((b) => b.id === selectedData.savedBoe!.id)
                      if (idx < 0) return

                      const old = savedBoes[idx]
                      const next = {
                        ...old,
                        status: pendingStatus as SavedBoe['status'],
                      } as SavedBoe

                      savedBoes[idx] = next
                      setIsUpdatingStatus(true)
                      const toastId = toast.loading('Updating status...')
                      try {
                        await invoke('update_boe_status', { id: next.id, status: pendingStatus })
                        toast.success('Status updated', { id: toastId })
                      } catch {
                        savedBoes[idx] = old // revert
                        toast.error('Failed to update status', { id: toastId })
                      } finally {
                        setIsUpdatingStatus(false)
                      }
                    }}
                  >
                    {isUpdatingStatus ? 'Updating...' : 'Update Status'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Attached Documents</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {selectedData.savedBoe.attachments?.length ? (
                    <ul className="space-y-2">
                      {selectedData.savedBoe.attachments.map((att) => (
                        <li
                          key={att.id}
                          className="flex items-center justify-between rounded-md border p-2"
                        >
                          <div>
                            <a
                              className="text-blue-600 hover:underline"
                              href={convertFileSrc(att.url)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {att.fileName}
                            </a>
                            <div className="text-muted-foreground text-sm">
                              {att.documentType} • {new Date(att.uploadedAt).toLocaleString()}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            asChild
                          >
                            <a
                              href={convertFileSrc(att.url)}
                              download={att.fileName}
                            >
                              Download
                            </a>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-muted-foreground text-sm">No documents attached.</div>
                  )}
                  <Button
                    onClick={async () => {
                      console.log('📄 Starting BOE document upload process...')
                      console.log('📋 Selected BOE ID:', selectedData.savedBoe.id)

                      const picked = await openDialog({
                        multiple: false,
                        directory: false,
                        filters: [
                          {
                            name: 'Documents',
                            extensions: ['pdf', 'png', 'jpg', 'jpeg', 'xlsx', 'xls', 'csv', 'doc', 'docx'],
                          },
                        ],
                      })
                      console.log('📁 Picked file result:', picked)

                      if (!picked || Array.isArray(picked)) {
                        console.log('❌ No file selected or multiple files selected')
                        return
                      }

                      const srcPath = picked as string
                      console.log('📤 Source file path:', srcPath)

                      const toastId = toast.loading('Saving document...')
                      try {
                        console.log('🔄 Invoking backend command to save BOE attachment...')
                        console.log('📤 Sending parameters:', {
                          id: selectedData.savedBoe.id,
                          srcPath: srcPath,
                        })

                        const destPath = await invoke<string>('save_boe_attachment_file', {
                          id: selectedData.savedBoe.id,
                          srcPath: srcPath,
                        })
                        console.log('✅ Document saved successfully at:', destPath)

                        const idx = savedBoes.findIndex((b) => b.id === selectedData.savedBoe.id)
                        console.log('🔍 Found BOE at index:', idx)

                        if (idx >= 0) {
                          const current = savedBoes[idx]
                          const fileName = srcPath.split(/\\|\//).pop() || `file-${Date.now()}`
                          console.log('📝 Extracted filename:', fileName)

                          const att = {
                            id: `ATT-${Date.now()}`,
                            documentType: 'Attachment',
                            fileName,
                            url: destPath,
                            uploadedAt: new Date().toISOString(),
                          }
                          console.log('📎 Created attachment object:', att)

                          const next = {
                            ...current,
                            attachments: [...(current.attachments ?? []), att],
                          } as SavedBoe

                          savedBoes[idx] = next

                          console.log('💾 Saving attachment to database...')
                          await invoke('add_boe_attachment', { id: next.id, attachment: att })
                          console.log('✅ Attachment saved to database successfully')

                          toast.success('Document saved', { id: toastId, description: destPath })
                        } else {
                          console.error('❌ Failed to locate BOE in savedBoes array')
                          toast.error('Failed to locate BOE to attach', { id: toastId })
                        }
                      } catch (error) {
                        console.error('💥 Failed to save BOE document:', error)
                        console.error('Error details:', {
                          message: error instanceof Error ? error.message : String(error),
                          stack: error instanceof Error ? error.stack : undefined,
                        })
                        toast.error('Failed to save document', { id: toastId })
                      }
                    }}
                  >
                    Upload Document
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="text-muted-foreground py-12 text-center">
            <p>Please select a supplier and invoice to view the report.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
