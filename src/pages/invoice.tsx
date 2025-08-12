// src/pages/invoice/index.tsx
import { Download, Loader2, Plus, Upload } from 'lucide-react'
import Papa from 'papaparse'
import { toast } from 'sonner'

import * as React from 'react'

import { getInvoiceColumns } from '@/components/invoice/columns'
import { InvoiceForm } from '@/components/invoice/form'
import { InvoiceViewDialog } from '@/components/invoice/view'
import { DataTable } from '@/components/shared/data-table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { FlattenedInvoiceLine, Invoice } from '@/types/invoice'
import type { Item } from '@/types/item'
import type { Shipment } from '@/types/shipment'
import type { Supplier } from '@/types/supplier'
import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

type BulkImportRow = {
  shipmentInvoiceNumber: string
  itemPartNumber: string
  quantity: string
  unitPrice: string
}

const InvoicePage = () => {
  const [invoices, setInvoices] = React.useState<Invoice[]>([])
  const [shipments, setShipments] = React.useState<Shipment[]>([])
  const [unfinalizedShipments, setUnfinalizedShipments] = React.useState<Shipment[]>([])
  const [items, setItems] = React.useState<Item[]>([])
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([])
  const [loading, setLoading] = React.useState(true)

  const [isFormOpen, setFormOpen] = React.useState(false)
  const [isViewOpen, setViewOpen] = React.useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false)

  const [invoiceToEdit, setInvoiceToEdit] = React.useState<Invoice | null>(null)
  const [invoiceToView, setInvoiceToView] = React.useState<Invoice | null>(null)
  const [invoiceToDelete, setInvoiceToDelete] = React.useState<{
    id: string
    number: string
  } | null>(null)

  const [statusFilter, setStatusFilter] = React.useState('All')

  const fetchData = async () => {
    setLoading(true)
    try {
      const [inv, shp, unfinalizedShp, itm, sup] = await Promise.all([
        invoke<Invoice[]>('get_invoices'),
        invoke<Shipment[]>('get_shipments'),
        invoke<Shipment[]>('get_unfinalized_shipments'),
        invoke<Item[]>('get_items'),
        invoke<Supplier[]>('get_suppliers'),
      ])
      setInvoices(inv)
      setShipments(shp)
      setUnfinalizedShipments(unfinalizedShp)
      setItems(itm)
      setSuppliers(sup)
    } catch (error) {
      console.error('Failed to fetch data:', error)
      toast.error('Failed to load initial data. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    fetchData()
  }, [])

  const availableShipmentsForForm = React.useMemo(() => {
    if (invoiceToEdit) {
      const currentShipment = shipments.find((s) => s.id === invoiceToEdit.shipmentId)
      if (currentShipment && !unfinalizedShipments.some((us) => us.id === currentShipment.id)) {
        return [...unfinalizedShipments, currentShipment]
      }
    }
    return unfinalizedShipments
  }, [unfinalizedShipments, shipments, invoiceToEdit])

  const flattenedData = React.useMemo(() => {
    const data: FlattenedInvoiceLine[] = []
    const filteredInvoices =
      statusFilter === 'All'
        ? invoices
        : invoices.filter((invoice) => invoice.status === statusFilter)

    filteredInvoices.forEach((invoice) => {
      const shipment = shipments.find((s) => s.id === invoice.shipmentId)
      const supplier = suppliers.find((sup) => sup.id === shipment?.supplierId)

      if (invoice.lineItems && invoice.lineItems.length > 0) {
        invoice.lineItems.forEach((lineItem) => {
          const item = items.find((i) => i.id === lineItem.itemId)
          if (shipment && supplier && item) {
            data.push({
              invoiceId: invoice.id,
              supplierName: supplier.supplierName,
              invoiceNumber: shipment.invoiceNumber,
              invoiceDate: shipment.invoiceDate,
              partNumber: item.partNumber,
              itemDescription: item.itemDescription,
              hsnCode: item.hsnCode,
              currency: shipment.invoiceCurrency,
              unit: item.unit,
              quantity: lineItem.quantity,
              unitPrice: lineItem.unitPrice,
              lineTotal: lineItem.quantity * lineItem.unitPrice,
              bcd: typeof item.bcd === 'number' ? item.bcd : 0,
              igst: typeof item.igst === 'number' ? item.igst : 0,
              invoiceTotal: invoice.calculatedTotal,
              shipmentTotal: invoice.shipmentTotal,
              status: invoice.status as 'Draft' | 'Finalized' | 'Mismatch',
            })
          }
        })
      } else {
        if (shipment && supplier) {
          data.push({
            invoiceId: invoice.id,
            supplierName: supplier.supplierName,
            invoiceNumber: shipment.invoiceNumber,
            invoiceDate: shipment.invoiceDate,
            partNumber: 'N/A',
            itemDescription: 'No items added yet',
            hsnCode: '-',
            currency: shipment.invoiceCurrency,
            unit: '-',
            quantity: 0,
            unitPrice: 0,
            lineTotal: 0,
            bcd: 0,
            igst: 0,
            invoiceTotal: invoice.calculatedTotal,
            shipmentTotal: invoice.shipmentTotal,
            status: invoice.status as 'Draft' | 'Finalized' | 'Mismatch',
          })
        }
      }
    })
    return data
  }, [invoices, shipments, items, suppliers, statusFilter])

  const handleOpenFormForAdd = () => {
    setInvoiceToEdit(null)
    setFormOpen(true)
  }

  const handleOpenFormForEdit = (invoiceId: string) => {
    const fullInvoice = invoices.find((inv) => inv.id === invoiceId)
    if (fullInvoice) {
      setInvoiceToEdit(fullInvoice)
      setFormOpen(true)
    }
  }

  const handleView = (invoiceId: string) => {
    const fullInvoice = invoices.find((inv) => inv.id === invoiceId)
    if (fullInvoice) {
      setInvoiceToView(fullInvoice)
      setViewOpen(true)
    }
  }

  const handleDeleteRequest = (invoiceId: string, invoiceNumber: string) => {
    setInvoiceToDelete({ id: invoiceId, number: invoiceNumber })
    setIsDeleteDialogOpen(true)
  }

  const handleQuickFinalize = async (invoiceId: string, invoiceNumber: string) => {
    try {
      // Find the invoice to get its current data
      const invoice = invoices.find((inv) => inv.id === invoiceId)
      if (!invoice) {
        toast.error('Invoice not found.')
        return
      }

      // Check if the invoice totals match
      const tolerance = 0.01
      const isMatched = Math.abs(invoice.shipmentTotal - invoice.calculatedTotal) < tolerance
      
      if (!isMatched) {
        toast.error('Cannot finalize. The calculated total must match the shipment value.')
        return
      }

      // Show confirmation dialog
      if (confirm(`Are you sure you want to finalize invoice ${invoiceNumber}?\n\nShipment Value: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(invoice.shipmentTotal)}\nCalculated Total: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(invoice.calculatedTotal)}\n\nThis action cannot be undone.`)) {
        const payload = {
          shipmentId: invoice.shipmentId,
          status: 'Finalized',
          lineItems: invoice.lineItems?.map((li) => ({
            itemId: li.itemId,
            quantity: li.quantity,
            unitPrice: li.unitPrice,
          })) || [],
        }

        await invoke('update_invoice', { id: invoiceId, payload })
        toast.success(`Invoice ${invoiceNumber} has been finalized successfully!`)
        fetchData()
      }
    } catch (error) {
      console.error('Failed to finalize invoice:', error)
      toast.error('Failed to finalize invoice.')
    }
  }

  const handleDeleteConfirm = async () => {
    if (invoiceToDelete) {
      try {
        await invoke('delete_invoice', { id: invoiceToDelete.id })
        toast.success(`Invoice ${invoiceToDelete.number} deleted successfully.`)
        fetchData()
      } catch (error) {
        console.error('Failed to delete invoice:', error)
        toast.error('Failed to delete invoice.')
      }
    }
    setIsDeleteDialogOpen(false)
    setInvoiceToDelete(null)
  }

  const handleSubmit = async (invoiceData: Omit<Invoice, 'id'>, id?: string) => {
    const payload = {
      shipmentId: invoiceData.shipmentId,
      status: invoiceData.status,
      lineItems:
        invoiceData.lineItems?.map((li) => ({
          itemId: li.itemId,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
        })) || [],
    }

    try {
      if (id) {
        await invoke('update_invoice', { id, payload })
        toast.success(`Invoice ${invoiceData.invoiceNumber} has been updated.`)
      } else {
        await invoke('add_invoice', { payload })
        toast.success(
          `Invoice ${invoiceData.invoiceNumber} has been saved as ${invoiceData.status}.`
        )
      }
      setFormOpen(false)
      fetchData()
    } catch (error) {
      console.error('Failed to save invoice:', error)
      toast.error('Failed to save invoice.')
    }
  }

  const handleDownloadTemplate = async () => {
    const headers = 'shipmentInvoiceNumber,itemPartNumber,quantity,unitPrice'
    try {
      const filePath = await save({
        defaultPath: 'bulk_invoice_template.csv',
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      })
      if (filePath) {
        await writeTextFile(filePath, headers)
        toast.success('Invoice import template downloaded successfully!')
      }
    } catch (err) {
      toast.error(`Failed to download template: ${(err as Error).message}`)
    }
  }

  const handleBulkImport = async () => {
    try {
      const selectedPath = await open({
        multiple: false,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      })
      if (!selectedPath) return

      const content = await readTextFile(selectedPath as string)
      const results = Papa.parse<BulkImportRow>(content, { header: true, skipEmptyLines: true })

      if (results.errors.length) {
        toast.error('CSV parsing error. Please check the file format.')
        return
      }

      const shipmentMap = new Map(shipments.map((s) => [s.invoiceNumber, s.id]))
      const itemMap = new Map(items.map((i) => [i.partNumber, i.id]))

      const invoicesToCreate = new Map<string, { itemId: string; quantity: number; unitPrice: number }[]>()

      for (const row of results.data) {
        const shipmentId = shipmentMap.get(row.shipmentInvoiceNumber)
        const itemId = itemMap.get(row.itemPartNumber)

        if (!shipmentId) {
          toast.warning(
            `Skipping row: Shipment with invoice number "${row.shipmentInvoiceNumber}" not found.`
          )
          continue
        }
        if (!itemId) {
          toast.warning(`Skipping row: Item with part number "${row.itemPartNumber}" not found.`)
          continue
        }

        const lineItems = invoicesToCreate.get(shipmentId) || []
        lineItems.push({
          itemId,
          quantity: parseFloat(row.quantity) || 0,
          unitPrice: parseFloat(row.unitPrice) || 0,
        })
        invoicesToCreate.set(shipmentId, lineItems)
      }

      if (invoicesToCreate.size === 0) {
        toast.info('No new valid invoices found to import.')
        return
      }

      const payloads = Array.from(invoicesToCreate.entries()).map(
        ([shipmentId, lineItems]) => ({
          shipmentId,
          status: 'Draft',
          lineItems,
        })
      )

      await invoke('add_invoices_bulk', { payloads })
      toast.success(`${payloads.length} invoices have been imported as drafts.`)
      fetchData()
    } catch (err) {
      toast.error(`Failed to import invoices: ${(err as Error).message}`)
    }
  }

  const columns = getInvoiceColumns({
    onView: handleView,
    onEdit: handleOpenFormForEdit,
    onDelete: handleDeleteRequest,
    onQuickFinalize: handleQuickFinalize,
  })

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin" />
      </div>
    )
  }

  const toolbar = (
    <Select value={statusFilter} onValueChange={setStatusFilter}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Filter by status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="All">All</SelectItem>
        <SelectItem value="Draft">Draft</SelectItem>
        <SelectItem value="Finalized">Finalized</SelectItem>
        <SelectItem value="Mismatch">Mismatch</SelectItem>
      </SelectContent>
    </Select>
  )

  return (
    <div className="container mx-auto py-10">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Invoice Details</h1>
        <div className="flex items-center gap-2">
          <Button onClick={handleOpenFormForAdd}>
            <Plus className="mr-2 h-4 w-4" /> Add New Invoice
          </Button>
          <Button onClick={handleDownloadTemplate} variant="outline">
            <Download className="mr-2 h-4 w-4" /> Template
          </Button>
          <Button onClick={handleBulkImport} variant="outline">
            <Upload className="mr-2 h-4 w-4" /> Import Bulk
          </Button>
        </div>
      </div>
      <DataTable
        columns={columns}
        data={flattenedData}
        storageKey="invoice-table-page-size"
        toolbar={toolbar}
      />

      <InvoiceForm
        isOpen={isFormOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        shipments={availableShipmentsForForm}
        items={items}
        invoiceToEdit={invoiceToEdit}
      />
      <InvoiceViewDialog
        isOpen={isViewOpen}
        onOpenChange={setViewOpen}
        invoice={invoiceToView}
        items={items}
        suppliers={suppliers}
        shipments={shipments}
      />
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete invoice{' '}
              <strong>{invoiceToDelete?.number}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setInvoiceToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default InvoicePage
