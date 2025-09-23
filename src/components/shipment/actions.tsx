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
  onMarkAsDelivered?: () => void;
}

export const ShipmentActions = ({
  shipment,
  onView,
  onEdit,
  onMarkAsDelivered,
}: ShipmentActionsProps) => {
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
          className="hover:text-warning"
          onClick={() => navigator.clipboard.writeText(shipment.id)}
        >
          Copy Shipment ID
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="hover:text-warning" onClick={onView}>
          View details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}>Edit shipment</DropdownMenuItem>
        {shipment.status !== 'delivered' && onMarkAsDelivered && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="hover:text-success"
              onClick={onMarkAsDelivered}
            >
              Mark as Delivered
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
