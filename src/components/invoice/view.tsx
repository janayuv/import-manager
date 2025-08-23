// src/components/invoice/view.tsx (MODIFIED - Formats tax numbers as percentages)
import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import { Download } from 'lucide-react'
import Papa from 'papaparse'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Invoice } from '@/types/invoice'
import type { Item } from '@/types/item'
import type { Shipment } from '@/types/shipment'
import type { Supplier } from '@/types/supplier'

interface ViewDialogProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  invoice: Invoice | null
  items: Item[]
  suppliers: Supplier[]
  shipments: Shipment[]
}

const DetailRow = ({ label, value }: { label: string; value: string | number }) => (
  <div>
    <p className="text-muted-foreground text-sm font-medium">{label}</p>
    <p className="font-semibold">{value}</p>
  </div>
)

export function InvoiceViewDialog({ isOpen, onOpenChange, invoice, items, suppliers, shipments }: ViewDialogProps) {
  if (!invoice) return null

  const shipment = shipments.find((s: Shipment) => s.id === invoice.shipmentId)
  const supplier = suppliers.find((s: Supplier) => s.id === shipment?.supplierId)
  const currency = shipment?.invoiceCurrency || 'USD'

  const formatCurrency = (amount: number, currencyCode: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(amount)
  }

  const handleExport = async () => {
    if (!invoice || !invoice.lineItems || invoice.lineItems.length === 0) {
      toast.warning('No items to export.')
      return
    }

    const exportData = invoice.lineItems.map((lineItem) => {
      const item = items.find((i) => i.id === lineItem.itemId)
      return {
        'Part No': item?.partNumber || '',
        Description: item?.itemDescription || '',
        'HS.Code': item?.hsnCode || '',
        Unit: item?.unit || '',
        Qty: lineItem.quantity,
        'Unit Price': lineItem.unitPrice,
        'Line Total': lineItem.quantity * lineItem.unitPrice,
        // FIX: Format BCD for export
        BCD: item?.bcd ? `${item.bcd}%` : '-',
        // FIX: Format IGST for export
        IGST: item?.igst ? `${item.igst}%` : '-',
      }
    })

    const csv = Papa.unparse(exportData)
    try {
      const filePath = await save({
        defaultPath: `${invoice.invoiceNumber}-items.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      })
      if (filePath) {
        await writeTextFile(filePath, csv)
        toast.success('Items exported successfully!')
      }
    } catch (error) {
      console.error('Failed to export items:', error)
      toast.error('Failed to export items.')
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>View Invoice: {invoice.invoiceNumber}</DialogTitle>
          <DialogDescription>A detailed view of the invoice and its line items.</DialogDescription>
        </DialogHeader>

        {/* Header Details */}
        <div className="grid grid-cols-2 gap-4 border-b py-4 md:grid-cols-4">
          <DetailRow
            label="Supplier Name"
            value={supplier?.supplierName || '-'}
          />
          <DetailRow
            label="Invoice No"
            value={invoice.invoiceNumber}
          />
          <DetailRow
            label="Invoice Date"
            value={new Date(invoice.invoiceDate).toLocaleDateString('en-GB')}
          />
          <DetailRow
            label="Status"
            value={invoice.status}
          />
          <DetailRow
            label="Invoice Total"
            value={formatCurrency(invoice.calculatedTotal, currency)}
          />
          <DetailRow
            label="Currency"
            value={currency}
          />
        </div>

        {/* Line Items Table */}
        <div className="py-4">
          <h3 className="mb-2 text-lg font-semibold">Items</h3>
          <div className="max-h-64 overflow-y-auto rounded-md border pr-2">
            <Table>
              <TableHeader className="bg-primary text-primary-foreground sticky top-0 z-10 rounded-r-md rounded-b-md">
                <TableRow>
                  <TableHead>Part No</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>HS.Code</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Unit Price</TableHead>
                  <TableHead>Line Total</TableHead>
                  <TableHead>BCD</TableHead>
                  <TableHead>IGST</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.lineItems?.map((lineItem) => {
                  const item = items.find((i) => i.id === lineItem.itemId)
                  if (!item) return null
                  const lineTotal = lineItem.quantity * lineItem.unitPrice
                  return (
                    <TableRow key={lineItem.id}>
                      <TableCell>{item.partNumber}</TableCell>
                      <TableCell>{item.itemDescription}</TableCell>
                      <TableCell>{item.hsnCode}</TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell>{lineItem.quantity}</TableCell>
                      <TableCell>{formatCurrency(lineItem.unitPrice, currency)}</TableCell>
                      <TableCell>{formatCurrency(lineTotal, currency)}</TableCell>
                      {/* FIX: Display the BCD number as a percentage */}
                      <TableCell>{item.bcd ? `${item.bcd}%` : '-'}</TableCell>
                      {/* FIX: Display the IGST number as a percentage */}
                      <TableCell>{item.igst ? `${item.igst}%` : '-'}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter className="justify-between">
          <Button
            type="button"
            variant="outline"
            className="custom-alert-action-ok"
            onClick={handleExport}
          >
            <Download className="mr-2 h-4 w-4" /> Export Items
          </Button>
          <DialogClose asChild>
            <Button
              type="button"
              className="custom-alert-action-cancel"
            >
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
