/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/calculation-results.tsx         |
| (MODIFIED)                                                                   |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| Updated to import all types from the new central `src/types` file.           |
================================================================================
*/

'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
// Minimal shape used here to avoid cross-branch type drift
type CalculationResult = {
  bcdTotal?: number
  swsTotal?: number
  igstTotal?: number
  totalDuty?: number
  totalAmount?: number
  items?: Array<Record<string, unknown>>
  calculatedItems?: Array<Record<string, unknown>>
  exchangeRate?: number
  calculationDate?: string
}

/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/calculation-results.tsx         |
| (MODIFIED)                                                                   |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| Updated to import all types from the new central `src/types` file.           |
================================================================================
*/

interface CalculationResultsProps {
  results: unknown
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

// Define proper types for the calculation items
interface CalculationItem {
  description?: string
  assessableValue?: number
  bcd?: number
  igst?: number
  compCess?: number
  total?: number
  [key: string]: unknown // Allow additional properties
}

export function CalculationResults({ results }: CalculationResultsProps) {
  const r = results as CalculationResult
  const detailItems = (r.items ?? (r as Record<string, unknown>).calculatedItems ?? []) as CalculationItem[]
  const safeNum = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0)
  const safeStr = (v: unknown): string => (typeof v === 'string' ? v : '')
  const bcdTotal = safeNum((r as Record<string, unknown>).bcdTotal)
  const swsTotal = safeNum((r as Record<string, unknown>).swsTotal)
  const igstTotal = safeNum((r as Record<string, unknown>).igstTotal)
  const interest = safeNum((r as Record<string, unknown>).interest)
  const totalDuty =
    safeNum((r as Record<string, unknown>).totalDuty) ||
    safeNum((r as Record<string, unknown>).customsDutyTotal) ||
    bcdTotal + swsTotal + igstTotal + interest
  return (
    <div className="mt-12 space-y-8">
      {/* --- Totals Summary --- */}
      <Card>
        <CardHeader>
          <CardTitle>Calculation Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-center md:grid-cols-4">
            <div>
              <p className="text-muted-foreground text-sm">BCD Total</p>
              <p className="text-xl font-bold">{formatCurrency(bcdTotal)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">SWS Total</p>
              <p className="text-xl font-bold">{formatCurrency(swsTotal)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">IGST Total</p>
              <p className="text-xl font-bold">{formatCurrency(igstTotal)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Total Duty</p>
              <p className="text-xl font-bold">{formatCurrency(totalDuty)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* --- Detailed Breakdown --- */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Assessable Value</TableHead>
                <TableHead className="text-right">BCD</TableHead>
                <TableHead className="text-right">SWS</TableHead>
                <TableHead className="text-right">IGST</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detailItems.map((item, index) => {
                const description = safeStr(item.description) || `Item ${index + 1}`
                const assessableValue = safeNum(item.assessableValue)
                const bcd = safeNum(item.bcd ?? item.bcdValue)
                const sws = safeNum((item as Record<string, unknown>).sws ?? (item as Record<string, unknown>).swsValue)
                const igst = safeNum(item.igst ?? item.igstValue)
                const total = safeNum((item as Record<string, unknown>).total) || assessableValue + bcd + sws + igst
                return (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{description}</TableCell>
                    <TableCell className="text-right">{formatCurrency(assessableValue)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(bcd)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(sws)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(igst)}</TableCell>
                    <TableCell className="text-right font-bold">{formatCurrency(total)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* --- Additional Information --- */}
      <Card>
        <CardHeader>
          <CardTitle>Additional Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <h4 className="mb-2 font-semibold">Exchange Rate</h4>
              <p className="text-muted-foreground">USD 1 = INR {r.exchangeRate?.toFixed(2) || 'N/A'}</p>
            </div>
            <div>
              <h4 className="mb-2 font-semibold">Calculation Date</h4>
              <p className="text-muted-foreground">
                {r.calculationDate ? new Date(r.calculationDate).toLocaleDateString('en-IN') : 'N/A'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
