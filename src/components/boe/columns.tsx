// src/components/boe/columns.tsx (CORRECTED)
import { MoreHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatDateForDisplay } from '@/lib/date-format'
import type { BoeDetails } from '@/types/boe'
import { type ColumnDef } from '@tanstack/react-table'

// Helper function to safely parse "DD-MM-YYYY" and format it for display
const formatDate = (dateString: string | undefined | null): string => {
  if (!dateString) {
    return 'N/A'
  }

  const parts = dateString.split('-')
  if (parts.length !== 3) {
    return dateString // Return original if format is not as expected
  }

  const [day, month, year] = parts
  // Create a date from the YYYY-MM-DD format, which is universally understood
  const date = new Date(`${year}-${month}-${day}`)

  if (isNaN(date.getTime())) {
    return 'Invalid Date'
  }

  // Format back to DD-MM-YYYY using a reliable method
  return date.toLocaleDateString('en-GB')
}

// Helper function to format currency values for India
const formatCurrency = (value: number | string | undefined | null): string => {
  const amount = Number(value)
  if (isNaN(amount)) {
    return '-'
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount)
}

interface GetBoeColumnsProps {
  onView: (boe: BoeDetails) => void
  onEdit: (boe: BoeDetails) => void
  onDelete: (boe: BoeDetails) => void
}

export const getBoeColumns = ({
  onView,
  onEdit,
  onDelete,
}: GetBoeColumnsProps): ColumnDef<BoeDetails>[] => [
  {
    accessorKey: 'beNumber',
    header: 'BE No.',
  },
  {
    accessorKey: 'beDate',
    header: 'BE Date',
    cell: ({ row }) => formatDateForDisplay(row.original.beDate),
  },
  {
    accessorKey: 'location',
    header: 'Location',
  },
  {
    accessorKey: 'totalAssessmentValue',
    header: 'Total Assessment Value',
    cell: ({ row }) => formatCurrency(row.original.totalAssessmentValue),
  },
  {
    accessorKey: 'dutyAmount',
    header: 'Duty Amount',
    cell: ({ row }) => formatCurrency(row.original.dutyAmount),
  },
  {
    accessorKey: 'paymentDate',
    header: 'Payment Date',
    cell: ({ row }) => formatDate(row.original.paymentDate),
  },
  {
    accessorKey: 'dutyPaid',
    header: 'Duty Paid',
    cell: ({ row }) => formatCurrency(row.original.dutyPaid),
  },
  {
    accessorKey: 'challanNumber',
    header: 'Challan No.',
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const boe = row.original
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
            <DropdownMenuItem onClick={() => onView(boe)}>View</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(boe)}>Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete(boe)}>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]
