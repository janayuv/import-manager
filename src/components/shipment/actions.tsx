// src/components/shipment/actions.tsx (NEW FILE)
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Shipment } from '@/types/shipment';

interface ShipmentActionsProps {
  shipment: Shipment;
  onView: () => void;
  onEdit: () => void;
}

export const ShipmentActions = ({ shipment, onView, onEdit }: ShipmentActionsProps) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0 text-[#ff9900] hover:bg-[#8aff80]/10" >
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem className="hover:text-[#ffff80]" onClick={() => navigator.clipboard.writeText(shipment.id)} >
          Copy Shipment ID
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="hover:text-[#ffff80]" onClick={onView}>View details</DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}>Edit shipment</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};