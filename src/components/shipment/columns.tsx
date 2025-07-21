// src/components/shipment/columns.tsx (MODIFIED)
// Moved the SortIndicator component here to resolve the Fast Refresh warning.
import type { ColumnDef } from '@tanstack/react-table';
import type { Shipment } from '@/types/shipment';
import type { Option } from '@/types/options';
import { Checkbox } from '@/components/ui/checkbox';
import { ShipmentActions } from './actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SortIndicator } from './sort-indicator';



export const getShipmentColumns = (
    suppliers: Option[],
    onView: (shipment: Shipment) => void,
    onEdit: (shipment: Shipment) => void
): ColumnDef<Shipment>[] => [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        className="accent-primary"
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        className="accent-primary"
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'supplierId',
    header: 'Supplier',
    cell: ({ row }) => {
        const supplierId = row.getValue('supplierId') as string;
        const supplier = suppliers.find(s => s.value === supplierId);
        return supplier ? supplier.label : 'Unknown';
    }
  },
  {
    accessorKey: 'invoiceNumber',
    header: ({ column }) => (<Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>Invoice No<SortIndicator column={column} /></Button>),
  },
  {
    accessorKey: 'invoiceDate',
    header: ({ column }) => (<Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>Date<SortIndicator column={column} /></Button>),
  },
  { accessorKey: 'goodsCategory', header: 'Goods Category' },
  { accessorKey: 'invoiceCurrency', header: 'Currency' },
  { accessorKey: 'invoiceValue', header: 'Invoice Value' },
  { accessorKey: 'incoterm', header: 'Incoterm' },
  { accessorKey: 'vesselName', header: 'Vessel' },
  { accessorKey: 'blAwbNumber', header: 'BL/AWB No' },
  {
    accessorKey: 'etd',
    header: ({ column }) => (<Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>ETD<SortIndicator column={column} /></Button>),
  },
  {
    accessorKey: 'eta',
    header: ({ column }) => (<Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>ETA<SortIndicator column={column} /></Button>),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
        const status = row.getValue('status') as string;
        if (!status) return null;
        const statusLabel = status.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        return <Badge variant="outline">{statusLabel}</Badge>;
    }
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <ShipmentActions
        shipment={row.original}
        onView={() => onView(row.original)}
        onEdit={() => onEdit(row.original)}
      />
    ),
  },
];