// src/components/item/columns.tsx (MODIFIED - Changed SelectOption to Option)
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import type { Item } from '@/types/item'
// FIX: Changed `SelectOption` to `Option` to match the actual type definition.
import type { Option } from '@/types/options'
import type { ColumnDef } from '@tanstack/react-table'

import { ItemActions } from './actions'

export const getItemColumns = (
  suppliers: Option[],
  onView: (item: Item) => void,
  onEdit: (item: Item) => void
): ColumnDef<Item>[] => [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        className="accent-primary"
        checked={
          table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
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
  },
  {
    accessorKey: 'partNumber',
    header: 'Part Number',
  },
  {
    accessorKey: 'itemDescription',
    header: 'Description',
  },
  {
    accessorKey: 'currency',
    header: 'Currency',
  },
  {
    accessorKey: 'unitPrice',
    header: 'Unit Price',
  },
  {
    accessorKey: 'hsnCode',
    header: 'HSN Code',
  },
  {
    accessorKey: 'supplierId',
    header: 'Supplier',
    cell: ({ row }) => {
      const supplierId = row.getValue('supplierId') as string
      const supplier = suppliers.find((s) => s.value === supplierId)
      return supplier ? supplier.label : 'N/A'
    },
  },
  {
    accessorKey: 'isActive',
    header: 'Status',
    cell: ({ row }) => {
      const isActive = row.getValue('isActive')
      return (
        <Badge className={isActive ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}>
          {isActive ? 'Active' : 'Inactive'}
        </Badge>
      )
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <ItemActions
        item={row.original}
        onView={() => onView(row.original)}
        onEdit={() => onEdit(row.original)}
      />
    ),
  },
]
