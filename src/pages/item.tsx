// src/pages/item/index.tsx
import { safeInvoke as invoke } from '@/lib/ipc-safe';
import { openTextFile, save, writeTextFile } from '@/lib/tauri-bridge';
import { Download, Loader2, Plus, Upload, Settings } from 'lucide-react';
import Papa from 'papaparse';
import { useUnifiedNotifications } from '@/hooks/useUnifiedNotifications';

import * as React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { ItemDataTable } from '@/components/item/table-item';
import { ItemForm } from '@/components/item/form';
import { ItemViewDialog } from '@/components/item/view';
import { ModuleSettings } from '@/components/module-settings';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createItemColumns } from '@/pages/item-columns';
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

  // List view filter/pagination state
  const [searchValue, setSearchValue] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState('');
  const [supplierFilter, setSupplierFilter] = React.useState('');
  const [currentPage, setCurrentPage] = React.useState(1);
  const PAGE_SIZE = 50;

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
    () => createItemColumns(suppliers, handleView, handleOpenFormForEdit),
    [suppliers, handleView, handleOpenFormForEdit]
  );

  const filteredItems = React.useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    return items.filter(item => {
      if (q) {
        const match =
          item.partNumber.toLowerCase().includes(q) ||
          item.itemDescription.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (categoryFilter && item.category !== categoryFilter) return false;
      if (supplierFilter && item.supplierId !== supplierFilter) return false;
      return true;
    });
  }, [items, searchValue, categoryFilter, supplierFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedItems = filteredItems.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const handleClearFilters = () => {
    setSearchValue('');
    setCategoryFilter('');
    setSupplierFilter('');
    setCurrentPage(1);
  };

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchValue, categoryFilter, supplierFilter]);

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
      <div className="im-page">
        <div
          style={{
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            borderBottom: '1px solid var(--color-im-rule)',
            flexShrink: 0,
            background: 'var(--color-im-sub)',
          }}
        >
          <button
            type="button"
            className="im-btn im-btn--sm"
            onClick={closeItemPanel}
          >
            ← Back to items
          </button>
          <span style={{ color: 'var(--color-im-faint)', fontSize: 12 }}>
            {itemPanel === 'view'
              ? 'Viewing item record'
              : itemPanel === 'edit'
                ? 'Editing item record'
                : 'Adding new item'}
          </span>
        </div>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'auto',
          }}
        >
          {loading ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-im-faint)',
                fontSize: 13,
                fontFamily: 'var(--font-im-mono)',
              }}
              role="status"
              aria-live="polite"
            >
              LOADING…
            </div>
          ) : itemPanel === 'add' ? (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
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
            <div
              style={{
                maxWidth: 480,
                margin: '32px auto',
                padding: 24,
                background: 'var(--color-im-panel)',
                border: '1px solid var(--color-im-rule)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <h2
                style={{
                  fontFamily: 'var(--font-im-mono)',
                  fontSize: 13,
                  color: 'var(--color-im-text)',
                  letterSpacing: '0.05em',
                }}
              >
                ITEM NOT FOUND
              </h2>
              <p style={{ fontSize: 12, color: 'var(--color-im-faint)' }}>
                No item with ID{' '}
                <span style={{ fontFamily: 'var(--font-im-mono)' }}>
                  {decodedItemId ?? itemIdParam}
                </span>
                .
              </p>
              <button
                type="button"
                className="im-btn"
                onClick={closeItemPanel}
                style={{ alignSelf: 'flex-start' }}
              >
                ← Back to items
              </button>
            </div>
          ) : itemPanel === 'view' ? (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
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
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
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
      <div
        className="im-page"
        style={{ alignItems: 'center', justifyContent: 'center' }}
      >
        <Loader2
          style={{ width: 32, height: 32, color: 'var(--color-im-accent)' }}
          className="animate-spin"
        />
      </div>
    );
  }

  return (
    <div className="im-supplier-page">
      <div className="im-page-header">
        <div className="im-page-header__title">
          <h1>Item Master</h1>
          <span className="im-record-badge">{items.length}</span>
        </div>
        <div className="im-page-header__actions">
          <button
            className="im-hdr-btn"
            onClick={() => setSettingsOpen(true)}
            title="Module settings"
          >
            <Settings
              style={{
                width: 12,
                height: 12,
                display: 'inline',
                marginRight: 4,
              }}
            />
            Settings
          </button>
          <button className="im-hdr-btn" onClick={handleDownloadTemplate}>
            <Download
              style={{
                width: 12,
                height: 12,
                display: 'inline',
                marginRight: 4,
              }}
            />
            Template
          </button>
          <button className="im-hdr-btn" onClick={handleImport}>
            <Upload
              style={{
                width: 12,
                height: 12,
                display: 'inline',
                marginRight: 4,
              }}
            />
            Import
          </button>
          <button className="im-hdr-btn" onClick={handleExport}>
            <Download
              style={{
                width: 12,
                height: 12,
                display: 'inline',
                marginRight: 4,
              }}
            />
            Export
          </button>
          <button
            className="im-hdr-btn im-hdr-btn--primary"
            onClick={handleOpenFormForAdd}
          >
            <Plus
              style={{
                width: 12,
                height: 12,
                display: 'inline',
                marginRight: 4,
              }}
            />
            Add Item
          </button>
        </div>
      </div>

      <ItemDataTable
        columns={columns}
        data={pagedItems}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        supplierFilter={supplierFilter}
        onSupplierFilterChange={setSupplierFilter}
        categoryOptions={categories}
        supplierOptions={suppliers}
        totalCount={filteredItems.length}
        isLoading={loading}
        onClearFilters={handleClearFilters}
        serverPage={safePage}
        serverTotalPages={totalPages}
        onServerPrevPage={() => setCurrentPage(p => Math.max(1, p - 1))}
        onServerNextPage={() =>
          setCurrentPage(p => Math.min(totalPages, p + 1))
        }
      />

      {settingsDialog}
    </div>
  );
}
export default ItemMasterPage;
