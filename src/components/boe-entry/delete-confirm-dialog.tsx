/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/delete-confirm-dialog.tsx (NEW) |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| A confirmation dialog to prevent accidental deletion of saved BOE records.   |
================================================================================
*/
'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { SavedBoe } from '@/types/boe-entry'

/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/delete-confirm-dialog.tsx (NEW) |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| A confirmation dialog to prevent accidental deletion of saved BOE records.   |
================================================================================
*/

/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/delete-confirm-dialog.tsx (NEW) |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| A confirmation dialog to prevent accidental deletion of saved BOE records.   |
================================================================================
*/

/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/delete-confirm-dialog.tsx (NEW) |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| A confirmation dialog to prevent accidental deletion of saved BOE records.   |
================================================================================
*/

/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/delete-confirm-dialog.tsx (NEW) |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| A confirmation dialog to prevent accidental deletion of saved BOE records.   |
================================================================================
*/

/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/delete-confirm-dialog.tsx (NEW) |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| A confirmation dialog to prevent accidental deletion of saved BOE records.   |
================================================================================
*/

/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/delete-confirm-dialog.tsx (NEW) |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| A confirmation dialog to prevent accidental deletion of saved BOE records.   |
================================================================================
*/

interface DeleteConfirmDialogProps {
  boe: SavedBoe
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteConfirmDialog({ boe, onConfirm, onCancel }: DeleteConfirmDialogProps) {
  return (
    <AlertDialog open={true} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the BOE calculation for
            invoice <span className="font-semibold">{boe.invoiceNumber}</span>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Yes, delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
