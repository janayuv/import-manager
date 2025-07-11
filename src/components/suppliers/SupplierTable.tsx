// src/components/suppliers/SupplierTable.tsx
import React from "react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
} from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";
import type { Supplier } from "@/types/supplier";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SupplierTableProps {
  data: Supplier[];
  onRowClick: (supplier: Supplier) => void;
  isLoading?: boolean;
}

export const SupplierTable: React.FC<SupplierTableProps> = ({
  data,
  onRowClick,
  isLoading = false,
}) => {
    const columns: ColumnDef<Supplier>[] = [
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => (
        <div className="font-mono text-xs text-muted-foreground">
          {row.getValue("id")}
        </div>
      ),
    },
    {
      accessorKey: "supplierName",
      header: "Supplier",
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue("supplierName")}</div>
      ),
    },
    {
      accessorKey: "shortName",
      header: "Short Name",
      cell: ({ row }) => (
        <div className="text-muted-foreground">{row.getValue("shortName")}</div>
      ),
    },
    {
      accessorKey: "country",
      header: "Country",
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs">
          {row.getValue("country")}
        </Badge>
      ),
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => (
        <a
          href={`mailto:${row.getValue("email")}`}
          className="text-blue-600 hover:underline dark:text-blue-400"
        >
          {row.getValue("email") ?? "—"}
        </a>
      ),
    },
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ row }) => (
        <a
          href={`tel:${row.getValue("phone")}`}
          className="text-foreground hover:underline"
        >
          {row.getValue("phone") ?? "—"}
        </a>
      ),
    },
    {
      accessorKey: "beneficiaryName",
      header: "Beneficiary",
      cell: ({ row }) => (
        <div className="text-sm">{row.getValue("beneficiaryName")}</div>
      ),
    },
    {
      accessorKey: "bankName",
      header: "Bank",
      cell: ({ row }) => (
        <div className="text-sm">{row.getValue("bankName")}</div>
      ),
    },
    {
      accessorKey: "branch",
      header: "Branch",
      cell: ({ row }) => (
        <div className="text-sm text-muted-foreground">
          {row.getValue("branch")}
        </div>
      ),
    },
    {
      accessorKey: "accountNo",
      header: "Account No",
      cell: ({ row }) => (
        <div className="font-mono text-xs">{row.getValue("accountNo")}</div>
      ),
    },
    {
      accessorKey: "iban",
      header: "IBAN",
      cell: ({ row }) => (
        <div className="font-mono text-xs">{row.getValue("iban")}</div>
      ),
    },
    {
      accessorKey: "swiftCode",
      header: "SWIFT",
      cell: ({ row }) => (
        <div className="font-mono text-xs">{row.getValue("swiftCode")}</div>
      ),
    },
        {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => {
        const active = row.getValue("isActive") as boolean;
        return (
          <Badge variant={active ? "default" : "secondary"} className="text-xs">
            {active ? "Active" : "Inactive"}
          </Badge>
        );
      },
    },
  ];


  const [globalFilter, setGlobalFilter] = React.useState<string>("");
  const [sorting, setSorting] = React.useState<any[]>([]);

  const table = useReactTable({
    data,
    columns,
    state: {
      globalFilter,
      sorting,
    },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center py-4">
          <Skeleton className="h-10 w-full max-w-sm" />
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((_, idx) => (
                  <TableHead key={idx}>
                    <Skeleton className="h-4 w-24" />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between px-2">
          <Skeleton className="h-4 w-40" />
          <div className="flex items-center space-x-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search all fields..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="pl-9 max-w-sm"
        />
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table className="min-w-full">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const isSorted = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        "cursor-pointer hover:bg-muted/50 whitespace-nowrap",
                        header.column.columnDef.meta?.headerClassName
                      )}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {isSorted === "asc" ? (
                          <ChevronUp className="ml-1 h-4 w-4" />
                        ) : isSorted === "desc" ? (
                          <ChevronDown className="ml-1 h-4 w-4" />
                        ) : null}
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onRowClick(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        "py-3 whitespace-nowrap",
                        cell.column.columnDef.meta?.cellClassName
                      )}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No suppliers found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
        <div className="text-sm text-muted-foreground">
          Showing {table.getRowModel().rows.length} of {data.length} suppliers
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};
