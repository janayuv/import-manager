// src/components/boe/columns.tsx (MODIFIED)
import { type ColumnDef } from "@tanstack/react-table"
import type { BoeDetails } from "@/types/boe"
import { MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// This type was the source of the error. It's now corrected.
interface GetBoeColumnsProps {
  onView: (boe: BoeDetails) => void;
  onEdit: (boe: BoeDetails) => void;
  onDelete: (boe: BoeDetails) => void;
}

export const getBoeColumns = ({ onView, onEdit, onDelete }: GetBoeColumnsProps): ColumnDef<BoeDetails>[] => [
    {
        accessorKey: "beNumber",
        header: "BE No.",
    },
    {
        accessorKey: "beDate",
        header: "BE Date",
        cell: ({ row }) => new Date(row.original.beDate).toLocaleDateString('en-GB'),
    },
    {
        accessorKey: "location",
        header: "Location",
    },
    {
        accessorKey: "totalAssessmentValue",
        header: "Total Assessment Value",
    },
    {
        accessorKey: "dutyAmount",
        header: "Duty Amount",
    },
    {
        accessorKey: "paymentDate",
        header: "Payment Date",
        cell: ({ row }) => row.original.paymentDate ? new Date(row.original.paymentDate).toLocaleDateString('en-GB') : '-',
    },
    {
        accessorKey: "dutyPaid",
        header: "Duty Paid",
    },
    {
        accessorKey: "challanNumber",
        header: "Challan No.",
    },
    {
        accessorKey: "refId",
        header: "Ref ID",
    },
    {
        accessorKey: "transactionId",
        header: "Transaction ID",
    },
    {
        id: "actions",
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