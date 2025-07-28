// src/pages/supplier/page.tsx
// This is the main page component that assembles everything and manages state.
import * as React from 'react';
import type { Column, ColumnDef } from '@tanstack/react-table';
import { SupplierDataTable } from '@/components/supplier/table';
import { AddSupplierForm } from '@/components/supplier/form';
import { ViewSupplierDialog } from '@/components/supplier/view';  
import { EditSupplierDialog } from '@/components/supplier/edit';
import type { Supplier } from '@/types/supplier';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { SupplierActions } from '@/components/supplier/actions';  
import { invoke } from '@tauri-apps/api/core';

const SupplierPage = () => {
    const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
    const [isViewOpen, setViewOpen] = React.useState(false);
    const [isEditOpen, setEditOpen] = React.useState(false);
    const [selectedSupplier, setSelectedSupplier] = React.useState<Supplier | null>(null);

    const fetchSuppliers = async () => {
        try {
            const fetchedSuppliers: Supplier[] = await invoke('get_suppliers');
            setSuppliers(fetchedSuppliers);
        } catch (error) {
            console.error("Failed to fetch suppliers:", error);
            // Here you could show a toast notification to the user
        }
    };

    // Fetch suppliers when the component mounts
    React.useEffect(() => {
        fetchSuppliers();
    }, []);

    const handleView = (supplier: Supplier) => {
        setSelectedSupplier(supplier);
        setViewOpen(true);
    };

    const handleEdit = (supplier: Supplier) => {
        setSelectedSupplier(supplier);
        setEditOpen(true);
    };

    const handleAdd = async (newSupplierData: Omit<Supplier, 'id'>) => {
        const maxId = suppliers.reduce((max, s) => {
            const num = parseInt(s.id.split('-')[1]);
            return num > max ? num : max;
        }, 0);
        const newId = `Sup-${(maxId + 1).toString().padStart(3, '0')}`;
        
        const newSupplier: Supplier = { id: newId, ...newSupplierData };

        try {
            await invoke('add_supplier', { supplier: newSupplier });
            fetchSuppliers(); // Refetch the list to show the new supplier
        } catch (error) {
            console.error("Failed to add supplier:", error);
        }
    };

    const handleSave = async (updatedSupplier: Supplier) => {
        try {
            await invoke('update_supplier', { supplier: updatedSupplier });
            fetchSuppliers(); // Refetch the list to show the updated data
        } catch (error) {
            console.error("Failed to update supplier:", error);
        }
    };

    // Component to render the correct sorting icon
    const SortIndicator = ({ column }: { column: Column<Supplier, unknown> }) => {
        const sorted = column.getIsSorted();
        if (sorted === 'asc') return <ArrowUp className="ml-2 h-4 w-4" />;
        if (sorted === 'desc') return <ArrowDown className="ml-2 h-4 w-4" />;
        return <ArrowUpDown className="ml-2 h-4 w-4" />;
    };
    
    // Define columns here to give them access to the handler functions
    const columns: ColumnDef<Supplier>[] = [
        {
            id: 'select',
            header: ({ table }) => (
              <Checkbox
                checked={
                  table.getIsAllPageRowsSelected() ||
                  (table.getIsSomePageRowsSelected() && "indeterminate")
                }
                onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                aria-label="Select all"
              />
            ),
            cell: ({ row }) => (
              <Checkbox
                checked={row.getIsSelected()}
                onCheckedChange={(value) => row.toggleSelected(!!value)}
                aria-label="Select row"
              />
            ),
            enableSorting: false,
            enableHiding: false,
        },
        {
            accessorKey: 'id',
            header: ({ column }) => (
                <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
                    Supplier ID
                    <SortIndicator column={column} />
                </Button>
            ),
        },
        {
            accessorKey: 'supplierName',
            header: ({ column }) => (
                <Button variant="ghost"  onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
                    Supplier Name
                    <SortIndicator column={column} />
                </Button>
            ),
        },
        { accessorKey: 'shortName', header: 'Short Name' },
        {
            accessorKey: 'country',
            header: ({ column }) => (
                <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
                    Country
                    <SortIndicator column={column} />
                </Button>
            ),
        },
        { accessorKey: 'phone', header: 'Phone' },
        {
          accessorKey: 'isActive',
          header: 'Status',
          cell: ({ row }) => {
            const isActive = row.getValue('isActive');
            return (
              <Badge className={isActive ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}>
                {isActive ? 'Active' : 'Inactive'}
              </Badge>
            );
          },
        },
        {
            id: 'actions',
            cell: ({ row }) => (
                <SupplierActions 
                    supplier={row.original} 
                    onView={() => handleView(row.original)}
                    onEdit={() => handleEdit(row.original)}
                />
            ),
        },
    ];

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold">Suppliers</h1>
        <AddSupplierForm onAdd={handleAdd} />
      </div>
      <SupplierDataTable columns={columns} data={suppliers} />
      <ViewSupplierDialog isOpen={isViewOpen} onOpenChange={setViewOpen} supplier={selectedSupplier} />
      <EditSupplierDialog isOpen={isEditOpen} onOpenChange={setEditOpen} supplier={selectedSupplier} onSave={handleSave} />
    </div>
  );
};

export default SupplierPage;
