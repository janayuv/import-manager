// src/components/invoice/view.tsx (MODIFIED - Formats tax numbers as percentages)
import { isTauriEnvironment, save, writeTextFile } from '@/lib/tauri-bridge';
import { Download } from 'lucide-react';
import Papa from 'papaparse';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { parsePercentage } from '@/lib/parse-percentage';
import { cn } from '@/lib/utils';
import type { Invoice } from '@/types/invoice';
import type { Item } from '@/types/item';
import type { Shipment } from '@/types/shipment';
import type { Supplier } from '@/types/supplier';

// Helper function to normalize currency codes for Intl.NumberFormat
const normalizeCurrencyCode = (currencyCode: string): string => {
  const normalized = currencyCode?.trim().toUpperCase() || 'USD';

  // Common currency code mappings
  const currencyMap: Record<string, string> = {
    EURO: 'EUR',
    DOLLAR: 'USD',
    POUND: 'GBP',
    YEN: 'JPY',
    WON: 'KRW',
    RUPEE: 'INR',
    YUAN: 'CNY',
  };

  return currencyMap[normalized] || normalized;
};

interface ViewDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  invoice: Invoice | null;
  items: Item[];
  suppliers: Supplier[];
  shipments: Shipment[];
  presentation?: 'dialog' | 'page';
  className?: string;
  onEdit?: () => void;
}

const DetailRow = ({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) => (
  <div>
    <p className="text-muted-foreground text-sm font-medium">{label}</p>
    <p className="font-semibold">{value}</p>
  </div>
);

export function InvoiceViewDialog({
  isOpen,
  onOpenChange,
  invoice,
  items,
  suppliers,
  shipments,
  presentation = 'dialog',
  className,
  onEdit,
}: ViewDialogProps) {
  if (!invoice) return null;

  const isPage = presentation === 'page';

  const shipment = shipments.find((s: Shipment) => s.id === invoice.shipmentId);
  const supplier = suppliers.find(
    (s: Supplier) => s.id === shipment?.supplierId
  );
  const currency = shipment?.invoiceCurrency || 'USD';

  const formatCurrency = (amount: number, currencyCode: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalizeCurrencyCode(currencyCode),
    }).format(amount);
  };

  const handleExport = async () => {
    if (!invoice || !invoice.lineItems || invoice.lineItems.length === 0) {
      toast.warning('No items to export.');
      return;
    }

    const exportData = invoice.lineItems.map(lineItem => {
      const item = items.find(i => i.id === lineItem.itemId);
      const duty =
        lineItem.dutyPercent ?? (item ? parsePercentage(item.bcd) : 0);
      const sws = lineItem.swsPercent ?? (item ? parsePercentage(item.sws) : 0);
      const igst =
        lineItem.igstPercent ?? (item ? parsePercentage(item.igst) : 0);
      return {
        'Part No': item?.partNumber || '',
        Description: item?.itemDescription || '',
        'HS.Code': item?.hsnCode || '',
        Unit: item?.unit || '',
        Qty: lineItem.quantity,
        'Unit Price': lineItem.unitPrice,
        'Line Total': lineItem.quantity * lineItem.unitPrice,
        'Duty %': duty,
        'SWS %': sws,
        'IGST %': igst,
      };
    });

    const csv = Papa.unparse(exportData);
    try {
      if (!isTauriEnvironment) {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${invoice.invoiceNumber}-items.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Items exported successfully!');
        return;
      }

      const filePath = await save({
        defaultPath: `${invoice.invoiceNumber}-items.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      if (filePath) {
        await writeTextFile(filePath, csv);
        toast.success('Items exported successfully!');
      }
    } catch (error) {
      console.error('Failed to export items:', error);
      toast.error('Failed to export items.');
    }
  };

  const headerBlock = (
    <>
      {isPage ? (
        <>
          <h2
            id="invoice-view-title"
            className="text-lg font-semibold tracking-tight sm:text-xl"
          >
            View invoice: {invoice.invoiceNumber}
          </h2>
          <p className="text-muted-foreground text-sm">
            Detailed view of the invoice and its line items.
          </p>
        </>
      ) : (
        <>
          <DialogTitle>View Invoice: {invoice.invoiceNumber}</DialogTitle>
          <DialogDescription>
            A detailed view of the invoice and its line items.
          </DialogDescription>
        </>
      )}
    </>
  );

  const detailsAndTable = (
    <>
      {/* Header Details */}
      <div className="grid grid-cols-2 gap-4 border-b py-4 md:grid-cols-4">
        <DetailRow
          label="Supplier Name"
          value={supplier?.supplierName || '-'}
        />
        <DetailRow label="Invoice No" value={invoice.invoiceNumber} />
        <DetailRow
          label="Invoice Date"
          value={new Date(invoice.invoiceDate).toLocaleDateString('en-GB')}
        />
        <DetailRow label="Status" value={invoice.status} />
        <DetailRow
          label="Invoice Total"
          value={formatCurrency(invoice.calculatedTotal, currency)}
        />
        <DetailRow label="Currency" value={currency} />
      </div>

      {/* Line Items Table */}
      <div className="py-4">
        <h3 className="mb-2 text-lg font-semibold">Items</h3>
        <div
          className={cn(
            'rounded-md border pr-2',
            isPage ? 'overflow-visible' : 'max-h-64 overflow-y-auto'
          )}
        >
          <Table>
            <TableHeader className="bg-primary text-primary-foreground sticky top-0 z-10 rounded-b-md rounded-r-md">
              <TableRow>
                <TableHead>Part No</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>HS.Code</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Unit Price</TableHead>
                <TableHead>Line Total</TableHead>
                <TableHead>Duty %</TableHead>
                <TableHead>SWS %</TableHead>
                <TableHead>IGST %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.lineItems?.map(lineItem => {
                const item = items.find(i => i.id === lineItem.itemId);
                if (!item) return null;
                const lineTotal = lineItem.quantity * lineItem.unitPrice;
                const dutyPct =
                  lineItem.dutyPercent ?? parsePercentage(item.bcd);
                const swsPct = lineItem.swsPercent ?? parsePercentage(item.sws);
                const igstPct =
                  lineItem.igstPercent ?? parsePercentage(item.igst);
                return (
                  <TableRow key={lineItem.id}>
                    <TableCell>{item.partNumber}</TableCell>
                    <TableCell>{item.itemDescription}</TableCell>
                    <TableCell>{item.hsnCode}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell>{lineItem.quantity}</TableCell>
                    <TableCell>
                      {formatCurrency(lineItem.unitPrice, currency)}
                    </TableCell>
                    <TableCell>{formatCurrency(lineTotal, currency)}</TableCell>
                    <TableCell>{dutyPct}%</TableCell>
                    <TableCell>{swsPct}%</TableCell>
                    <TableCell>{igstPct}%</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );

  const footerBlock = (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 pt-4',
        isPage && 'border-t px-6 pb-6'
      )}
    >
      <Button
        type="button"
        variant="outline"
        useAccentColor
        onClick={handleExport}
      >
        <Download className="mr-2 h-4 w-4" /> Export Items
      </Button>
      <div className="flex flex-wrap items-center gap-2">
        {onEdit ? (
          <Button
            type="button"
            variant="default"
            useAccentColor
            onClick={onEdit}
          >
            Edit invoice
          </Button>
        ) : null}
        {isPage ? (
          <Button
            type="button"
            variant="outline"
            useAccentColor
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        ) : (
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Close
            </Button>
          </DialogClose>
        )}
      </div>
    </div>
  );

  if (isPage) {
    return (
      <section
        className={cn(
          'bg-card text-card-foreground flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border shadow-sm',
          className
        )}
        aria-labelledby="invoice-view-title"
      >
        <header className="shrink-0 border-b px-6 pb-4 pt-6">
          {headerBlock}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 [scrollbar-gutter:stable]">
          {detailsAndTable}
        </div>
        <footer className="shrink-0 px-6">{footerBlock}</footer>
      </section>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>{headerBlock}</DialogHeader>
        {detailsAndTable}
        <DialogFooter className="flex flex-row flex-wrap justify-between gap-2 sm:justify-between">
          {footerBlock}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
