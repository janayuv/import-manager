/*
================================================================================
| FILE: src/app/dashboard/shipments/columns.tsx                                |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| Defines the columns for the shipments data table.                            |
================================================================================
*/
'use client'

import type { ColumnDef } from '@tanstack/react-table'

import { Badge } from '@/components/ui/badge'
import type { Shipment } from '@/types/shipment'

import { DataTableRowActions } from './actions'

/*
================================================================================
| FILE: src/app/dashboard/shipments/columns.tsx                                |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| Defines the columns for the shipments data table.                            |
================================================================================
*/

/*
================================================================================
| FILE: src/app/dashboard/shipments/columns.tsx                                |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| Defines the columns for the shipments data table.                            |
================================================================================
*/

/*
================================================================================
| FILE: src/app/dashboard/shipments/columns.tsx                                |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| Defines the columns for the shipments data table.                            |
================================================================================
*/

/*
================================================================================
| FILE: src/app/dashboard/shipments/columns.tsx                                |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| Defines the columns for the shipments data table.                            |
================================================================================
*/

/*
================================================================================
| FILE: src/app/dashboard/shipments/columns.tsx                                |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| Defines the columns for the shipments data table.                            |
================================================================================
*/

/*
================================================================================
| FILE: src/app/dashboard/shipments/columns.tsx                                |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| Defines the columns for the shipments data table.                            |
================================================================================
*/

export const columns: ColumnDef<Shipment>[] = [
  {
    accessorKey: 'id',
    header: 'ID',
    cell: ({ row }) => <div className="font-medium">{row.getValue('id')}</div>,
  },
  {
    accessorKey: 'supplierName',
    header: 'Supplier',
  },
  {
    accessorKey: 'invoiceNumber',
    header: 'Invoice #',
  },
  {
    accessorKey: 'invoiceValue',
    header: 'Invoice Value',
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue('invoiceValue'))
      const currency = row.original.invoiceCurrency

      return (
        <div className="text-right font-mono">
          {new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: currency,
          }).format(amount)}
        </div>
      )
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue('status') as string
      return (
        <div className="text-center">
          <Badge
            variant={status === 'Delivered' ? 'default' : 'secondary'}
            className={` ${
              status === 'Delivered'
                ? 'bg-success/10 text-success hover:bg-success/20'
                : 'bg-info/10 text-info hover:bg-info/20'
            } `}
          >
            {status}
          </Badge>
        </div>
      )
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
  },
  {
    id: 'actions',
    cell: () => <DataTableRowActions />,
  },
]
