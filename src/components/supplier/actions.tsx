// src/pages/supplier/actions.tsx
// This component now takes onView, onEdit, and onDelete functions as props.
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Supplier } from '@/types/supplier';

interface SupplierActionsProps {
  supplier: Supplier;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export const SupplierActions = ({
  supplier,
  onView,
  onEdit,
  onDelete,
}: SupplierActionsProps) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="default" className="h-8 w-8 p-0" useAccentColor>
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem
          onClick={async () => {
            const id = String(supplier.id);
            try {
              await navigator.clipboard.writeText(id);
              toast.success('Copied', {
                description: `Supplier ID "${id}" copied to clipboard.`,
              });
            } catch (err) {
              console.error('Failed to copy supplier ID:', err);
              toast.error('Copy failed', {
                description: 'Could not copy supplier ID to the clipboard.',
              });
            }
          }}
        >
          Copy Supplier ID
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onView}>View details</DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}>Edit supplier</DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => {
            const confirmed = window.confirm(
              `Delete supplier "${supplier.supplierName}"? This will soft delete the record.`
            );
            if (!confirmed) return;
            onDelete();
          }}
        >
          Delete supplier
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
