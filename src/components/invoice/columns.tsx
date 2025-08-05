// src/components/invoice/columns.tsx (MODIFIED - Formats tax numbers as percentages)
import type { ColumnDef } from '@tanstack/react-table';
import type { FlattenedInvoiceLine } from '@/types/invoice';
import { Badge } from '@/components/ui/badge';
import { InvoiceLineActions } from './actions';

interface GetInvoiceColumnsProps {
  onView: (invoiceId: string) => void;
  onEdit: (invoiceId: string) => void;
  onDelete: (invoiceId: string, invoiceNumber: string) => void;
}

const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

// The columns now expect the flattened data structure
export const getInvoiceColumns = ({ onView, onEdit, onDelete }: GetInvoiceColumnsProps): ColumnDef<FlattenedInvoiceLine>[] => [
  { 
    id: 'actions',
    cell: ({ row }) => <InvoiceLineActions lineItem={row.original} onView={onView} onEdit={onEdit} onDelete={onDelete} />,
  },
  { accessorKey: 'supplierName', header: 'Supplier Name' },
  { accessorKey: 'invoiceNumber', header: 'Invoice No' },
  { 
    accessorKey: 'invoiceDate', 
    header: 'Invoice Date',
    cell: ({ row }) => {
        return new Date(row.original.invoiceDate).toLocaleDateString('en-GB');
    }
  },
  { accessorKey: 'partNumber', header: 'Part No' },
  { accessorKey: 'itemDescription', header: 'Description' },
  { accessorKey: 'hsnCode', header: 'HS.Code' },
  { accessorKey: 'currency', header: 'Currency' },
  { accessorKey: 'unit', header: 'Unit' },
  { accessorKey: 'quantity', header: 'Qty' },
  {
    accessorKey: 'unitPrice',
    header: 'Unit Price',
    cell: ({ row }) => formatCurrency(row.original.unitPrice, row.original.currency),
  },
  {
    accessorKey: 'lineTotal',
    header: 'Line Total',
    cell: ({ row }) => formatCurrency(row.original.lineTotal, row.original.currency),
  },
  // FIX: Added a cell renderer to display the BCD number as a percentage
  { 
    accessorKey: 'bcd',
    header: 'BCD',
    cell: ({ row }) => `${row.original.bcd}%`,
  },
  // FIX: Added a cell renderer to display the IGST number as a percentage
  {
    accessorKey: 'igst',
    header: 'IGST',
    cell: ({ row }) => `${row.original.igst}%`,
  },
  {
    accessorKey: 'invoiceTotal',
    header: 'Invoice Total',
    cell: ({ row }) => formatCurrency(row.original.invoiceTotal, row.original.currency),
  },
  {
  accessorKey: 'status',
  header: 'Status',
  cell: ({ row }) => {
    const status = row.original.status as 'Draft' | 'Finalized' | 'Mismatch';

    const colorClass = {
      Draft: 'bg-orange-400 text-gray-800',
      Finalized: 'bg-green-600 text-gray-800',
      Mismatch: 'bg-red-400 text-red-100',
    }[status] ?? 'bg-gray-100 text-gray-800'; // fallback

    return (
      <Badge className={colorClass}>
        {status}
      </Badge>
    );
  },
}

];