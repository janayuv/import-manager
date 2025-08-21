// src/pages/item/index.tsx
// react-table imports were unused in this refactored page
import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { Download, FileOutput, Loader2, Plus, Upload } from 'lucide-react'
import { toast } from 'sonner'

import * as React from 'react'

import { getItemColumns } from '@/components/item/columns'
import { ItemForm } from '@/components/item/form'
import { ItemViewDialog } from '@/components/item/view'
import { DataTable } from '@/components/shared/data-table'
import { Button } from '@/components/ui/button'
import { exportItemsToCsv, importItemsFromCsv } from '@/lib/csv-helpers'
import { formatText } from '@/lib/settings'
import { useSettings } from '@/lib/use-settings'
import type { Item } from '@/types/item'
import type { Option } from '@/types/options'
import type { Supplier } from '@/types/supplier'

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
  purchaseUom: {
    setter: 'setPurchaseUoms',
    fetcher: 'get_purchase_uoms',
    adder: 'add_purchase_uom',
  },
}

export function ItemMasterPage() {
  const { settings } = useSettings()
  const [items, setItems] = React.useState<Item[]>([])
  const [suppliers, setSuppliers] = React.useState<Option[]>([])
  const [isFormOpen, setFormOpen] = React.useState(false)
  const [isViewOpen, setViewOpen] = React.useState(false)
  const [selectedItem, setSelectedItem] = React.useState<Item | null>(null)
  const [itemToEdit, setItemToEdit] = React.useState<Item | null>(null)
  const [loading, setLoading] = React.useState(true)

  // State for creatable dropdowns, initialized as empty
  const [units, setUnits] = React.useState<Option[]>([])
  const [currencies, setCurrencies] = React.useState<Option[]>([])
  const [countries, setCountries] = React.useState<Option[]>([])
  const [bcdRates, setBcdRates] = React.useState<Option[]>([])
  const [swsRates, setSwsRates] = React.useState<Option[]>([])
  const [igstRates, setIgstRates] = React.useState<Option[]>([])
  const [categories, setCategories] = React.useState<Option[]>([])
  const [endUses, setEndUses] = React.useState<Option[]>([])
  const [purchaseUoms, setPurchaseUoms] = React.useState<Option[]>([])

  const stateSetters: Record<
    string,
    React.Dispatch<React.SetStateAction<Option[]>>
  > = React.useMemo(
    () => ({
      setUnits,
      setCurrencies,
      setCountries,
      setBcdRates,
      setSwsRates,
      setIgstRates,
      setCategories,
      setEndUses,
      setPurchaseUoms,
    }),
    []
  )

  const fetchItems = React.useCallback(async () => {
    const fetchedItems: Item[] = await invoke('get_items')
    setItems(fetchedItems)
  }, [])

  const fetchInitialData = React.useCallback(async () => {
    setLoading(true)
    try {
      const supplierData: Supplier[] = await invoke('get_suppliers')
      setSuppliers(
        supplierData.map((s) => ({
          value: s.id,
          label: formatText(s.supplierName, settings.textFormat),
        }))
      )

      const optionPromises = Object.values(optionConfigs).map((config) =>
        invoke<Option[]>(config.fetcher)
      )
      const allOptions = await Promise.all(optionPromises)

      Object.keys(optionConfigs).forEach((key, index) => {
        const configKey = key as keyof typeof optionConfigs

        const setterName = optionConfigs[configKey].setter

        const setter = stateSetters[setterName]
        if (setter) {
          setter(allOptions[index])
        }
      })

      await fetchItems()
    } catch (error) {
      console.error('Failed to load initial data:', error)
      toast.error('Could not load initial data from the database.')
    } finally {
      setLoading(false)
    }
  }, [fetchItems, stateSetters, settings.textFormat])

  React.useEffect(() => {
    fetchInitialData()
  }, [fetchInitialData])

  const handleOpenFormForEdit = React.useCallback((item: Item) => {
    setItemToEdit(item)
    setFormOpen(true)
  }, [])

  const handleOpenFormForAdd = () => {
    setItemToEdit(null)
    setFormOpen(true)
  }

  const handleView = React.useCallback((item: Item) => {
    setSelectedItem(item)
    setViewOpen(true)
  }, [])

  const handleSubmit = async (itemData: Omit<Item, 'id'>) => {
    try {
      if (itemToEdit) {
        // Logic for updating an item remains the same.
        await invoke('update_item', { item: { ...itemData, id: itemToEdit.id } })
        toast.success(`Item ${itemData.partNumber} updated.`)
      } else {
        const maxId = items.reduce((max, item) => {
          const num = parseInt(item.id.replace('ITM-', ''), 10)
          return !isNaN(num) && num > max ? num : max
        }, 0)

        const nextIdNumber = maxId + 1
        const newId = `ITM-${nextIdNumber.toString().padStart(3, '0')}`

        const newItemWithId = { ...itemData, id: newId }

        await invoke('add_item', { item: newItemWithId })
        toast.success(`Item ${itemData.partNumber} created.`)
      }
      fetchItems()
    } catch (error) {
      console.error('Failed to save item:', error)
      toast.error(`Failed to save item: ${(error as Error).message}`)
    }
    setFormOpen(false)
  }

  const handleExport = async (type: 'all' | 'selected') => {
    // This function will need to be adapted since `table` is no longer available here.
    // For now, we will simplify it to export all items.
    // A more robust solution might involve lifting table state or passing a ref.
    if (type === 'selected') {
      toast.warning('Export selected is temporarily disabled during refactoring.')
      return
    }

    const dataToExport = items

    if (dataToExport.length === 0) {
      toast.warning('No data available to export.')
      return
    }

    try {
      const csv = exportItemsToCsv(dataToExport, suppliers)
      const filePath = await save({
        defaultPath: `items-${type}.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      })
      if (filePath) {
        await writeTextFile(filePath, csv)
        toast.success('Items exported successfully!')
      }
    } catch (err) {
      const error = err as Error
      console.error('Failed to export items:', error)
      toast.error(`Failed to export items: ${error.message}`)
    }
  }

  const handleDownloadTemplate = async () => {
    const headers = [
      'partNumber',
      'itemDescription',
      'supplierName',
      'unit',
      'currency',
      'unitPrice',
      'hsnCode',
      'countryOfOrigin',
      'bcd',
      'sws',
      'igst',
      'technicalWriteUp',
      'category',
      'endUse',
      'netWeightKg',
      'purchaseUom',
      'grossWeightPerUomKg',
      'isActive',
    ]
    const csv = headers.join(',')

    try {
      const filePath = await save({
        defaultPath: 'item_template.csv',
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      })
      if (filePath) {
        await writeTextFile(filePath, csv)
        toast.success('Item import template downloaded successfully!')
      }
    } catch (err) {
      const error = err as Error
      console.error('Failed to download template:', error)
      toast.error(`Failed to download template: ${error.message}`)
    }
  }

  const handleImport = async () => {
    try {
      const selectedPath = await open({
        multiple: false,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      })
      if (typeof selectedPath === 'string') {
        const content = await readTextFile(selectedPath)

        // Use enhanced CSV import with validation
        const { newItems, skippedCount, validationResult } = importItemsFromCsv(
          content,
          items,
          suppliers
        )

        // Show validation results
        if (!validationResult.isValid) {
          const errorMessage = validationResult.errors
            .map((e) => `Row ${e.row}, Column ${e.column}: ${e.message}`)
            .join('\n')

          toast.error(`CSV validation failed:\n${errorMessage}`, {
            duration: 10000,
            style: {
              whiteSpace: 'pre-line',
              maxWidth: '600px',
              maxHeight: '400px',
              overflow: 'auto',
            },
          })
          return
        }

        // Show warnings if any
        if (validationResult.warnings.length > 0) {
          const warningMessage = validationResult.warnings
            .map((w) => `Row ${w.row}, Column ${w.column}: ${w.message}`)
            .join('\n')

          toast.warning(`CSV imported with warnings:\n${warningMessage}`, {
            duration: 8000,
            style: {
              whiteSpace: 'pre-line',
              maxWidth: '600px',
              maxHeight: '400px',
              overflow: 'auto',
            },
          })
        }

        if (skippedCount > 0) {
          toast.warning(`${skippedCount} duplicate items were skipped.`)
        }

        if (newItems.length > 0) {
          const itemsForBackend = newItems.map((item) => ({
            ...item,
            bcd: item.bcd !== undefined && item.bcd !== null ? String(item.bcd) : undefined,
            sws: item.sws !== undefined && item.sws !== null ? String(item.sws) : undefined,
            igst: item.igst !== undefined && item.igst !== null ? String(item.igst) : undefined,
          }))

          await invoke('add_items_bulk', { items: itemsForBackend })
          toast.success(`${newItems.length} new items imported successfully!`)
          fetchItems()
        } else {
          toast.info('No new items to import.')
        }
      }
    } catch (err) {
      const error = err as Error
      console.error('Failed to import items:', error)
      toast.error(`Failed to import items: ${error.message}`)
    }
  }

  const handleOptionCreate = async (type: string, newOption: Option) => {
    const config = optionConfigs[type as keyof typeof optionConfigs]
    if (!config) return

    try {
      await invoke(config.adder, { option: newOption })
      toast.success(`New ${type} "${newOption.label}" has been saved.`)

      const updatedOptions: Option[] = await invoke(config.fetcher)
      const setter = stateSetters[config.setter]
      if (setter) {
        setter(updatedOptions)
      }
    } catch (error) {
      console.error(`Failed to save new ${type}:`, error)
      toast.error(`Failed to save new ${type}.`)
    }
  }

  const columns = React.useMemo(
    () => getItemColumns(suppliers, handleView, handleOpenFormForEdit, settings),
    [suppliers, handleView, handleOpenFormForEdit, settings]
  )

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin" />
      </div>
    )
  }

  const toolbar = (
    <div className="flex items-center gap-2">
      <Button onClick={() => handleExport('selected')} variant="outline" disabled={true}>
        <FileOutput className="mr-2 h-4 w-4" />
        Export Selected
      </Button>
      <Button onClick={() => handleExport('all')} variant="outline">
        <Download className="mr-2 h-4 w-4" />
        Export All
      </Button>
    </div>
  )

  return (
    <div className="container mx-auto py-10">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Item Master</h1>
        <div className="flex items-center gap-2">
          <Button onClick={handleOpenFormForAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add New
          </Button>
          <Button onClick={handleDownloadTemplate} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Template
          </Button>
          <Button onClick={handleImport} variant="outline">
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
        </div>
      </div>
      <DataTable
        columns={columns}
        data={items}
        toolbar={toolbar}
        storageKey="item-master-table-page-size"
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
  )
}
export default ItemMasterPage
