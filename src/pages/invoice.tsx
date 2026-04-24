// src/pages/invoice/index.tsx
import { invoke } from '@tauri-apps/api/core';
import {
  confirm,
  useNativeFileDialogs,
  openTextFile,
  save,
  writeTextFile,
} from '@/lib/tauri-bridge';
import {
  ArrowLeft,
  Download,
  Loader2,
  Plus,
  Settings,
  Upload,
  Zap,
} from 'lucide-react';
import Papa from 'papaparse';
import { useUnifiedNotifications } from '@/hooks/useUnifiedNotifications';

import * as React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

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
import {
  invoiceTaxSnapshotFromItem,
  parsePercentage,
} from '@/lib/parse-percentage';
import { useSettings } from '@/lib/use-settings';
import { useResponsiveContext } from '@/providers/ResponsiveProvider';
import type { FlattenedInvoiceLine, Invoice } from '@/types/invoice';
import type { Item } from '@/types/item';
import type { Shipment } from '@/types/shipment';
import type { Supplier } from '@/types/supplier';

/** URL path for invoice view or edit (bookmarkable). */
export function invoiceDetailPath(invoiceId: string, mode: 'view' | 'edit') {
  return `/invoice/${encodeURIComponent(invoiceId)}/${mode}`;
}

type BulkImportRow = {
  shipmentInvoiceNumber: string;
  itemPartNumber: string;
  quantity: string;
  unitPrice: string;
};

const InvoicePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { invoiceId: invoiceIdParam } = useParams<{ invoiceId: string }>();

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
  const [isSettingsOpen, setSettingsOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);

  const [invoiceToEdit, setInvoiceToEdit] = React.useState<Invoice | null>(
    null
  );

  const invoicePanel = React.useMemo((): 'none' | 'view' | 'edit' => {
    if (!invoiceIdParam) return 'none';
    if (location.pathname.endsWith('/edit')) return 'edit';
    if (location.pathname.endsWith('/view')) return 'view';
    return 'none';
  }, [invoiceIdParam, location.pathname]);

  const decodedInvoiceId = React.useMemo(() => {
    if (!invoiceIdParam) return null;
    try {
      return decodeURIComponent(invoiceIdParam);
    } catch {
      return invoiceIdParam;
    }
  }, [invoiceIdParam]);

  const selectedInvoiceFromUrl = React.useMemo(() => {
    if (!decodedInvoiceId) return null;
    return invoices.find(inv => inv.id === decodedInvoiceId) ?? null;
  }, [invoices, decodedInvoiceId]);

  const closeInvoicePanel = React.useCallback(() => {
    navigate('/invoice');
  }, [navigate]);
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

  const editingInvoiceForShipments =
    invoiceToEdit ?? selectedInvoiceFromUrl ?? null;

  const availableShipmentsForForm = React.useMemo(() => {
    if (editingInvoiceForShipments) {
      const currentShipment = shipments.find(
        s => s.id === editingInvoiceForShipments.shipmentId
      );
      if (
        currentShipment &&
        !unfinalizedShipments.some(us => us.id === currentShipment.id)
      ) {
        return [...unfinalizedShipments, currentShipment];
      }
    }
    return unfinalizedShipments;
  }, [unfinalizedShipments, shipments, editingInvoiceForShipments]);

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
              bcd: lineItem.dutyPercent ?? parsePercentage(item.bcd),
              sws: lineItem.swsPercent ?? parsePercentage(item.sws),
              igst: lineItem.igstPercent ?? parsePercentage(item.igst),
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
            sws: 0,
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
      navigate(invoiceDetailPath(invoiceId, 'edit'));
    },
    [navigate]
  );

  const handleView = React.useCallback(
    (invoiceId: string) => {
      navigate(invoiceDetailPath(invoiceId, 'view'));
    },
    [navigate]
  );

  React.useEffect(() => {
    if (invoicePanel === 'edit' && selectedInvoiceFromUrl) {
      setInvoiceToEdit(selectedInvoiceFromUrl);
    } else if (invoicePanel === 'none') {
      setInvoiceToEdit(null);
    }
  }, [invoicePanel, selectedInvoiceFromUrl]);

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
                dutyPercent: li.dutyPercent,
                swsPercent: li.swsPercent,
                igstPercent: li.igstPercent,
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

      const confirmed = await confirm('Finalize all matching invoices?', {
        title: 'Confirm Bulk Finalization',
        kind: 'warning',
      });

      if (!confirmed) {
        return;
      }

      const loadingToastId = notifications.loading(
        `Finalizing ${autoFinalizableInvoices.length} invoice(s)...`
      );

      type BulkFinalizeResult = {
        finalized: number;
        failed: number;
        errorMessages: string[];
      };

      try {
        const result = await invoke<BulkFinalizeResult>(
          'bulk_finalize_invoices',
          {
            input: {
              invoiceIds: autoFinalizableInvoices.map(inv => inv.id),
            },
          }
        );

        notifications.dismiss(loadingToastId);

        if (result.errorMessages.length > 0) {
          console.warn(
            '[invoice] bulk_finalize_invoices:',
            result.errorMessages
          );
        }

        notifications.success(
          'Bulk Finalization Complete',
          `${result.finalized} invoice(s) finalized successfully${
            result.failed > 0 ? `, ${result.failed} could not be finalized` : ''
          }.`
        );
        fetchData();
      } catch (err) {
        notifications.dismiss(loadingToastId);
        throw err;
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
          dutyPercent: li.dutyPercent,
          swsPercent: li.swsPercent,
          igstPercent: li.igstPercent,
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
      if (invoicePanel === 'edit') {
        navigate('/invoice');
      } else {
        setFormOpen(false);
      }
      fetchData();
    } catch (error) {
      console.error('Failed to save invoice:', error);
      notifications.invoice.error('save', String(error));
    }
  };

  const handleDownloadTemplate = async () => {
    const headers = 'shipmentInvoiceNumber,itemPartNumber,quantity,unitPrice';
    try {
      if (!useNativeFileDialogs) {
        const blob = new Blob([headers], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'bulk_invoice_template.csv';
        a.click();
        URL.revokeObjectURL(url);
        notifications.success(
          'Template Downloaded',
          'Invoice import template downloaded successfully!'
        );
        return;
      }

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
      const selectedFile = await openTextFile({
        multiple: false,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      if (!selectedFile) {
        notifications.info('Import Cancelled', 'Import cancelled.');
        return;
      }

      const content = selectedFile.contents;
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

      const [freshShipments, freshItems] = await Promise.all([
        invoke<Shipment[]>('get_shipments'),
        invoke<Item[]>('get_items'),
      ]);
      const shipmentMap = new Map(
        freshShipments.map(s => [s.invoiceNumber, s.id])
      );
      const itemMap = new Map(freshItems.map(i => [i.partNumber, i.id]));

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
        const masterItem = freshItems.find(i => i.id === itemId);
        lineItems.push({
          itemId,
          quantity: parseFloat(row.quantity) || 0,
          unitPrice: parseFloat(row.unitPrice) || 0,
          ...(masterItem
            ? invoiceTaxSnapshotFromItem(masterItem)
            : {
                dutyPercent: 0,
                swsPercent: 0,
                igstPercent: 0,
              }),
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

  const settingsDialog = (
    <Dialog open={isSettingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-5xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
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
  );

  if (invoicePanel !== 'none') {
    return (
      <div className="from-background to-muted/20 bg-linear-to-br flex min-h-screen flex-col">
        <div className="container mx-auto flex min-h-0 flex-1 flex-col px-4 py-6">
          <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              useAccentColor
              onClick={closeInvoicePanel}
              className="gap-2"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Back to invoices
            </Button>
            <span className="text-muted-foreground text-sm">
              {invoicePanel === 'view'
                ? 'Viewing invoice record'
                : 'Editing invoice record'}
            </span>
          </div>

          {loading ? (
            <div
              className="border-border bg-card text-muted-foreground flex min-h-[240px] w-full max-w-[min(calc(100vw-2rem),120rem)] flex-1 items-center justify-center self-center rounded-xl border text-sm shadow-sm"
              role="status"
              aria-live="polite"
            >
              Loading invoice…
            </div>
          ) : !selectedInvoiceFromUrl ? (
            <div className="border-border bg-card mx-auto flex w-full max-w-lg flex-col gap-4 rounded-xl border p-8 shadow-sm">
              <h2 className="text-card-foreground text-lg font-semibold">
                Invoice not found
              </h2>
              <p className="text-muted-foreground text-sm">
                No invoice with ID{' '}
                <span className="text-foreground font-mono">
                  {decodedInvoiceId ?? invoiceIdParam}
                </span>
                .
              </p>
              <Button
                type="button"
                variant="default"
                useAccentColor
                onClick={closeInvoicePanel}
                className="w-fit"
              >
                Back to invoices
              </Button>
            </div>
          ) : invoicePanel === 'view' ? (
            <div className="border-border bg-card flex min-h-0 w-full max-w-[min(calc(100vw-2rem),120rem)] flex-1 flex-col self-center overflow-hidden rounded-xl border shadow-sm">
              <InvoiceViewDialog
                isOpen={true}
                onOpenChange={open => {
                  if (!open) closeInvoicePanel();
                }}
                invoice={selectedInvoiceFromUrl}
                items={items}
                suppliers={suppliers}
                shipments={shipments}
                presentation="page"
                className="min-h-0 flex-1"
                onEdit={() =>
                  navigate(invoiceDetailPath(selectedInvoiceFromUrl.id, 'edit'))
                }
              />
            </div>
          ) : (
            <div className="border-border bg-card flex min-h-0 w-full max-w-[min(calc(100vw-2rem),120rem)] flex-1 flex-col self-center overflow-hidden rounded-xl border shadow-sm">
              <InvoiceForm
                isOpen={true}
                presentation="page"
                className="min-h-0 flex-1"
                onOpenChange={open => {
                  if (!open) closeInvoicePanel();
                }}
                onSubmit={handleSubmit}
                shipments={availableShipmentsForForm}
                items={items}
                invoiceToEdit={selectedInvoiceFromUrl}
              />
            </div>
          )}
        </div>
        {settingsDialog}
      </div>
    );
  }

  if (loading && invoicePanel === 'none') {
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
                  variant="default"
                  size="icon"
                  onClick={() => setSettingsOpen(true)}
                  className={getButtonClass()}
                  useAccentColor
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Module Settings</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button
            variant="default"
            onClick={handleOpenFormForAdd}
            className={getButtonClass()}
            useAccentColor
          >
            <Plus className="mr-2 h-4 w-4" /> Add New Invoice
          </Button>
          <Button
            onClick={handleDownloadTemplate}
            variant="default"
            className={getButtonClass()}
            useAccentColor
          >
            <Download className="mr-2 h-4 w-4" /> Template
          </Button>
          <Button
            onClick={handleBulkImport}
            variant="default"
            className={getButtonClass()}
            useAccentColor
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

      {settingsDialog}
    </div>
  );
};

export default InvoicePage;
