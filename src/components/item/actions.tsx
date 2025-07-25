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
import type { Item } from '@/types/item';

interface ItemActionsProps {
  item: Item;
  onView: () => void;
  onEdit: () => void;
}

export const ItemActions = ({ item, onView, onEdit }: ItemActionsProps) => {
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
        <DropdownMenuItem onClick={() => navigator.clipboard.writeText(item.id)}>
          Copy Item ID
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onView}>View details</DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}>Edit item</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};