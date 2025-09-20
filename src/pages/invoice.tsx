// src/pages/invoice/index.tsx
import { invoke } from '@tauri-apps/api/core';
import { open, save, confirm } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { Download, Loader2, Plus, Settings, Upload, Zap } from 'lucide-react';
import Papa from 'papaparse';
import { useUnifiedNotifications } from '@/hooks/useUnifiedNotifications';

import * as React from 'react';

import { getInvoiceColumns } from '@/components/invoice/columns';
import { InvoiceForm } from '@/components/invoice/form';
import { InvoiceViewDialog } from '@/components/invoice/view';
import { ModuleSettings } from '@/components/module-settings';
import { ResponsiveDataTable } from '@/components/ui/responsive-table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSettings } from '@/lib/use-settings';
import { useResponsiveContext } from '@/providers/ResponsiveProvider';
import type { FlattenedInvoiceLine, Invoice } from '@/types/invoice';
import type { Item } from '@/types/item';
import type { Shipment } from '@/types/shipment';
import type { Supplier } from '@/types/supplier';

type BulkImportRow = {
  shipmentInvoiceNumber: string;
  itemPartNumber: string;
  quantity: string;
  unitPrice: string;
};

const InvoicePage = () => {
  const { settings } = useSettings();
  const { getButtonClass, getSpacingClass } = useResponsiveContext();
  const notifications = useUnifiedNotifications();
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [shipments, setShipments] = React.useState<Shipment[]>([]);
  const [unfinalizedShipments, setUnfinalizedShipments] = React.useState<
    Shipment[]
  >([]);
  const [items, setItems] = React.useState<Item[]>([]);
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [isFormOpen, setFormOpen] = React.useState(false);
  const [isViewOpen, setViewOpen] = React.useState(false);
  const [isSettingsOpen, setSettingsOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);

  const [invoiceToEdit, setInvoiceToEdit] = React.useState<Invoice | null>(
    null
  );
  const [invoiceToView, setInvoiceToView] = React.useState<Invoice | null>(
    null
  );
  const [invoiceToDelete, setInvoiceToDelete] = React.useState<{
    id: string;
    number: string;
  } | null>(null);

  const [statusFilter, setStatusFilter] = React.useState('All');

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [inv, shp, unfinalizedShp, itm, sup] = await Promise.all([
        invoke<Invoice[]>('get_invoices'),
        invoke<Shipment[]>('get_shipments'),
        invoke<Shipment[]>('get_unfinalized_shipments'),
        invoke<Item[]>('get_items'),
        invoke<Supplier[]>('get_suppliers'),
      ]);
      setInvoices(inv);
      setShipments(shp);
      setUnfinalizedShipments(unfinalizedShp);
      setItems(itm);
      setSuppliers(sup);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      notifications.invoice.error('load initial data', String(error));
    } finally {
      setLoading(false);
    }
  }, [notifications.invoice]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const availableShipmentsForForm = React.useMemo(() => {
    if (invoiceToEdit) {
      const currentShipment = shipments.find(
        s => s.id === invoiceToEdit.shipmentId
      );
      if (
        currentShipment &&
        !unfinalizedShipments.some(us => us.id === currentShipment.id)
      ) {
        return [...unfinalizedShipments, currentShipment];
      }
    }
    return unfinalizedShipments;
  }, [unfinalizedShipments, shipments, invoiceToEdit]);

  // Helper function to parse percentage values from database
  const parsePercentage = (value: string | number | undefined): number => {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      // Remove '%' and convert to number
      const cleanValue = value.replace('%', '').trim();
      const parsed = parseFloat(cleanValue);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };

  // Helper function to format currency
  const formatCurrency = (amount: number, currency: string) => {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency?.toUpperCase() || 'USD',
      }).format(amount);
    } catch {
      return `${currency} ${amount.toFixed(2)}`;
    }
  };

  const flattenedData = React.useMemo(() => {
    const data: FlattenedInvoiceLine[] = [];
    const filteredInvoices =
      statusFilter === 'All'
        ? invoices
        : invoices.filter(invoice => invoice.status === statusFilter);

    filteredInvoices.forEach(invoice => {
      const shipment = shipments.find(s => s.id === invoice.shipmentId);
      const supplier = suppliers.find(sup => sup.id === shipment?.supplierId);

      if (invoice.lineItems && invoice.lineItems.length > 0) {
        invoice.lineItems.forEach(lineItem => {
          const item = items.find(i => i.id === lineItem.itemId);
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
              bcd: parsePercentage(item.bcd),
              igst: parsePercentage(item.igst),
              invoiceTotal: invoice.calculatedTotal,
              shipmentTotal: invoice.shipmentTotal,
              status: invoice.status as 'Draft' | 'Finalized' | 'Mismatch',
            });
          }
        });
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
          });
        }
      }
    });
    return data;
  }, [invoices, shipments, items, suppliers, statusFilter]);

  const handleOpenFormForAdd = () => {
    setInvoiceToEdit(null);
    setFormOpen(true);
  };

  const handleOpenFormForEdit = React.useCallback(
    (invoiceId: string) => {
      const fullInvoice = invoices.find(inv => inv.id === invoiceId);
      if (fullInvoice) {
        setInvoiceToEdit(fullInvoice);
        setFormOpen(true);
      }
    },
    [invoices]
  );

  const handleView = React.useCallback(
    (invoiceId: string) => {
      const fullInvoice = invoices.find(inv => inv.id === invoiceId);
      if (fullInvoice) {
        setInvoiceToView(fullInvoice);
        setViewOpen(true);
      }
    },
    [invoices]
  );

  const handleDeleteRequest = React.useCallback(
    (invoiceId: string, invoiceNumber: string) => {
      setInvoiceToDelete({ id: invoiceId, number: invoiceNumber });
      setIsDeleteDialogOpen(true);
    },
    []
  );

  const handleQuickFinalize = React.useCallback(
    async (invoiceId: string, invoiceNumber: string) => {
      try {
        // Find the invoice to get its current data
        const invoice = invoices.find(inv => inv.id === invoiceId);
        if (!invoice) {
          notifications.error(
            'Invoice Not Found',
            'The requested invoice could not be found.'
          );
          return;
        }

        // Check if the invoice totals match
        const tolerance = 0.01;
        const isMatched =
          Math.abs(invoice.shipmentTotal - invoice.calculatedTotal) < tolerance;

        if (!isMatched) {
          notifications.error(
            'Cannot Finalize',
            'The calculated total must match the shipment value.'
          );
          return;
        }

        // Show confirmation dialog
        const confirmed = await confirm(
          `Are you sure you want to finalize invoice ${invoiceNumber}?\n\nShipment Value: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(invoice.shipmentTotal)}\nCalculated Total: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(invoice.calculatedTotal)}\n\nThis action cannot be undone.`,
          {
            title: 'Finalize Invoice',
            kind: 'warning',
          }
        );

        if (confirmed) {
          const payload = {
            shipmentId: invoice.shipmentId,
            status: 'Finalized',
            lineItems:
              invoice.lineItems?.map(li => ({
                itemId: li.itemId,
                quantity: li.quantity,
                unitPrice: li.unitPrice,
              })) || [],
          };

          await invoke('update_invoice', { id: invoiceId, payload });
          notifications.invoice.finalized(invoiceNumber);
          fetchData();
        }
      } catch (error) {
        console.error('Failed to finalize invoice:', error);
        notifications.invoice.error('finalize', String(error));
      }
    },
    [invoices, fetchData, notifications]
  );

  const handleBulkAutoFinalize = React.useCallback(async () => {
    try {
      // Find all draft invoices that can be auto-finalized
      const draftInvoices = invoices.filter(
        invoice => invoice.status === 'Draft'
      );
      const autoFinalizableInvoices = draftInvoices.filter(invoice => {
        const tolerance = 0.01;
        return (
          Math.abs(invoice.shipmentTotal - invoice.calculatedTotal) < tolerance
        );
      });

      if (autoFinalizableInvoices.length === 0) {
        notifications.info(
          'No Auto-Finalizable Invoices',
          'No invoices found that can be auto-finalized.'
        );
        return;
      }

      // Show confirmation dialog
      const confirmed = await confirm(
        `Are you sure you want to auto-finalize ${autoFinalizableInvoices.length} invoice(s)?\n\nThis will finalize all draft invoices where the calculated total matches the shipment value.\n\nThis action cannot be undone.`,
        {
          title: 'Bulk Auto-Finalize',
          kind: 'warning',
        }
      );

      if (confirmed) {
        notifications.loading(
          `Finalizing ${autoFinalizableInvoices.length} invoice(s)...`
        );

        // Process each invoice
        let successCount = 0;
        let errorCount = 0;

        for (const invoice of autoFinalizableInvoices) {
          try {
            const payload = {
              shipmentId: invoice.shipmentId,
              status: 'Finalized',
              lineItems:
                invoice.lineItems?.map(li => ({
                  itemId: li.itemId,
                  quantity: li.quantity,
                  unitPrice: li.unitPrice,
                })) || [],
            };

            await invoke('update_invoice', { id: invoice.id, payload });
            successCount++;
          } catch (error) {
            console.error(
              `Failed to finalize invoice ${invoice.invoiceNumber}:`,
              error
            );
            errorCount++;
          }
        }

        notifications.success(
          'Bulk Finalization Complete',
          `${successCount} invoice(s) finalized successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}.`
        );
        fetchData();
      }
    } catch (error) {
      console.error('Failed to bulk auto-finalize invoices:', error);
      notifications.invoice.error('bulk finalize', String(error));
    }
  }, [invoices, fetchData, notifications]);

  const handleDeleteConfirm = async () => {
    if (invoiceToDelete) {
      try {
        await invoke('delete_invoice', { id: invoiceToDelete.id });
        notifications.invoice.deleted(invoiceToDelete.number);
        fetchData();
      } catch (error) {
        console.error('Failed to delete invoice:', error);
        notifications.invoice.error('delete', String(error));
      }
    }
    setIsDeleteDialogOpen(false);
    setInvoiceToDelete(null);
  };

  const handleSubmit = async (
    invoiceData: Omit<Invoice, 'id'>,
    id?: string
  ) => {
    const payload = {
      shipmentId: invoiceData.shipmentId,
      status: invoiceData.status,
      lineItems:
        invoiceData.lineItems?.map(li => ({
          itemId: li.itemId,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
        })) || [],
    };

    try {
      if (id) {
        await invoke('update_invoice', { id, payload });
        notifications.invoice.updated(invoiceData.invoiceNumber);
      } else {
        await invoke('add_invoice', { payload });
        notifications.invoice.created(
          invoiceData.invoiceNumber,
          invoiceData.status
        );
      }
      setFormOpen(false);
      fetchData();
    } catch (error) {
      console.error('Failed to save invoice:', error);
      notifications.invoice.error('save', String(error));
    }
  };

  const handleDownloadTemplate = async () => {
    const headers = 'shipmentInvoiceNumber,itemPartNumber,quantity,unitPrice';
    try {
      const filePath = await save({
        defaultPath: 'bulk_invoice_template.csv',
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      if (filePath) {
        await writeTextFile(filePath, headers);
        notifications.success(
          'Template Downloaded',
          'Invoice import template downloaded successfully!'
        );
      }
    } catch (err) {
      notifications.error(
        'Download Failed',
        `Failed to download template: ${(err as Error).message}`
      );
    }
  };

  const handleBulkImport = async () => {
    try {
      const selectedPath = await open({
        multiple: false,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      if (!selectedPath) return;

      const content = await readTextFile(selectedPath as string);
      const results = Papa.parse<BulkImportRow>(content, {
        header: true,
        skipEmptyLines: true,
      });

      if (results.errors.length) {
        notifications.error(
          'CSV Parsing Error',
          'Please check the file format.'
        );
        return;
      }

      const shipmentMap = new Map(shipments.map(s => [s.invoiceNumber, s.id]));
      const itemMap = new Map(items.map(i => [i.partNumber, i.id]));

      const invoicesToCreate = new Map<
        string,
        { itemId: string; quantity: number; unitPrice: number }[]
      >();

      for (const row of results.data) {
        const shipmentId = shipmentMap.get(row.shipmentInvoiceNumber);
        const itemId = itemMap.get(row.itemPartNumber);

        if (!shipmentId) {
          notifications.warning(
            'Import Warning',
            `Skipping row: Shipment with invoice number "${row.shipmentInvoiceNumber}" not found.`
          );
          continue;
        }
        if (!itemId) {
          notifications.warning(
            'Import Warning',
            `Skipping row: Item with part number "${row.itemPartNumber}" not found.`
          );
          continue;
        }

        const lineItems = invoicesToCreate.get(shipmentId) || [];
        lineItems.push({
          itemId,
          quantity: parseFloat(row.quantity) || 0,
          unitPrice: parseFloat(row.unitPrice) || 0,
        });
        invoicesToCreate.set(shipmentId, lineItems);
      }

      if (invoicesToCreate.size === 0) {
        notifications.info(
          'No Valid Invoices',
          'No new valid invoices found to import.'
        );
        return;
      }

      const payloads = Array.from(invoicesToCreate.entries()).map(
        ([shipmentId, lineItems]) => ({
          shipmentId,
          status: 'Draft',
          lineItems,
        })
      );

      await invoke('add_invoices_bulk', { payloads });
      notifications.invoice.imported(payloads.length);
      fetchData();
    } catch (err) {
      notifications.invoice.error('import', (err as Error).message);
    }
  };

  // Calculate auto-finalizable invoices
  const autoFinalizableInvoices = React.useMemo(() => {
    const draftInvoices = invoices.filter(
      invoice => invoice.status === 'Draft'
    );
    return draftInvoices.filter(invoice => {
      const tolerance = 0.01;
      return (
        Math.abs(invoice.shipmentTotal - invoice.calculatedTotal) < tolerance
      );
    });
  }, [invoices]);

  const columns = React.useMemo(
    () =>
      getInvoiceColumns({
        onView: handleView,
        onEdit: handleOpenFormForEdit,
        onDelete: handleDeleteRequest,
        onQuickFinalize: handleQuickFinalize,
        settings,
      }),
    [
      handleView,
      handleOpenFormForEdit,
      handleDeleteRequest,
      handleQuickFinalize,
      settings,
    ]
  );

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin" />
      </div>
    );
  }

  // Status filter UI
  const statusFilterControl = (
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
  );

  return (
    <div className="container mx-auto py-10">
      <div
        className={`mb-4 flex items-center justify-between ${getSpacingClass()}`}
      >
        <div>
          <h1 className="text-xl font-semibold text-blue-600">
            Invoice Details
          </h1>
          <p className="text-muted-foreground mt-1">
            Process and manage commercial invoices and billing
          </p>
        </div>
        <div className={`flex items-center ${getSpacingClass()}`}>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setSettingsOpen(true)}
                  className={getButtonClass()}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Module Settings</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button onClick={handleOpenFormForAdd} className={getButtonClass()}>
            <Plus className="mr-2 h-4 w-4" /> Add New Invoice
          </Button>
          <Button
            onClick={handleDownloadTemplate}
            variant="outline"
            className={getButtonClass()}
          >
            <Download className="mr-2 h-4 w-4" /> Template
          </Button>
          <Button
            onClick={handleBulkImport}
            variant="outline"
            className={getButtonClass()}
          >
            <Upload className="mr-2 h-4 w-4" /> Import Bulk
          </Button>
        </div>
      </div>
      {/* Status Filter and Auto-Finalize */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Status:</span>
            {statusFilterControl}
          </div>
          <div className="text-muted-foreground text-sm">
            Showing {flattenedData.length} invoice
            {flattenedData.length !== 1 ? 's' : ''}
            {statusFilter !== 'All' && ` with status "${statusFilter}"`}
          </div>
        </div>

        {/* Auto-Finalize Section */}
        <div className="flex items-center gap-3">
          {autoFinalizableInvoices.length > 0 ? (
            <>
              <div className="text-muted-foreground text-sm">
                {autoFinalizableInvoices.length} invoice
                {autoFinalizableInvoices.length !== 1 ? 's' : ''} ready for
                auto-finalize
              </div>
              <Button
                onClick={handleBulkAutoFinalize}
                variant="outline"
                size="sm"
                className="border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
              >
                <Zap className="mr-2 h-4 w-4" />
                Auto-Finalize All
              </Button>
            </>
          ) : (
            <div className="text-muted-foreground text-sm">
              No invoices ready for auto-finalize
            </div>
          )}
        </div>
      </div>

      {/* Auto-Finalize Summary Card */}
      {autoFinalizableInvoices.length > 0 && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-green-800">
                Auto-Finalize Ready
              </h3>
              <p className="mt-1 text-xs text-green-600">
                {autoFinalizableInvoices.length} draft invoice
                {autoFinalizableInvoices.length !== 1 ? 's' : ''} have matching
                shipment and invoice values
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium text-green-800">
                Total Value:{' '}
                {formatCurrency(
                  autoFinalizableInvoices.reduce(
                    (sum, inv) => sum + inv.calculatedTotal,
                    0
                  ),
                  'USD'
                )}
              </div>
              <div className="text-xs text-green-600">
                Ready for bulk finalization
              </div>
            </div>
          </div>
        </div>
      )}

      <ResponsiveDataTable
        columns={columns}
        data={flattenedData}
        searchPlaceholder="Search invoices..."
        hideColumnsOnSmall={[
          'supplierName',
          'shipmentInvoiceNumber',
          'totalAmount',
          'totalTax',
          'totalDiscount',
          'finalAmount',
        ]}
        columnWidths={{
          invoiceNumber: { minWidth: '150px', maxWidth: '200px' },
          supplierName: { minWidth: '200px', maxWidth: '300px' },
          shipmentInvoiceNumber: { minWidth: '150px', maxWidth: '200px' },
          itemPartNumber: { minWidth: '120px', maxWidth: '150px' },
          itemDescription: { minWidth: '200px', maxWidth: '300px' },
        }}
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
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete invoice{' '}
              <strong>{invoiceToDelete?.number}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setInvoiceToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-5xl flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Invoice Module Settings</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-2">
            <ModuleSettings
              moduleName="invoice"
              moduleTitle="Invoice"
              onClose={() => setSettingsOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InvoicePage;
