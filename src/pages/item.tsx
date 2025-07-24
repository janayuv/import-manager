// src/pages/item/index.tsx (NO CHANGES)
// This file remains the same.

import * as React from 'react';
import { toast } from 'sonner';
import { save, open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import type { Item } from '@/types/item';
import type { Option } from '@/types/options';
import { ItemForm } from '@/components/item/form';
import { ItemViewDialog } from '@/components/item/view';
import { getItemColumns } from '@/components/item/columns';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/item/data-table';
import { Upload, Download, Plus, FileOutput } from 'lucide-react';
import {
  initialUnits,
  initialCurrencies,
  initialCountries,
  initialBcdRates,
  initialSwsRates,
  initialIgstRates,
  initialCategories,
  initialEndUses,
  initialPurchaseUoms,
} from '@/components/item/data';
import { invoke } from '@tauri-apps/api/core';
import type { Supplier } from '@/types/supplier';
import { exportItemsToCsv, importItemsFromCsv } from '@/lib/csv-helpers';

export function ItemMasterPage() {
  const [items, setItems] = React.useState<Item[]>([]);
  const [suppliers, setSuppliers] = React.useState<Option[]>([]);
  const [isFormOpen, setFormOpen] = React.useState(false);
  const [isViewOpen, setViewOpen] = React.useState(false);
  const [selectedItem, setSelectedItem] = React.useState<Item | null>(null);
  const [itemToEdit, setItemToEdit] = React.useState<Item | null>(null);

  // State for creatable dropdowns
  const [units, setUnits] = React.useState<Option[]>(initialUnits);
  const [currencies, setCurrencies] = React.useState<Option[]>(initialCurrencies);
  const [countries, setCountries] = React.useState<Option[]>(initialCountries);
  const [bcdRates, setBcdRates] = React.useState<Option[]>(initialBcdRates);
  const [swsRates, setSwsRates] = React.useState<Option[]>(initialSwsRates);
  const [igstRates, setIgstRates] = React.useState<Option[]>(initialIgstRates);
  const [categories, setCategories] = React.useState<Option[]>(initialCategories);
  const [endUses, setEndUses] = React.useState<Option[]>(initialEndUses);
  const [purchaseUoms, setPurchaseUoms] = React.useState<Option[]>(initialPurchaseUoms);

  // State for the data table
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = React.useState({});
  const [globalFilter, setGlobalFilter] = React.useState('');

  const fetchItems = async () => {
    try {
      const fetchedItems: Item[] = await invoke('get_items');
      setItems(fetchedItems);
    } catch (error) {
      console.error("Failed to fetch items:", error);
      toast.error("Failed to load items from the database.");
    }
  };

  React.useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const fetchedSuppliers: Supplier[] = await invoke('get_suppliers');
        const supplierOptions = fetchedSuppliers.map(s => ({ value: s.id, label: s.supplierName }));
        setSuppliers(supplierOptions);
        await fetchItems();
      } catch (error) {
        console.error("Failed to load initial data:", error);
        toast.error("Could not load initial data from the database.");
      }
    };
    fetchInitialData();
  }, []);

  const handleOpenFormForEdit = (item: Item) => {
    setItemToEdit(item);
    setFormOpen(true);
  };
  
  const handleOpenFormForAdd = () => {
    setItemToEdit(null);
    setFormOpen(true);
  };

  const handleView = (item: Item) => {
    setSelectedItem(item);
    setViewOpen(true);
  };

  const handleSubmit = async (itemData: Omit<Item, 'id'>) => {
    try {
      if (itemToEdit) {
        const updatedItem = { ...itemData, id: itemToEdit.id };
        await invoke('update_item', { item: updatedItem });
        toast.success(`Item ${updatedItem.partNumber} updated.`);
      } else {
        const maxId = items.reduce((max, item) => {
            const num = parseInt(item.id.split('-')[1]);
            return num > max ? num : max;
        }, 0);
        const newId = `ITM-${(maxId + 1).toString().padStart(3, '0')}`;
        const newItem = { ...itemData, id: newId };
        await invoke('add_item', { item: newItem });
        toast.success(`Item ${newItem.partNumber} created.`);
      }
      fetchItems();
    } catch (error) {
      console.error("Failed to save item:", error);
      toast.error("Failed to save item.");
    }
    setFormOpen(false);
  };

  const handleExport = async (type: 'all' | 'selected') => {
    let dataToExport: Item[];
    if (type === 'selected') {
        dataToExport = table.getFilteredSelectedRowModel().rows.map(row => row.original);
    } else {
        dataToExport = table.getFilteredRowModel().rows.map(row => row.original);
    }

    if (dataToExport.length === 0) {
        toast.warning("No data available to export.");
        return;
    }
    
    try {
        const csv = exportItemsToCsv(dataToExport, suppliers);
        const filePath = await save({ defaultPath: `items-${type}.csv`, filters: [{ name: 'CSV', extensions: ['csv'] }] });
        if (filePath) {
            await invoke('write_text_file', { path: filePath, contents: csv });
            toast.success("Items exported successfully!");
        }
    } catch (err) {
        const error = err as Error;
        console.error("Failed to export items:", error);
        toast.error(`Failed to export items: ${error.message}`);
    }
  };

  const handleImport = async () => {
    try {
      const selectedPath = await open({
        multiple: false,
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      });

      if (typeof selectedPath === 'string') {
        const content = await readTextFile(selectedPath);
        const { newItems, skippedCount } = importItemsFromCsv(content, items, suppliers);

        if (skippedCount > 0) {
            toast.warning(`${skippedCount} duplicate items were skipped during import.`);
        }

        if (newItems.length > 0) {
            await Promise.all(newItems.map(item => invoke('add_item', { item })));
            toast.success(`${newItems.length} new items imported successfully!`);
            fetchItems();
        } else {
            toast.info("No new items to import.");
        }
      }
    } catch (err) {
      const error = err as Error;
      console.error("Failed to import items:", error);
      toast.error(`Failed to import items: ${error.message}`);
    }
  };

  const handleOptionCreate = (type: string, newOption: Option) => {
    const setters: Record<string, React.Dispatch<React.SetStateAction<Option[]>>> = {
        unit: setUnits, currency: setCurrencies, country: setCountries,
        bcd: setBcdRates, sws: setSwsRates, igst: setIgstRates,
        category: setCategories, endUse: setEndUses, purchaseUom: setPurchaseUoms
    };
    const setter = setters[type];
    if (setter) {
        setter(prev => [...prev, newOption]);
        toast.success(`New ${type} "${newOption.label}" created.`);
    }
  };

  const columns = React.useMemo(() => getItemColumns(suppliers, handleView, handleOpenFormForEdit), [suppliers]);

  const table = useReactTable({
    data: items,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      rowSelection,
      globalFilter,
    },
  });

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold">Item Master</h1>
        <div className="flex items-center gap-2">
           <Button onClick={handleImport} variant="outline"><Upload className="mr-2 h-4 w-4" />Import</Button>
           <Button onClick={() => handleExport('selected')} className="bg-primary text-primary-foreground" disabled={table.getFilteredSelectedRowModel().rows.length === 0}><FileOutput className="mr-2 h-4 w-4" />Export Selected</Button>
           <Button onClick={() => handleExport('all')} className="bg-primary text-primary-foreground"><Download className="mr-2 h-4 w-4" />Export All</Button>
           <Button onClick={handleOpenFormForAdd} className="bg-primary text-primary-foreground"><Plus className="mr-2 h-4 w-4" />Add New</Button>
        </div>
      </div>
      <DataTable 
        table={table} 
        filterPlaceholder="Search all items..."
      />
      <ItemForm 
        isOpen={isFormOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        itemToEdit={itemToEdit}
        suppliers={suppliers}
        units={units}
        currencies={currencies}
        countries={countries}
        bcdRates={bcdRates}
        swsRates={swsRates}
        igstRates={igstRates}
        categories={categories}
        endUses={endUses}
        purchaseUoms={purchaseUoms}
        onOptionCreate={handleOptionCreate}
      />
      <ItemViewDialog
        isOpen={isViewOpen}
        onOpenChange={setViewOpen}
        item={selectedItem}
        suppliers={suppliers}
      />
    </div>
  );
}
export default ItemMasterPage;