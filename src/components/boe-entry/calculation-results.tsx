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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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

/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/calculation-results.tsx         |
| (MODIFIED)                                                                   |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| Updated to import all types from the new central `src/types` file.           |
================================================================================
*/

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
              <p className="text-muted-foreground text-sm">SWS Total</p>
              <p className="text-xl font-bold">{formatCurrency(results.swsTotal)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">IGST Total</p>
              <p className="text-xl font-bold">{formatCurrency(results.igstTotal)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Interest</p>
              <p className="text-xl font-bold">{formatCurrency(results.interest)}</p>
            </div>
            <div className="bg-primary/10 col-span-2 rounded-lg p-4 md:col-span-1">
              <p className="text-primary text-sm">Total Duty Payable</p>
              <p className="text-primary text-2xl font-extrabold">
                {formatCurrency(results.customsDutyTotal)}
              </p>
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
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Part No</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Assessable Value</TableHead>
                  <TableHead className="text-right">BCD</TableHead>
                  <TableHead className="text-right">SWS</TableHead>
                  <TableHead className="text-right">IGST</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.calculatedItems.map((item) => (
                  <TableRow key={item.partNo}>
                    <TableCell className="font-medium">{item.partNo}</TableCell>
                    <TableCell>{item.description}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.assessableValue)}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(item.bcdValue)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.swsValue)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.igstValue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
