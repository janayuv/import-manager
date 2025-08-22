// @ts-nocheck
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
import type { CalculationResult } from '@/types/boe-entry'

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
  results: CalculationResult
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function CalculationResults({ results }: CalculationResultsProps) {
  return (
    <div className="mt-12 space-y-8">
      {/* --- Totals Summary --- */}
      <Card>
        <CardHeader>
          <CardTitle>Calculation Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-center md:grid-cols-5">
            <div>
              <p className="text-muted-foreground text-sm">BCD Total</p>
              <p className="text-xl font-bold">{formatCurrency(results.bcdTotal)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">IGST Total</p>
              <p className="text-xl font-bold">{formatCurrency(results.igstTotal)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Comp. Cess</p>
              <p className="text-xl font-bold">{formatCurrency(results.compCessTotal)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Total Duty</p>
              <p className="text-xl font-bold">{formatCurrency(results.totalDuty)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Total Amount</p>
              <p className="text-xl font-bold">{formatCurrency(results.totalAmount)}</p>
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
                <TableHead className="text-right">IGST</TableHead>
                <TableHead className="text-right">Comp. Cess</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.items.map((item, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{item.description}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.assessableValue)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.bcd)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.igst)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.compCess)}</TableCell>
                  <TableCell className="text-right font-bold">{formatCurrency(item.total)}</TableCell>
                </TableRow>
              ))}
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
              <p className="text-muted-foreground">USD 1 = INR {results.exchangeRate?.toFixed(2) || 'N/A'}</p>
            </div>
            <div>
              <h4 className="mb-2 font-semibold">Calculation Date</h4>
              <p className="text-muted-foreground">
                {results.calculationDate ? new Date(results.calculationDate).toLocaleDateString('en-IN') : 'N/A'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
