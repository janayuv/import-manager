// src/pages/supplier/actions.tsx
// This component now takes onView, onEdit, and onDelete functions as props.
import { MoreHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Supplier } from '@/types/supplier'

interface SupplierActionsProps {
  supplier: Supplier
  onView: () => void
  onEdit: () => void
}

export const SupplierActions = ({ supplier, onView, onEdit }: SupplierActionsProps) => {
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
        <DropdownMenuItem
          onClick={() => {
            const toCopy = supplier.id
            const input = document.createElement('textarea')
            input.value = toCopy
            document.body.appendChild(input)
            input.select()
            document.execCommand('copy')
            document.body.removeChild(input)
          }}
        >
          Copy Supplier ID
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onView}>View details</DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}>Edit supplier</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
