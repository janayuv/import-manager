// src/pages/item/index.tsx
// react-table imports were unused in this refactored page
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { Download, FileOutput, Loader2, Plus, Upload } from 'lucide-react';
import Papa from 'papaparse';
import { useUnifiedNotifications } from '@/hooks/useUnifiedNotifications';

import * as React from 'react';

import { getItemColumns } from '@/components/item/columns';
import { ItemForm } from '@/components/item/form';
import { ItemViewDialog } from '@/components/item/view';
import { ResponsiveDataTable } from '@/components/ui/responsive-table';
import { Button } from '@/components/ui/button';
import { exportItemsToCsv, importItemsFromCsv } from '@/lib/csv-helpers';
import { formatText } from '@/lib/settings';
import { useSettings } from '@/lib/use-settings';
import type { Item } from '@/types/item';
import type { Option } from '@/types/options';
import type { Supplier } from '@/types/supplier';

// A map to help manage option types, their state setters, and backend commands
const optionConfigs = {
  unit: { setter: 'setUnits', fetcher: 'get_units', adder: 'add_unit' },
  currency: {
    setter: 'setCurrencies',
    fetcher: 'get_currencies',
    adder: 'add_currency',
  },
  country: {
    setter: 'setCountries',
    fetcher: 'get_countries',
    adder: 'add_country',
  },
  bcd: {
    setter: 'setBcdRates',
    fetcher: 'get_bcd_rates',
    adder: 'add_bcd_rate',
  },
  sws: {
    setter: 'setSwsRates',
    fetcher: 'get_sws_rates',
    adder: 'add_sws_rate',
  },
  igst: {
    setter: 'setIgstRates',
    fetcher: 'get_igst_rates',
    adder: 'add_igst_rate',
  },
  category: {
    setter: 'setCategories',
    fetcher: 'get_categories',
    adder: 'add_category',
  },
  endUse: {
    setter: 'setEndUses',
    fetcher: 'get_end_uses',
    adder: 'add_end_use',
  },
  purchaseUom: {
    setter: 'setPurchaseUoms',
    fetcher: 'get_purchase_uoms',
    adder: 'add_purchase_uom',
  },
};

export function ItemMasterPage() {
  const { settings } = useSettings();
  const notifications = useUnifiedNotifications();
  const [items, setItems] = React.useState<Item[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isFormOpen, setFormOpen] = React.useState(false);
  const [isViewOpen, setViewOpen] = React.useState(false);
  const [itemToEdit, setItemToEdit] = React.useState<Item | null>(null);
  const [selectedItem, setSelectedItem] = React.useState<Item | null>(null);

  // Options state
  const [suppliers, setSuppliers] = React.useState<Option[]>([]);
  const [units, setUnits] = React.useState<Option[]>([]);
  const [currencies, setCurrencies] = React.useState<Option[]>([]);
  const [countries, setCountries] = React.useState<Option[]>([]);
  const [bcdRates, setBcdRates] = React.useState<Option[]>([]);
  const [swsRates, setSwsRates] = React.useState<Option[]>([]);
  const [igstRates, setIgstRates] = React.useState<Option[]>([]);
  const [categories, setCategories] = React.useState<Option[]>([]);
  const [endUses, setEndUses] = React.useState<Option[]>([]);
  const [purchaseUoms, setPurchaseUoms] = React.useState<Option[]>([]);

  const stateSetters: Record<
    string,
    React.Dispatch<React.SetStateAction<Option[]>>
  > = {
    setUnits,
    setCurrencies,
    setCountries,
    setBcdRates,
    setSwsRates,
    setIgstRates,
    setCategories,
    setEndUses,
    setPurchaseUoms,
  };

  const fetchItems = React.useCallback(async () => {
    try {
      const fetchedItems = await invoke<Item[]>('get_items');
      setItems(fetchedItems);
    } catch (error) {
      console.error('Failed to fetch items:', error);
      notifications.item.error('fetch', String(error));
    }
  }, [notifications.item]);

  const fetchOptions = React.useCallback(async () => {
    try {
      const [
        suppliersData,
        unitsData,
        currenciesData,
        countriesData,
        bcdRatesData,
        swsRatesData,
        igstRatesData,
        categoriesData,
        endUsesData,
        purchaseUomsData,
      ] = await Promise.all([
        invoke<Supplier[]>('get_suppliers'),
        invoke<Option[]>('get_units'),
        invoke<Option[]>('get_currencies'),
        invoke<Option[]>('get_countries'),
        invoke<Option[]>('get_bcd_rates'),
        invoke<Option[]>('get_sws_rates'),
        invoke<Option[]>('get_igst_rates'),
        invoke<Option[]>('get_categories'),
        invoke<Option[]>('get_end_uses'),
        invoke<Option[]>('get_purchase_uoms'),
      ]);

      // Convert suppliers to options format
      const supplierOptions = suppliersData.map(s => ({
        value: s.id,
        label: formatText(s.supplierName, settings.textFormat),
      }));

      setSuppliers(supplierOptions);
      setUnits(unitsData);
      setCurrencies(currenciesData);
      setCountries(countriesData);
      setBcdRates(bcdRatesData);
      setSwsRates(swsRatesData);
      setIgstRates(igstRatesData);
      setCategories(categoriesData);
      setEndUses(endUsesData);
      setPurchaseUoms(purchaseUomsData);
    } catch (error) {
      console.error('Failed to fetch options:', error);
      notifications.item.error('load options', String(error));
    }
  }, [settings.textFormat, notifications.item]);

  React.useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchItems(), fetchOptions()]);
      setLoading(false);
    };
    loadData();
  }, [fetchItems, fetchOptions]);

  const handleOpenFormForAdd = () => {
    setItemToEdit(null);
    setFormOpen(true);
  };

  const handleOpenFormForEdit = React.useCallback((item: Item) => {
    setItemToEdit(item);
    setFormOpen(true);
  }, []);

  const handleView = React.useCallback((item: Item) => {
    setSelectedItem(item);
    setViewOpen(true);
  }, []);

  const handleSubmit = async (data: Omit<Item, 'id'>, id?: string) => {
    try {
      if (id) {
        await invoke('update_item', { item: { id, ...data } });
        notifications.item.updated(data.partNumber);
      } else {
        await invoke('add_item', { item: data });
        notifications.item.created(data.partNumber);
      }
      fetchItems();
      setFormOpen(false);
    } catch (error) {
      console.error('Failed to save item:', error);
      notifications.item.error('save', String(error));
    }
  };

  const handleExport = async () => {
    try {
      const itemsToExport = items;
      if (itemsToExport.length === 0) {
        notifications.warning('No Items to Export', 'No items to export.');
        return;
      }

      const csv = exportItemsToCsv(itemsToExport, suppliers);
      const filePath = await save({
        filters: [
          {
            name: 'CSV Files',
            extensions: ['csv'],
          },
        ],
      });

      if (filePath) {
        await writeTextFile(filePath, csv);
        notifications.item.exported(itemsToExport.length);
      }
    } catch (error) {
      console.error('Failed to export items:', error);
      notifications.item.error('export', String(error));
    }
  };

  const handleDownloadTemplate = async () => {
    const templateData = [
      {
        partNumber: 'ITEM001',
        itemDescription: 'Sample Item Description',
        unit: 'PCS',
        currency: 'USD',
        unitPrice: '100.00',
        hsnCode: '8471',
        supplierId: 'SUP001',
        countryOfOrigin: 'USA',
        bcd: '7.5',
        sws: '5.0',
        igst: '18.0',
        technicalWriteUp: 'Technical specifications...',
        category: 'Electronics',
        endUse: 'Industrial',
        netWeightKg: '1.5',
        purchaseUom: 'PCS',
        grossWeightPerUomKg: '1.8',
      },
    ];

    const csv = Papa.unparse(templateData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'item-import-template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    notifications.success(
      'Template Downloaded',
      'Item Master import template downloaded successfully!'
    );
  };

  const handleImport = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'CSV Files',
            extensions: ['csv'],
          },
        ],
      });

      if (selected) {
        const csvText = await readTextFile(selected as string);
        const { newItems, skippedCount } = await importItemsFromCsv(
          csvText,
          items,
          suppliers
        );

        if (skippedCount > 0) {
          notifications.warning(
            'Import Warning',
            `${skippedCount} duplicate items were skipped.`
          );
        }

        if (newItems.length > 0) {
          const itemsForBackend = newItems.map(item => ({
            ...item,
            bcd:
              item.bcd !== undefined && item.bcd !== null
                ? String(item.bcd)
                : undefined,
            sws:
              item.sws !== undefined && item.sws !== null
                ? String(item.sws)
                : undefined,
            igst:
              item.igst !== undefined && item.igst !== null
                ? String(item.igst)
                : undefined,
          }));

          await invoke('add_items_bulk', { items: itemsForBackend });
          notifications.item.imported(newItems.length);
          fetchItems();
        } else {
          notifications.info('No New Data', 'No new items to import.');
        }
      }
    } catch (err) {
      const error = err as Error;
      console.error('Failed to import items:', error);
      notifications.item.error('import', error.message);
    }
  };

  const handleOptionCreate = async (type: string, newOption: Option) => {
    const config = optionConfigs[type as keyof typeof optionConfigs];
    if (!config) return;

    try {
      await invoke(config.adder, { option: newOption });
      notifications.success(
        'Option Added',
        `New ${type} "${newOption.label}" has been saved.`
      );

      const updatedOptions: Option[] = await invoke(config.fetcher);
      const setter = stateSetters[config.setter];
      if (setter) {
        setter(updatedOptions);
      }
    } catch (error) {
      console.error(`Failed to save new ${type}:`, error);
      notifications.error('Save Failed', `Failed to save new ${type}.`);
    }
  };

  const columns = React.useMemo(
    () =>
      getItemColumns(suppliers, handleView, handleOpenFormForEdit, settings),
    [suppliers, handleView, handleOpenFormForEdit, settings]
  );

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin" />
      </div>
    );
  }

  const statusActions = (
    <div className="flex items-center gap-2">
      <Button
        onClick={() => handleExport()}
        variant="secondary"
        disabled={true}
      >
        <FileOutput className="mr-2 h-4 w-4" />
        Export Selected
      </Button>
      <Button onClick={() => handleExport()} variant="info">
        <Download className="mr-2 h-4 w-4" />
        Export All
      </Button>
    </div>
  );

  return (
    <div className="container mx-auto py-10">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-blue-600">Item Master</h1>
          <p className="text-muted-foreground mt-1">
            Manage product catalog and item specifications
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleOpenFormForAdd} variant="default">
            <Plus className="mr-2 h-4 w-4" />
            Add New
          </Button>
          <Button onClick={handleDownloadTemplate} variant="secondary">
            <Download className="mr-2 h-4 w-4" />
            Template
          </Button>
          <Button onClick={handleImport} variant="success">
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
        </div>
      </div>

      <ResponsiveDataTable
        columns={columns}
        data={items}
        searchPlaceholder="Search all items..."
        showSearch={true}
        showPagination={true}
        pageSize={settings.modules?.itemMaster?.itemsPerPage || 10}
        className=""
        hideColumnsOnSmall={[
          'unit',
          'currency',
          'countryOfOrigin',
          'category',
          'endUse',
        ]}
        columnWidths={{
          partNumber: { minWidth: '120px', maxWidth: '150px' },
          itemDescription: { minWidth: '200px', maxWidth: '300px' },
          unit: { minWidth: '80px', maxWidth: '100px' },
          currency: { minWidth: '80px', maxWidth: '100px' },
          unitPrice: { minWidth: '100px', maxWidth: '120px' },
          hsnCode: { minWidth: '100px', maxWidth: '120px' },
          supplierId: { minWidth: '120px', maxWidth: '150px' },
          countryOfOrigin: { minWidth: '120px', maxWidth: '150px' },
          bcd: { minWidth: '80px', maxWidth: '100px' },
          sws: { minWidth: '80px', maxWidth: '100px' },
          igst: { minWidth: '80px', maxWidth: '100px' },
          category: { minWidth: '100px', maxWidth: '120px' },
          endUse: { minWidth: '100px', maxWidth: '120px' },
          actions: { minWidth: '120px', maxWidth: '150px' },
        }}
        statusActions={statusActions}
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
