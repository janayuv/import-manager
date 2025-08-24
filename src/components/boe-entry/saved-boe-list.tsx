/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/saved-boe-list.tsx (MODIFIED)   |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| Connected the "View" button's `onClick` handler to a new `onView` prop,      |
| which will be used to trigger the view dialog from the parent page.          |
================================================================================
*/
'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { SavedBoe } from '@/types/boe-entry'

/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/saved-boe-list.tsx (MODIFIED)   |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| Connected the "View" button's `onClick` handler to a new `onView` prop,      |
| which will be used to trigger the view dialog from the parent page.          |
================================================================================
*/

/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/saved-boe-list.tsx (MODIFIED)   |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| Connected the "View" button's `onClick` handler to a new `onView` prop,      |
| which will be used to trigger the view dialog from the parent page.          |
================================================================================
*/

/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/saved-boe-list.tsx (MODIFIED)   |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| Connected the "View" button's `onClick` handler to a new `onView` prop,      |
| which will be used to trigger the view dialog from the parent page.          |
================================================================================
*/

/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/saved-boe-list.tsx (MODIFIED)   |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| Connected the "View" button's `onClick` handler to a new `onView` prop,      |
| which will be used to trigger the view dialog from the parent page.          |
================================================================================
*/

/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/saved-boe-list.tsx (MODIFIED)   |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| Connected the "View" button's `onClick` handler to a new `onView` prop,      |
| which will be used to trigger the view dialog from the parent page.          |
================================================================================
*/

/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/saved-boe-list.tsx (MODIFIED)   |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| Connected the "View" button's `onClick` handler to a new `onView` prop,      |
| which will be used to trigger the view dialog from the parent page.          |
================================================================================
*/

interface SavedBoeListProps {
  savedBoes: SavedBoe[]
  onView: (boeId: string) => void
  onEdit: (boeId: string) => void
  onDelete: (boeId: string) => void
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(amount)
}

export function SavedBoeList({ savedBoes, onView, onEdit, onDelete }: SavedBoeListProps) {
  if (savedBoes.length === 0) {
    return null // Don't render anything if there are no saved BOEs
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Saved BOE Calculations</CardTitle>
        <CardDescription>Here is a list of all the BOE calculations you have saved.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-primary text-primary-foreground">
                <TableHead>Invoice Number</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Total Duty</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {savedBoes.map((boe) => (
                <TableRow key={boe.id}>
                  <TableCell className="font-medium">{boe.invoiceNumber}</TableCell>
                  <TableCell>{boe.supplierName}</TableCell>
                  <TableCell className="text-right">{formatCurrency(boe.calculationResult.customsDutyTotal)}</TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="custom-alert-action-ok"
                      onClick={() => onView(boe.id)}
                    >
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="custom-alert-action-orange"
                      onClick={() => onEdit(boe.id)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="custom-alert-action-cancel"
                      onClick={() => onDelete(boe.id)}
                    >
                      Delete
                    </Button>
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
