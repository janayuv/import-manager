// src/components/invoice/actions.tsx (MODIFIED - Added Delete action)
import { MoreHorizontal, Pencil, View, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import type { FlattenedInvoiceLine } from "@/types/invoice";

interface InvoiceLineActionsProps {
  lineItem: FlattenedInvoiceLine;
  onView: (invoiceId: string) => void;
  onEdit: (invoiceId: string) => void;
  onDelete: (invoiceId: string, invoiceNumber: string) => void;
}

export function InvoiceLineActions({ lineItem, onView, onEdit, onDelete }: InvoiceLineActionsProps) {
  const isFinalized = lineItem.status === 'Finalized';
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
        <DropdownMenuItem onClick={() => onView(lineItem.invoiceId)}>
          <View className="mr-2 h-4 w-4" /> View
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEdit(lineItem.invoiceId)} disabled={isFinalized}>
          <Pencil className="mr-2 h-4 w-4" /> Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onDelete(lineItem.invoiceId, lineItem.invoiceNumber)} className="text-red-600">
            <Trash2 className="mr-2 h-4 w-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}