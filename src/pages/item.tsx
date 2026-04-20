// src/pages/item/index.tsx
// react-table imports were unused in this refactored page
import { invoke } from '@tauri-apps/api/core';
import { openTextFile, save, writeTextFile } from '@/lib/tauri-bridge';
import {
  ArrowLeft,
  Download,
  FileOutput,
  Loader2,
  Plus,
  Upload,
  Settings,
} from 'lucide-react';
import Papa from 'papaparse';
import { useUnifiedNotifications } from '@/hooks/useUnifiedNotifications';

import * as React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { getItemColumns } from '@/components/item/columns';
import { ItemForm } from '@/components/item/form';
import { ItemViewDialog } from '@/components/item/view';
import { ModuleSettings } from '@/components/module-settings';
import { ResponsiveDataTable } from '@/components/ui/responsive-table';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

/** URL path for item view or edit (bookmarkable, browser back/forward). */
export function itemDetailPath(itemId: string, mode: 'view' | 'edit') {
  return `/item-master/${encodeURIComponent(itemId)}/${mode}`;
}

/** URL path to create a new item (full page). */
export const itemMasterNewPath = '/item-master/new';

export function ItemMasterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { itemId: itemIdParam } = useParams<{ itemId: string }>();

  const { settings } = useSettings();
  const notifications = useUnifiedNotifications();
  const [items, setItems] = React.useState<Item[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isSettingsOpen, setSettingsOpen] = React.useState(false);

  const itemPanel = React.useMemo((): 'none' | 'view' | 'edit' | 'add' => {
    if (location.pathname === itemMasterNewPath) return 'add';
    if (!itemIdParam) return 'none';
    if (location.pathname.endsWith('/edit')) return 'edit';
    if (location.pathname.endsWith('/view')) return 'view';
    return 'none';
  }, [itemIdParam, location.pathname]);

  const decodedItemId = React.useMemo(() => {
    if (!itemIdParam) return null;
    try {
      return decodeURIComponent(itemIdParam);
    } catch {
      return itemIdParam;
    }
  }, [itemIdParam]);

  const selectedItemFromUrl = React.useMemo(() => {
    if (!decodedItemId) return null;
    return items.find(i => i.id === decodedItemId) ?? null;
  }, [items, decodedItemId]);

  const closeItemPanel = React.useCallback(() => {
    navigate('/item-master');
  }, [navigate]);

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
    navigate(itemMasterNewPath);
  };

  const handleOpenFormForEdit = React.useCallback(
    (item: Item) => {
      navigate(itemDetailPath(item.id, 'edit'));
    },
    [navigate]
  );

  const handleView = React.useCallback(
    (item: Item) => {
      navigate(itemDetailPath(item.id, 'view'));
    },
    [navigate]
  );

  const handleSubmit = async (data: Omit<Item, 'id'>) => {
    try {
      const existingId = (data as Partial<Item>).id;
      if (existingId) {
        await invoke('update_item', {
          item: { ...(data as Item), id: existingId },
        });
        notifications.item.updated(data.partNumber);
      } else {
        const createPayload = { ...(data as Partial<Item>) };
        delete createPayload.id;
        await invoke('add_item', { item: createPayload });
        notifications.item.created(data.partNumber);
      }
      fetchItems();
      if (itemPanel === 'edit' || itemPanel === 'add') {
        navigate('/item-master');
      }
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
        supplierName: 'Sample Supplier',
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
      const selectedFile = await openTextFile({
        multiple: false,
        filters: [
          {
            name: 'CSV Files',
            extensions: ['csv'],
          },
        ],
      });

      if (!selectedFile) {
        notifications.info(
          'No File Selected',
          'No file was selected for import.'
        );
        return;
      }

      const { contents: csvText, name: fileName } = selectedFile;
      const { newItems, skippedCount, validationResult } = importItemsFromCsv(
        csvText,
        items,
        suppliers
      );

      if (!validationResult.isValid) {
        console.error(
          'Item import validation errors:',
          validationResult.errors
        );
        notifications.item.error(
          'import',
          'CSV validation failed. Please review the file and try again.'
        );
        return;
      }

      if (validationResult.warnings.length > 0) {
        console.warn('Item import warnings:', validationResult.warnings);
        notifications.warning(
          'Import Warnings',
          `${validationResult.warnings.length} warning(s) detected while importing ${
            fileName ?? 'the selected file'
          }.`
        );
      }

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

  const settingsDialog = (
    <Dialog open={isSettingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-5xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Item Master Module Settings</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto pr-2">
          <ModuleSettings
            moduleName="itemMaster"
            moduleTitle="Item Master"
            onClose={() => setSettingsOpen(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );

  if (itemPanel !== 'none') {
    return (
      <div className="from-background to-muted/20 flex min-h-screen flex-col bg-gradient-to-br">
        <div className="container mx-auto flex min-h-0 flex-1 flex-col px-4 py-6">
          <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              useAccentColor
              onClick={closeItemPanel}
              className="gap-2"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Back to items
            </Button>
            <span className="text-muted-foreground text-sm">
              {itemPanel === 'view'
                ? 'Viewing item record'
                : itemPanel === 'edit'
                  ? 'Editing item record'
                  : 'Adding new item'}
            </span>
          </div>

          {loading ? (
            <div
              className="border-border bg-card text-muted-foreground flex min-h-[240px] w-full max-w-[min(calc(100vw-2rem),120rem)] flex-1 items-center justify-center self-center rounded-xl border text-sm shadow-sm"
              role="status"
              aria-live="polite"
            >
              Loading…
            </div>
          ) : itemPanel === 'add' ? (
            <div className="border-border bg-card flex min-h-0 w-full max-w-[min(calc(100vw-2rem),120rem)] flex-1 flex-col self-center overflow-hidden rounded-xl border shadow-sm">
              <ItemForm
                isOpen={true}
                presentation="page"
                className="min-h-0 flex-1"
                onOpenChange={open => {
                  if (!open) closeItemPanel();
                }}
                onSubmit={handleSubmit}
                itemToEdit={null}
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
            </div>
          ) : !selectedItemFromUrl ? (
            <div className="border-border bg-card mx-auto flex w-full max-w-lg flex-col gap-4 rounded-xl border p-8 shadow-sm">
              <h2 className="text-card-foreground text-lg font-semibold">
                Item not found
              </h2>
              <p className="text-muted-foreground text-sm">
                No item with ID{' '}
                <span className="text-foreground font-mono">
                  {decodedItemId ?? itemIdParam}
                </span>
                .
              </p>
              <Button
                type="button"
                variant="default"
                useAccentColor
                onClick={closeItemPanel}
                className="w-fit"
              >
                Back to items
              </Button>
            </div>
          ) : itemPanel === 'view' ? (
            <div className="border-border bg-card flex min-h-0 w-full max-w-[min(calc(100vw-2rem),120rem)] flex-1 flex-col self-center overflow-hidden rounded-xl border shadow-sm">
              <ItemViewDialog
                isOpen={true}
                onOpenChange={open => {
                  if (!open) closeItemPanel();
                }}
                item={selectedItemFromUrl}
                suppliers={suppliers}
                presentation="page"
                className="min-h-0 flex-1"
                onEdit={() =>
                  navigate(itemDetailPath(selectedItemFromUrl.id, 'edit'))
                }
              />
            </div>
          ) : (
            <div className="border-border bg-card flex min-h-0 w-full max-w-[min(calc(100vw-2rem),120rem)] flex-1 flex-col self-center overflow-hidden rounded-xl border shadow-sm">
              <ItemForm
                isOpen={true}
                presentation="page"
                className="min-h-0 flex-1"
                onOpenChange={open => {
                  if (!open) closeItemPanel();
                }}
                onSubmit={handleSubmit}
                itemToEdit={selectedItemFromUrl}
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
            </div>
          )}
        </div>
        {settingsDialog}
      </div>
    );
  }

  if (loading && itemPanel === 'none') {
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
        variant="default"
        useAccentColor
        disabled={true}
      >
        <FileOutput className="mr-2 h-4 w-4" />
        Export Selected
      </Button>
      <Button onClick={() => handleExport()} variant="default" useAccentColor>
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
          <Button
            variant="default"
            size="icon"
            onClick={() => setSettingsOpen(true)}
            className="h-10 w-10"
            useAccentColor
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            onClick={handleOpenFormForAdd}
            variant="default"
            useAccentColor
          >
            <Plus className="mr-2 h-4 w-4" />
            Add New
          </Button>
          <Button
            onClick={handleDownloadTemplate}
            variant="default"
            useAccentColor
          >
            <Download className="mr-2 h-4 w-4" />
            Template
          </Button>
          <Button onClick={handleImport} variant="default" useAccentColor>
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

      {settingsDialog}
    </div>
  );
}
export default ItemMasterPage;
