// src/components/invoice/form.tsx (MODIFIED - Correctly applies supplier-based part filtering)
import { Download, Loader2, Plus, Upload, X } from 'lucide-react'
import Papa from 'papaparse'
import { toast } from 'sonner'

import * as React from 'react'

import { Combobox } from '@/components/invoice/combobox'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Invoice, InvoiceLineItem } from '@/types/invoice'
import type { Item } from '@/types/item'
import type { Shipment } from '@/types/shipment'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

interface InvoiceFormProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  onSubmit: (invoiceData: Omit<Invoice, 'id'>, id?: string) => void
  shipments: Shipment[]
  items: Item[]
  invoiceToEdit?: Invoice | null
}

export const InvoiceForm: React.FC<InvoiceFormProps> = ({
  isOpen,
  onOpenChange,
  onSubmit,
  shipments,
  items,
  invoiceToEdit,
}) => {
  const [selectedShipment, setSelectedShipment] = React.useState<Shipment | null>(null)
  const [lineItems, setLineItems] = React.useState<InvoiceLineItem[]>([])
  const [calculatedTotal, setCalculatedTotal] = React.useState(0)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const shipmentOptions = shipments.map((s) => ({
    value: s.id,
    label: `${s.invoiceNumber} (${s.invoiceCurrency})`,
  }))
  const currency = selectedShipment?.invoiceCurrency || 'USD'

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
  }

  // Filter available items based on the selected supplier from the shipment
  const availableItemOptions = React.useMemo(() => {
    const supplierId = selectedShipment?.supplierId
    if (!supplierId) return []

    // NOTE: This assumes `supplierId` is added to the Item type.
    // The `as any` assertion is used because the original type file was not provided to be modified.
    return items
      .filter((item) => item.supplierId === supplierId)
      .map((item) => ({ value: item.id, label: item.partNumber }))
  }, [selectedShipment, items])

  React.useEffect(() => {
    if (invoiceToEdit && isOpen) {
      const shipment = shipments.find((s) => s.id === invoiceToEdit.shipmentId)
      setSelectedShipment(shipment || null)
      setLineItems(invoiceToEdit.lineItems || [])
    } else {
      setSelectedShipment(null)
      setLineItems([])
    }
  }, [invoiceToEdit, isOpen, shipments])

  React.useEffect(() => {
    setCalculatedTotal(lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0))
  }, [lineItems])

  const handleShipmentSelect = (shipmentId: string) => {
    const shipment = shipments.find((s: Shipment) => s.id === shipmentId)
    setSelectedShipment(shipment || null)
    setLineItems([])
  }
  const handleAddItem = () =>
    setLineItems([
      ...lineItems,
      { id: `item-${Date.now()}`, itemId: '', quantity: 1, unitPrice: 0 },
    ])
  const handleRemoveItem = (id: string) => setLineItems(lineItems.filter((item) => item.id !== id))
  const handleLineItemChange = (
    id: string,
    field: keyof InvoiceLineItem,
    value: string | number
  ) => {
    setLineItems((prevItems) =>
      prevItems.map((item) => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value }
          if (field === 'itemId') {
            const selectedItem = items.find((i: Item) => i.id === value)
            updatedItem.unitPrice = selectedItem ? selectedItem.unitPrice : 0
          }
          return updatedItem
        }
        return item
      })
    )
  }

  const handleTemplateDownload = async () => {
    const templateData = [{ partNumber: 'EXAMPLE-PN-1', quantity: 10, unitPrice: 12.5 }]
    const csv = Papa.unparse(templateData)
    try {
      const filePath = await save({
        defaultPath: 'item_import_template.csv',
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      })
      if (filePath) {
        await writeTextFile(filePath, csv)
        toast.success('Template downloaded successfully!')
      }
    } catch (error) {
      console.error('Failed to download template:', error)
      toast.error('Failed to download template.')
    }
  }

  const handleItemImport = async () => {
    try {
      const selectedPath = await open({
        multiple: false,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      })
      if (typeof selectedPath === 'string') {
        const content = await readTextFile(selectedPath)
        interface InvoiceLineItemCsvRow {
          partNumber: string
          quantity: string
          unitPrice: string
        }

        Papa.parse(content, {
          header: true,
          skipEmptyLines: true,
          complete: (results: Papa.ParseResult<InvoiceLineItemCsvRow>) => {
            const itemsToAdd: InvoiceLineItem[] = []
            const notFoundItems: string[] = []
            const duplicateItems: string[] = []

            results.data.forEach((row: InvoiceLineItemCsvRow) => {
              if (!row.partNumber) return
              const item = items.find((i) => i.partNumber === row.partNumber)
              if (!item) {
                notFoundItems.push(row.partNumber)
                return
              }
              const isDuplicate =
                lineItems.some((li) => li.itemId === item.id) ||
                itemsToAdd.some((li) => li.itemId === item.id)
              if (isDuplicate) {
                duplicateItems.push(row.partNumber)
                return
              }
              itemsToAdd.push({
                id: `imported-${Date.now()}-${Math.random()}`,
                itemId: item.id,
                quantity: parseFloat(row.quantity) || 0,
                unitPrice: parseFloat(row.unitPrice) || item.unitPrice,
              })
            })

            setLineItems((prev) => [...prev, ...itemsToAdd])
            if (itemsToAdd.length > 0)
              toast.success(`${itemsToAdd.length} items imported successfully!`)
            if (notFoundItems.length > 0)
              toast.warning(
                `Skipped ${notFoundItems.length} items not found: ${notFoundItems.join(', ')}`
              )
            if (duplicateItems.length > 0)
              toast.info(
                `Skipped ${duplicateItems.length} duplicate items: ${duplicateItems.join(', ')}`
              )
            if (
              itemsToAdd.length === 0 &&
              notFoundItems.length === 0 &&
              duplicateItems.length === 0
            )
              toast.info('No new items were imported.')
          },
          error: (err: Error) => {
            toast.error('Failed to parse CSV file.')
            console.error('CSV parsing error:', err)
          },
        })
      }
    } catch (error) {
      console.error('Failed to import items:', error)
      toast.error('Failed to import items.')
    }
  }

  const handleSave = (status: 'Draft' | 'Finalized') => {
    setIsSubmitting(true)
    // Simulate network delay
    setTimeout(() => {
      if (!selectedShipment) {
        setIsSubmitting(false)
        return toast.error('Please select a shipment first.')
      }
      const isMatched = selectedShipment.invoiceValue === calculatedTotal
      if (status === 'Finalized' && !isMatched) {
        setIsSubmitting(false)
        return toast.error('Cannot finalize. The calculated total must match the shipment value.')
      }

      const invoiceData: Omit<Invoice, 'id'> = {
        invoiceNumber: selectedShipment.invoiceNumber,
        shipmentId: selectedShipment.id,
        invoiceDate: selectedShipment.invoiceDate,
        status: status === 'Finalized' ? 'Finalized' : 'Draft',
        calculatedTotal,
        shipmentTotal: selectedShipment.invoiceValue,
        lineItems,
      }
      onSubmit(invoiceData, invoiceToEdit?.id)
      setIsSubmitting(false)
    }, 500)
  }

  const isMatch = selectedShipment ? selectedShipment.invoiceValue === calculatedTotal : false
  const matchDifference = selectedShipment ? calculatedTotal - selectedShipment.invoiceValue : 0
  const formTitle = invoiceToEdit
    ? `Edit Invoice: ${invoiceToEdit.invoiceNumber}`
    : 'Create New Invoice'

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{formTitle}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 border-b pb-4 md:grid-cols-3">
          <div>
            <Label htmlFor="shipmentId">Shipment (Invoice No)</Label>
            <Combobox
              options={shipmentOptions}
              value={selectedShipment?.id || ''}
              onChange={handleShipmentSelect}
              placeholder="Select a shipment..."
              disabled={!!invoiceToEdit}
            />
          </div>
          <div>
            <Label>Invoice Number</Label>
            <Input value={selectedShipment?.invoiceNumber || ''} readOnly />
          </div>
          <div>
            <Label>Invoice Date</Label>
            <Input value={selectedShipment?.invoiceDate || ''} readOnly />
          </div>
        </div>

        {selectedShipment && (
          <>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Line Items</h3>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleTemplateDownload}>
                    <Download className="mr-2 h-4 w-4" /> Template
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleItemImport}>
                    <Upload className="mr-2 h-4 w-4" /> Import Items
                  </Button>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-md border pr-2">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-pink-800">
                    <TableRow>
                      <TableHead className="w-[200px]">Part No</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-[80px]">Unit</TableHead>
                      <TableHead className="w-[100px]">Qty</TableHead>
                      <TableHead className="w-[120px]">Unit Price</TableHead>
                      <TableHead className="w-[120px]">Total</TableHead>
                      <TableHead className="w-[50px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineItems.map((lineItem) => {
                      const fullItem = items.find((i) => i.id === lineItem.itemId)
                      return (
                        <TableRow key={lineItem.id}>
                          <TableCell>
                            {/* FIX: Use the filtered list of items and disable until a supplier is chosen. */}
                            <Combobox
                              options={availableItemOptions}
                              value={lineItem.itemId}
                              onChange={(value) =>
                                handleLineItemChange(lineItem.id, 'itemId', value)
                              }
                              searchPlaceholder="Search Part No..."
                              notFoundText="No parts for this supplier."
                              disabled={!selectedShipment}
                            />
                          </TableCell>
                          <TableCell>{fullItem?.itemDescription || '-'}</TableCell>
                          <TableCell>{fullItem?.unit || '-'}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={lineItem.quantity}
                              onChange={(e) =>
                                handleLineItemChange(
                                  lineItem.id,
                                  'quantity',
                                  parseFloat(e.target.value) || 0
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={lineItem.unitPrice}
                              onChange={(e) =>
                                handleLineItemChange(
                                  lineItem.id,
                                  'unitPrice',
                                  parseFloat(e.target.value) || 0
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={formatCurrency(lineItem.quantity * lineItem.unitPrice)}
                              readOnly
                              className="bg-gray-100"
                            />
                          </TableCell>
                          <TableCell>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <X className="h-4 w-4 text-red-500" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently remove the item from this invoice. This
                                    action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="custom-alert-action-cancel">
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    className="custom-alert-action-ok"
                                    onClick={() => handleRemoveItem(lineItem.id)}
                                  >
                                    Continue
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddItem}
                disabled={!selectedShipment}
              >
                <Plus className="mr-2 h-4 w-4" /> Add Item
              </Button>
            </div>
            <div className="flex items-center justify-end gap-6 border-t pt-4">
              <div className="text-right">
                <p className="text-sm text-gray-500">Shipment Value</p>
                <p className="text-lg font-bold">
                  {formatCurrency(selectedShipment?.invoiceValue || 0)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Calculated Total</p>
                <p className="text-lg font-bold">{formatCurrency(calculatedTotal)}</p>
              </div>
              <div
                className={`flex items-center gap-2 text-xl font-bold ${isMatch ? 'text-green-600' : 'text-red-600'}`}
              >
                {isMatch ? '✅ Match' : `⚠️ Mismatch (by ${formatCurrency(matchDifference)})`}
              </div>
            </div>
          </>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button
              type="button"
              className="custom-alert-action-cancel"
              variant="secondary"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </DialogClose>
          {/* FIX: Disable buttons if no shipment is selected */}
          <Button
            type="button"
            className="custom-alert-action-orange"
            variant="outline"
            onClick={() => handleSave('Draft')}
            disabled={isSubmitting || !selectedShipment}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save as Draft
          </Button>
          <Button
            type="submit"
            className="custom-alert-action-ok"
            onClick={() => handleSave('Finalized')}
            disabled={isSubmitting || !selectedShipment}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Finalize Invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
