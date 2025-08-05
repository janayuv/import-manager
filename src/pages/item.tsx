// src/pages/item/index.tsx (MODIFIED - Fixed missing ID and hook dependency)

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
import { Upload, Download, Plus, FileOutput, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { Supplier } from '@/types/supplier';
import { exportItemsToCsv, importItemsFromCsv } from '@/lib/csv-helpers';

// A map to help manage option types, their state setters, and backend commands
const optionConfigs = {
    unit: { setter: 'setUnits', fetcher: 'get_units', adder: 'add_unit' },
    currency: { setter: 'setCurrencies', fetcher: 'get_currencies', adder: 'add_currency' },
    country: { setter: 'setCountries', fetcher: 'get_countries', adder: 'add_country' },
    bcd: { setter: 'setBcdRates', fetcher: 'get_bcd_rates', adder: 'add_bcd_rate' },
    sws: { setter: 'setSwsRates', fetcher: 'get_sws_rates', adder: 'add_sws_rate' },
    igst: { setter: 'setIgstRates', fetcher: 'get_igst_rates', adder: 'add_igst_rate' },
    category: { setter: 'setCategories', fetcher: 'get_categories', adder: 'add_category' },
    endUse: { setter: 'setEndUses', fetcher: 'get_end_uses', adder: 'add_end_use' },
    purchaseUom: { setter: 'setPurchaseUoms', fetcher: 'get_purchase_uoms', adder: 'add_purchase_uom' },
};

export function ItemMasterPage() {
  const [items, setItems] = React.useState<Item[]>([]);
  const [suppliers, setSuppliers] = React.useState<Option[]>([]);
  const [isFormOpen, setFormOpen] = React.useState(false);
  const [isViewOpen, setViewOpen] = React.useState(false);
  const [selectedItem, setSelectedItem] = React.useState<Item | null>(null);
  const [itemToEdit, setItemToEdit] = React.useState<Item | null>(null);
  const [loading, setLoading] = React.useState(true);

  // State for creatable dropdowns, initialized as empty
  const [units, setUnits] = React.useState<Option[]>([]);
  const [currencies, setCurrencies] = React.useState<Option[]>([]);
  const [countries, setCountries] = React.useState<Option[]>([]);
  const [bcdRates, setBcdRates] = React.useState<Option[]>([]);
  const [swsRates, setSwsRates] = React.useState<Option[]>([]);
  const [igstRates, setIgstRates] = React.useState<Option[]>([]);
  const [categories, setCategories] = React.useState<Option[]>([]);
  const [endUses, setEndUses] = React.useState<Option[]>([]);
  const [purchaseUoms, setPurchaseUoms] = React.useState<Option[]>([]);

  const stateSetters: Record<string, React.Dispatch<React.SetStateAction<Option[]>>> = React.useMemo(() => ({
    setUnits, setCurrencies, setCountries, setBcdRates, setSwsRates, setIgstRates, setCategories, setEndUses, setPurchaseUoms
  }), []);

  // State for the data table
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = React.useState({});
  const [globalFilter, setGlobalFilter] = React.useState('');

  const fetchItems = React.useCallback(async () => {
    const fetchedItems: Item[] = await invoke('get_items');
    setItems(fetchedItems);
  }, []);

  const fetchInitialData = React.useCallback(async () => {
    setLoading(true);
    try {
        const supplierData: Supplier[] = await invoke('get_suppliers');
        setSuppliers(supplierData.map(s => ({ value: s.id, label: s.supplierName })));
        
        const optionPromises = Object.values(optionConfigs).map(config => invoke<Option[]>(config.fetcher));
        const allOptions = await Promise.all(optionPromises);
        
        Object.keys(optionConfigs).forEach((key, index) => {
            const configKey = key as keyof typeof optionConfigs;
            const setterName = optionConfigs[configKey].setter;
            const setter = stateSetters[setterName];
            if (setter) {
                setter(allOptions[index]);
            }
        });

        await fetchItems();
    } catch (error) {
        console.error("Failed to load initial data:", error);
        toast.error("Could not load initial data from the database.");
    } finally {
        setLoading(false);
    }
  }, [fetchItems, stateSetters]);

  React.useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

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
        await invoke('update_item', { item: { ...itemData, id: itemToEdit.id } });
        toast.success(`Item ${itemData.partNumber} updated.`);
      } else {
        const newId = `ITM-${Date.now()}`;
        await invoke('add_item', { item: { ...itemData, id: newId } });
        toast.success(`Item ${itemData.partNumber} created.`);
      }
      fetchItems();
    } catch (error) {
      console.error("Failed to save item:", error);
      toast.error(`Failed to save item: ${(error as Error).message}`);
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
      const selectedPath = await open({ multiple: false, filters: [{ name: 'CSV', extensions: ['csv'] }] });
      if (typeof selectedPath === 'string') {
        const content = await readTextFile(selectedPath);
        const { newItems, skippedCount } = importItemsFromCsv(content, items, suppliers);
        if (skippedCount > 0) toast.warning(`${skippedCount} duplicate items were skipped.`);
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

  const handleOptionCreate = async (type: string, newOption: Option) => {
    const config = optionConfigs[type as keyof typeof optionConfigs];
    if (!config) return;

    try {
        await invoke(config.adder, { option: newOption });
        toast.success(`New ${type} "${newOption.label}" has been saved.`);
        
        const updatedOptions: Option[] = await invoke(config.fetcher);
        const setter = stateSetters[config.setter];
        if (setter) {
            setter(updatedOptions);
        }
    } catch (error) {
        console.error(`Failed to save new ${type}:`, error);
        toast.error(`Failed to save new ${type}.`);
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
    state: { sorting, columnFilters, rowSelection, globalFilter },
  });

  if (loading) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="h-16 w-16 animate-spin" /></div>
  }

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold">Item Master</h1>
        <div className="flex items-center gap-2">
           <Button onClick={handleImport} variant="outline" className="custom-alert-action-ok"><Upload className="mr-2 h-4 w-4" />Import</Button>
           <Button onClick={() => handleExport('selected')} className="custom-alert-action-cancel" disabled={table.getFilteredSelectedRowModel().rows.length === 0}><FileOutput className="mr-2 h-4 w-4" />Export Selected</Button>
           <Button onClick={() => handleExport('all')} className="custom-alert-action-cancel"><Download className="mr-2 h-4 w-4" />Export All</Button>
           <Button onClick={handleOpenFormForAdd} className="custom-alert-action-ok"><Plus className="mr-2 h-4 w-4" />Add New</Button>
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
