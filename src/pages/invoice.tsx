// src/pages/invoice.tsx
import { safeInvoke as invoke } from '@/lib/ipc-safe';
import {
  confirm,
  useNativeFileDialogs,
  openTextFile,
  save,
  writeTextFile,
} from '@/lib/tauri-bridge';
import { Download, FileText, Plus, Settings, Upload, Zap } from 'lucide-react';
import Papa from 'papaparse';
import { useUnifiedNotifications } from '@/hooks/useUnifiedNotifications';

import * as React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { getInvoiceColumns } from '@/components/invoice/columns';
import { InvoiceForm } from '@/components/invoice/form';
import { InvoiceDataTable } from '@/components/invoice/table-invoice';
import { InvoiceViewDialog } from '@/components/invoice/view';
import { ModuleSettings } from '@/components/module-settings';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  invoiceTaxSnapshotFromItem,
  parsePercentage,
} from '@/lib/parse-percentage';
import { useSettings } from '@/lib/use-settings';
import type { FlattenedInvoiceLine, Invoice } from '@/types/invoice';
import type { Item } from '@/types/item';
import type { Shipment } from '@/types/shipment';
import type { Supplier } from '@/types/supplier';

/** URL path for invoice view or edit (bookmarkable). */
export function invoiceDetailPath(invoiceId: string, mode: 'view' | 'edit') {
  return `/invoice/${encodeURIComponent(invoiceId)}/${mode}`;
}

function dominantInvoiceCurrency(
  list: Invoice[],
  shipments: Map<string, Shipment>
): string {
  const tally = new Map<string, number>();
  for (const inv of list) {
    const raw = shipments.get(inv.shipmentId)?.invoiceCurrency || 'USD';
    const c = raw.toUpperCase() === 'EURO' ? 'EUR' : raw.toUpperCase();
    tally.set(c, (tally.get(c) ?? 0) + 1);
  }
  let best = 'USD';
  let max = 0;
  for (const [code, n] of tally) {
    if (n > max) {
      max = n;
      best = code;
    }
  }
  return best;
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

  const closeInvoicePanel = React.useCallback(() => {
    navigate('/invoice');
  }, [navigate]);
  const [invoiceToDelete, setInvoiceToDelete] = React.useState<{
    id: string;
    number: string;
  } | null>(null);

  const [statusFilter, setStatusFilter] = React.useState('All');
  const [searchInput, setSearchInput] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');

  React.useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);
  const itemMap = React.useMemo(
    () => new Map(items.map(i => [i.id, i])),
    [items]
  );
  const shipmentMap = React.useMemo(
    () => new Map(shipments.map(s => [s.id, s])),
    [shipments]
  );
  const supplierMap = React.useMemo(
    () => new Map(suppliers.map(s => [s.id, s])),
    [suppliers]
  );
  const invoiceMap = React.useMemo(
    () => new Map(invoices.map(inv => [inv.id, inv])),
    [invoices]
  );

  const selectedInvoiceFromUrl = React.useMemo(() => {
    if (!decodedInvoiceId) return null;
    return invoiceMap.get(decodedInvoiceId) ?? null;
  }, [invoiceMap, decodedInvoiceId]);

  const roundToPrecision = React.useCallback(
    (value: number, decimals: 0 | 2) => {
      const factor = 10 ** decimals;
      return Math.round(value * factor) / factor;
    },
    []
  );

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
      const currentShipment = shipmentMap.get(
        editingInvoiceForShipments.shipmentId
      );
      if (
        currentShipment &&
        !unfinalizedShipments.some(us => us.id === currentShipment.id)
      ) {
        return [...unfinalizedShipments, currentShipment];
      }
    }
    return unfinalizedShipments;
  }, [unfinalizedShipments, shipmentMap, editingInvoiceForShipments]);

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
      const shipment = shipmentMap.get(invoice.shipmentId);
      const supplier = shipment
        ? supplierMap.get(shipment.supplierId)
        : undefined;

      if (invoice.lineItems && invoice.lineItems.length > 0) {
        invoice.lineItems.forEach(lineItem => {
          const item = itemMap.get(lineItem.itemId);
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
              lineTotal: roundToPrecision(
                lineItem.quantity * lineItem.unitPrice,
                invoice.lineTotalDecimals === 0 ? 0 : 2
              ),
              bcd: lineItem.dutyPercent ?? parsePercentage(item.bcd),
              sws: lineItem.swsPercent ?? parsePercentage(item.sws),
              igst: lineItem.igstPercent ?? parsePercentage(item.igst),
              invoiceTotal: invoice.calculatedTotal,
              invoiceTotalDecimals: invoice.invoiceTotalDecimals === 0 ? 0 : 2,
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
            invoiceTotalDecimals: invoice.invoiceTotalDecimals === 0 ? 0 : 2,
            shipmentTotal: invoice.shipmentTotal,
            status: invoice.status as 'Draft' | 'Finalized' | 'Mismatch',
          });
        }
      }
    });
    return data;
  }, [
    invoices,
    shipmentMap,
    supplierMap,
    itemMap,
    statusFilter,
    roundToPrecision,
  ]);

  const tableRows = React.useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return flattenedData;
    return flattenedData.filter(row => {
      return (
        row.supplierName.toLowerCase().includes(q) ||
        row.invoiceNumber.toLowerCase().includes(q) ||
        row.partNumber.toLowerCase().includes(q) ||
        row.itemDescription.toLowerCase().includes(q) ||
        row.hsnCode.toLowerCase().includes(q) ||
        row.currency.toLowerCase().includes(q)
      );
    });
  }, [flattenedData, debouncedSearch]);

  const invoiceMetrics = React.useMemo(() => {
    const currency = dominantInvoiceCurrency(invoices, shipmentMap);
    const sum = (pred: (i: Invoice) => boolean) =>
      invoices.filter(pred).reduce((s, i) => s + i.calculatedTotal, 0);
    return {
      currency,
      totalValue: sum(() => true),
      paid: sum(i => i.status === 'Finalized'),
      outstanding: sum(i => i.status === 'Draft'),
      overdue: sum(i => i.status === 'Mismatch'),
    };
  }, [invoices, shipmentMap]);

  const showingSummary = React.useMemo(() => {
    const n = tableRows.length;
    const statusBit =
      statusFilter !== 'All' ? ` with status "${statusFilter}"` : '';
    return `Showing ${n} invoice${n !== 1 ? 's' : ''}${statusBit}`;
  }, [tableRows.length, statusFilter]);

  const handleOpenFormForAdd = React.useCallback(() => {
    setInvoiceToEdit(null);
    setFormOpen(true);
  }, []);

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
        const invoice = invoiceMap.get(invoiceId);
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
            lineTotalDecimals: invoice.lineTotalDecimals ?? 2,
            invoiceTotalDecimals: invoice.invoiceTotalDecimals ?? 2,
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
    [invoiceMap, fetchData, notifications]
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
      lineTotalDecimals: invoiceData.lineTotalDecimals ?? 2,
      invoiceTotalDecimals: invoiceData.invoiceTotalDecimals ?? 2,
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

  const handleDownloadTemplate = React.useCallback(async () => {
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
  }, [notifications]);

  const handleBulkImport = React.useCallback(async () => {
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
      const freshItemMapById = new Map(freshItems.map(i => [i.id, i]));

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
        const masterItem = freshItemMapById.get(itemId);
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
  }, [notifications, fetchData]);

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

  const renderEmptyState = React.useCallback((): React.ReactNode => {
    const isFiltered = !!debouncedSearch.trim() || statusFilter !== 'All';
    const title = isFiltered ? 'No matching lines' : 'No invoice lines yet';
    const body = debouncedSearch.trim()
      ? `No rows match "${debouncedSearch.trim()}". Try a different search.`
      : statusFilter !== 'All'
        ? 'No lines for the current status filter.'
        : 'Create invoices with the wizard, add manually, or import a CSV template.';
    return (
      <div className="im-empty-state">
        <div className="im-empty-state__icon">
          <FileText size={40} strokeWidth={1} />
        </div>
        <div className="im-empty-state__title">{title}</div>
        <div className="im-empty-state__body">{body}</div>
        {!isFiltered && (
          <div className="im-empty-state__actions">
            <button
              type="button"
              className="im-hdr-btn im-hdr-btn--primary"
              onClick={() => navigate('/invoice-wizard')}
            >
              <Zap
                style={{
                  width: 12,
                  height: 12,
                  display: 'inline',
                  marginRight: 5,
                }}
              />
              Invoice Wizard
            </button>
            <button
              type="button"
              className="im-hdr-btn"
              onClick={handleOpenFormForAdd}
            >
              <Plus
                style={{
                  width: 12,
                  height: 12,
                  display: 'inline',
                  marginRight: 5,
                }}
              />
              Add New
            </button>
            <button
              type="button"
              className="im-hdr-btn"
              onClick={handleDownloadTemplate}
            >
              <Download
                style={{
                  width: 12,
                  height: 12,
                  display: 'inline',
                  marginRight: 5,
                }}
              />
              Template
            </button>
            <button
              type="button"
              className="im-hdr-btn"
              onClick={handleBulkImport}
            >
              <Upload
                style={{
                  width: 12,
                  height: 12,
                  display: 'inline',
                  marginRight: 5,
                }}
              />
              Import Bulk
            </button>
          </div>
        )}
      </div>
    );
  }, [
    debouncedSearch,
    statusFilter,
    navigate,
    handleOpenFormForAdd,
    handleDownloadTemplate,
    handleBulkImport,
  ]);

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
            onClick={closeInvoicePanel}
          >
            ← Back to invoices
          </button>
          <span style={{ color: 'var(--color-im-faint)', fontSize: 12 }}>
            {invoicePanel === 'view'
              ? 'Viewing invoice record'
              : 'Editing invoice record'}
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
              LOADING INVOICE…
            </div>
          ) : !selectedInvoiceFromUrl ? (
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
                INVOICE NOT FOUND
              </h2>
              <p style={{ fontSize: 12, color: 'var(--color-im-faint)' }}>
                No invoice with ID{' '}
                <span style={{ fontFamily: 'var(--font-im-mono)' }}>
                  {decodedInvoiceId ?? invoiceIdParam}
                </span>
                .
              </p>
              <button
                type="button"
                className="im-btn"
                onClick={closeInvoicePanel}
                style={{ alignSelf: 'flex-start' }}
              >
                ← Back to invoices
              </button>
            </div>
          ) : invoicePanel === 'view' ? (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
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
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
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

  return (
    <div className="im-supplier-page">
      <div className="im-page-header">
        <div className="im-page-header__title">
          <h1>Invoices</h1>
          <span className="sr-only">Invoice Details</span>
          <span className="im-record-badge">{invoices.length} RECORDS</span>
        </div>
        <div className="im-page-header__actions">
          <button
            type="button"
            className="im-hdr-btn"
            onClick={handleDownloadTemplate}
          >
            <Download
              style={{
                width: 12,
                height: 12,
                display: 'inline',
                marginRight: 5,
              }}
            />
            Template
          </button>
          <button
            type="button"
            className="im-hdr-btn"
            onClick={handleBulkImport}
          >
            <Upload
              style={{
                width: 12,
                height: 12,
                display: 'inline',
                marginRight: 5,
              }}
            />
            Import Bulk
          </button>
          <button
            type="button"
            className="im-hdr-btn"
            onClick={handleOpenFormForAdd}
          >
            <Plus
              style={{
                width: 12,
                height: 12,
                display: 'inline',
                marginRight: 5,
              }}
            />
            Add New
          </button>
          <button
            type="button"
            className="im-hdr-btn"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings
              style={{
                width: 12,
                height: 12,
                display: 'inline',
                marginRight: 5,
              }}
            />
            Settings
          </button>
          <button
            type="button"
            className="im-hdr-btn im-hdr-btn--primary"
            onClick={() => navigate('/invoice-wizard')}
          >
            <Zap
              style={{
                width: 12,
                height: 12,
                display: 'inline',
                marginRight: 5,
              }}
            />
            Invoice Wizard
          </button>
        </div>
      </div>

      <div className="im-invoice-metrics">
        <div className="im-invoice-metric im-invoice-metric--accent">
          <div className="im-invoice-metric__label">Total value</div>
          <div className="im-invoice-metric__value">
            {formatCurrency(invoiceMetrics.totalValue, invoiceMetrics.currency)}
          </div>
        </div>
        <div className="im-invoice-metric im-invoice-metric--good">
          <div className="im-invoice-metric__label">Paid</div>
          <div className="im-invoice-metric__value">
            {formatCurrency(invoiceMetrics.paid, invoiceMetrics.currency)}
          </div>
        </div>
        <div className="im-invoice-metric">
          <div className="im-invoice-metric__label">Outstanding</div>
          <div className="im-invoice-metric__value">
            {formatCurrency(
              invoiceMetrics.outstanding,
              invoiceMetrics.currency
            )}
          </div>
        </div>
        <div className="im-invoice-metric im-invoice-metric--bad">
          <div className="im-invoice-metric__label">Overdue</div>
          <div className="im-invoice-metric__value">
            {formatCurrency(invoiceMetrics.overdue, invoiceMetrics.currency)}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <InvoiceDataTable
          columns={columns}
          data={tableRows}
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          isLoading={loading}
          showingSummary={showingSummary}
          autoFinalizableCount={autoFinalizableInvoices.length}
          onBulkAutoFinalize={handleBulkAutoFinalize}
          renderEmptyState={renderEmptyState}
        />
      </div>

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
