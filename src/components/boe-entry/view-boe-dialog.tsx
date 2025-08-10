/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/view-boe-dialog.tsx (NEW)       |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| A new component that displays the details of a saved BOE in a dialog box.    |
| It reuses the `CalculationResults` component for a consistent UI.            |
================================================================================
*/
'use client'

import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { SavedBoe } from '@/types/boe-entry'

import { CalculationResults } from './calculation-results'

/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/view-boe-dialog.tsx (NEW)       |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| A new component that displays the details of a saved BOE in a dialog box.    |
| It reuses the `CalculationResults` component for a consistent UI.            |
================================================================================
*/

/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/view-boe-dialog.tsx (NEW)       |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| A new component that displays the details of a saved BOE in a dialog box.    |
| It reuses the `CalculationResults` component for a consistent UI.            |
================================================================================
*/

/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/view-boe-dialog.tsx (NEW)       |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| A new component that displays the details of a saved BOE in a dialog box.    |
| It reuses the `CalculationResults` component for a consistent UI.            |
================================================================================
*/

interface ViewBoeDialogProps {
  boe: SavedBoe
  onClose: () => void
}

export function ViewBoeDialog({ boe, onClose }: ViewBoeDialogProps) {
  const handleExport = () => {
    // Placeholder for backend export logic
    toast.info('Export function not yet implemented.')
  }

  return (
    <Dialog open={true} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="!max-w-4xl">
        <DialogHeader>
          <DialogTitle>View BOE Details</DialogTitle>
          <DialogDescription>
            Calculation summary for Invoice #{boe.invoiceNumber} from {boe.supplierName}.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto py-4">
          <CalculationResults results={boe.calculationResult} />
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="secondary" onClick={handleExport} className="custom-alert-action-ok">
            Export to CSV
          </Button>
          <Button onClick={onClose} className="custom-alert-action-cancel">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
