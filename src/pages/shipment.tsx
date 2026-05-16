// src/pages/shipment/index.tsx
import { safeInvoke as invoke } from '@/lib/ipc-safe';
import {
  useNativeFileDialogs,
  openTextFile,
  save,
  writeTextFile,
} from '@/lib/tauri-bridge';
import {
  Copy,
  Database,
  Download,
  Plus,
  RefreshCw,
  Settings,
  Upload,
} from 'lucide-react';
import Papa from 'papaparse';
import { useUnifiedNotifications } from '@/hooks/useUnifiedNotifications';
import {
  buildShipmentImportTemplateCsv,
  canonicalShipmentCsvHeader,
  guessShipmentCsvDelimiter,
  parseShipmentImportCsvStream,
} from '@/lib/shipment-import';

import * as React from 'react';
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';

import { ShipmentDataTable } from '@/components/shipment/table-shipment';
import { ProfessionalShipmentForm } from '@/components/shipment/form-professional';
import { ProfessionalShipmentViewDialog } from '@/components/shipment/view-professional';
import { ShipmentMultilineForm } from '@/components/shipment/shipment-multiline-form';
import { ModuleSettings } from '@/components/module-settings';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { logDashboardActivity } from '@/lib/dashboard-activity';
import { isShipmentEtaOverdue } from '@/lib/shipment-exception-helpers';
import { formatDateForInput } from '@/lib/date-format';
import { formatText } from '@/lib/settings';
import { useSettings } from '@/lib/use-settings';
import { useUser } from '@/lib/user-context';
import type { Option } from '@/types/options';
import type { Shipment } from '@/types/shipment';
import type { Supplier } from '@/types/supplier';
import { createShipmentColumns } from '@/pages/shipment-columns';

/** URL path for shipment view or edit (bookmarkable). */
export function shipmentDetailPath(shipmentId: string, mode: 'view' | 'edit') {
  return `/shipment/${encodeURIComponent(shipmentId)}/${mode}`;
}

/** ZIP local file header: PK + bytes 0x03 0x04; optional leading BOM. */
function sampleLooksLikeZipLocalHeader(s: string): boolean {
  let i = 0;
  if (s.charCodeAt(0) === 0xfeff) {
    i = 1;
  }
  return (
    s.length >= i + 4 &&
    s.charCodeAt(i) === 0x50 &&
    s.charCodeAt(i + 1) === 0x4b &&
    s.charCodeAt(i + 2) === 3 &&
    s.charCodeAt(i + 3) === 4
  );
}

/** Count chars outside tab, LF, CR, and ASCII printable (space–tilde). */
function countNonPrintableAsciiCsvChars(s: string): number {
  const m = s.match(/[^\t\n\r -~]/g);
  return m?.length ?? 0;
}

type OptionType =
  | 'supplier'
  | 'category'
  | 'incoterm'
  | 'mode'
  | 'status'
  | 'type'
  | 'currency';

type PaginatedResult<T> = {
  data: T[];
  totalCount: number;
};

type ShipmentExceptionSummary = {
  overdueCount: number;
  boeMissingCount: number;
  expenseMissingCount: number;
};

const ShipmentPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useUser();
  const { shipmentId: shipmentIdParam } = useParams<{ shipmentId: string }>();

  const { settings } = useSettings();
  const notifications = useUnifiedNotifications();
  const [shipments, setShipments] = React.useState<Shipment[]>([]);
  const [suppliers, setSuppliers] = React.useState<Option[]>([]);
  const [isFormOpen, setFormOpen] = React.useState(false);
  const [isMultilineFormOpen, setMultilineFormOpen] = React.useState(false);
  const [isSettingsOpen, setSettingsOpen] = React.useState(false);
  const [isInitialLoad, setIsInitialLoad] = React.useState(true);
  const [shipmentToEdit, setShipmentToEdit] = React.useState<Shipment | null>(
    null
  );

  const shipmentPanel = React.useMemo((): 'none' | 'view' | 'edit' => {
    if (!shipmentIdParam) return 'none';
    if (location.pathname.endsWith('/edit')) return 'edit';
    if (location.pathname.endsWith('/view')) return 'view';
    return 'none';
  }, [shipmentIdParam, location.pathname]);

  const decodedShipmentId = React.useMemo(() => {
    if (!shipmentIdParam) return null;
    try {
      return decodeURIComponent(shipmentIdParam);
    } catch {
      return shipmentIdParam;
    }
  }, [shipmentIdParam]);

  const selectedShipmentFromUrl = React.useMemo(() => {
    if (!decodedShipmentId) return null;
    return shipments.find(s => s.id === decodedShipmentId) ?? null;
  }, [shipments, decodedShipmentId]);

  const closeShipmentPanel = React.useCallback(() => {
    navigate('/shipment');
  }, [navigate]);

  const [categories, setCategories] = React.useState<Option[]>([]);
  const [incoterms, setIncoterms] = React.useState<Option[]>([]);
  const [modes, setModes] = React.useState<Option[]>([]);
  const [types, setTypes] = React.useState<Option[]>([]);
  const [statuses, setStatuses] = React.useState<Option[]>([]);
  const [currencies, setCurrencies] = React.useState<Option[]>([]);
  const [statusFilter, setStatusFilter] = React.useState('All');
  const [supplierFilterId, setSupplierFilterId] = React.useState('');
  const [dateFromFilter, setDateFromFilter] = React.useState('');
  const [dateToFilter, setDateToFilter] = React.useState('');
  const [urlOverdue, setUrlOverdue] = React.useState(false);
  const [urlBoeMissing, setUrlBoeMissing] = React.useState(false);
  const [urlExpenseMissing, setUrlExpenseMissing] = React.useState(false);
  const [shipmentIdsWithBoe, setShipmentIdsWithBoe] = React.useState(
    () => new Set<string>()
  );
  const [shipmentIdsWithExpense, setShipmentIdsWithExpense] = React.useState(
    () => new Set<string>()
  );
  const skipUrlWriteRef = React.useRef(true);
  const [searchInput, setSearchInput] = React.useState('');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(50);
  const [totalCount, setTotalCount] = React.useState(0);
  const [exceptionSummary, setExceptionSummary] =
    React.useState<ShipmentExceptionSummary>({
      overdueCount: 0,
      boeMissingCount: 0,
      expenseMissingCount: 0,
    });

  React.useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(searchInput), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  React.useEffect(() => {
    const st = searchParams.get('status');
    setStatusFilter(st ? decodeURIComponent(st) : 'All');
    setSupplierFilterId(searchParams.get('supplier_id')?.trim() ?? '');
    setDateFromFilter(searchParams.get('date_from')?.trim() ?? '');
    setDateToFilter(searchParams.get('date_to')?.trim() ?? '');
    setUrlOverdue(searchParams.get('overdue') === 'true');
    setUrlBoeMissing(searchParams.get('boe_missing') === 'true');
    setUrlExpenseMissing(searchParams.get('expense_missing') === 'true');
    skipUrlWriteRef.current = false;
  }, [searchParams]);

  /** Deep link `/shipment?id=<shipmentId>` → canonical `/shipment/:id/view`. */
  React.useEffect(() => {
    const idQ = searchParams.get('id')?.trim();
    if (!idQ || shipmentIdParam) return;
    if (shipments.length === 0) return;
    if (!shipments.some(s => s.id === idQ)) return;
    const next = new URLSearchParams(searchParams);
    next.delete('id');
    const q = next.toString();
    const path = shipmentDetailPath(idQ, 'view');
    navigate(q ? `${path}?${q}` : path, { replace: true });
  }, [shipments, searchParams, shipmentIdParam, navigate]);

  React.useEffect(() => {
    if (shipmentPanel !== 'none') return;
    if (skipUrlWriteRef.current) return;
    const next = new URLSearchParams();
    if (statusFilter !== 'All') next.set('status', statusFilter);
    if (supplierFilterId) next.set('supplier_id', supplierFilterId);
    if (dateFromFilter) next.set('date_from', dateFromFilter);
    if (dateToFilter) next.set('date_to', dateToFilter);
    if (urlOverdue) next.set('overdue', 'true');
    if (urlBoeMissing) next.set('boe_missing', 'true');
    if (urlExpenseMissing) next.set('expense_missing', 'true');
    if (next.toString() === searchParams.toString()) return;
    setSearchParams(next, { replace: true });
  }, [
    statusFilter,
    supplierFilterId,
    dateFromFilter,
    dateToFilter,
    urlOverdue,
    urlBoeMissing,
    urlExpenseMissing,
    shipmentPanel,
    setSearchParams,
    searchParams,
  ]);

  const getShipmentExceptionFlags = React.useCallback(
    (s: Shipment) => {
      const overdue = isShipmentEtaOverdue(s);
      const hasBoe = shipmentIdsWithBoe.has(s.id);
      const hasExp = shipmentIdsWithExpense.has(s.id);
      const boeMissing = !hasBoe;
      const expenseMissing = !hasExp;
      return {
        overdue,
        boeMissing,
        expenseMissing,
        any: overdue || boeMissing || expenseMissing,
      };
    },
    [shipmentIdsWithBoe, shipmentIdsWithExpense]
  );

  React.useEffect(() => {
    setPage(1);
  }, [
    statusFilter,
    supplierFilterId,
    dateFromFilter,
    dateToFilter,
    urlOverdue,
    urlBoeMissing,
    urlExpenseMissing,
  ]);

  React.useEffect(() => {
    if (!user?.id) return;
    if (!urlOverdue && !urlBoeMissing && !urlExpenseMissing) return;
    const q = new URLSearchParams();
    if (urlOverdue) q.set('overdue', 'true');
    if (urlBoeMissing) q.set('boe_missing', 'true');
    if (urlExpenseMissing) q.set('expense_missing', 'true');
    void logDashboardActivity({
      userId: user.id,
      actionType: 'shipment_exception_view',
      details: JSON.stringify({
        overdue: urlOverdue,
        boe_missing: urlBoeMissing,
        expense_missing: urlExpenseMissing,
      }),
      moduleName: 'Shipment',
      navigationTarget: `/shipment?${q.toString()}`,
    });
  }, [user?.id, urlOverdue, urlBoeMissing, urlExpenseMissing]);

  const fetchShipments = React.useCallback(async () => {
    try {
      const result = await invoke<PaginatedResult<Shipment>>(
        'get_shipments_paginated',
        {
          page,
          pageSize,
          status: statusFilter !== 'All' ? statusFilter : null,
          supplierId: supplierFilterId || null,
          dateFrom: dateFromFilter || null,
          dateTo: dateToFilter || null,
          overdueOnly: urlOverdue || null,
          boeMissingOnly: urlBoeMissing || null,
          expenseMissingOnly: urlExpenseMissing || null,
        }
      );
      const safeData = Array.isArray(result?.data) ? result.data : [];
      const safeTotalCount = Number.isFinite(result?.totalCount)
        ? result.totalCount
        : safeData.length;
      setShipments(safeData);
      setTotalCount(safeTotalCount);
    } catch (error) {
      console.error('Failed to fetch shipments:', error);
      notifications.shipment.error('load', String(error));
    }
  }, [
    notifications.shipment,
    page,
    pageSize,
    statusFilter,
    supplierFilterId,
    dateFromFilter,
    dateToFilter,
    urlOverdue,
    urlBoeMissing,
    urlExpenseMissing,
  ]);

  const handleOpenFormForEdit = React.useCallback(
    (shipment: Shipment) => {
      navigate(shipmentDetailPath(shipment.id, 'edit'));
    },
    [navigate]
  );

  const handleOpenFormForAdd = React.useCallback(() => {
    setShipmentToEdit(null);
    setFormOpen(true);
  }, []);

  const handleView = React.useCallback(
    (shipment: Shipment) => {
      navigate(shipmentDetailPath(shipment.id, 'view'));
    },
    [navigate]
  );

  React.useEffect(() => {
    if (shipmentPanel === 'edit' && selectedShipmentFromUrl) {
      setShipmentToEdit(selectedShipmentFromUrl);
    } else if (shipmentPanel === 'none') {
      setShipmentToEdit(null);
    }
  }, [shipmentPanel, selectedShipmentFromUrl]);

  const handleMarkAsDelivered = React.useCallback(
    async (shipment: Shipment) => {
      try {
        const today = new Date().toISOString().split('T')[0];
        await invoke('update_shipment_status', {
          shipmentId: shipment.id,
          status: 'delivered',
          dateOfDelivery: today,
        });
        notifications.shipment.delivered(shipment.invoiceNumber);
        fetchShipments();
      } catch (error) {
        console.error('Failed to mark shipment as delivered:', error);
        notifications.shipment.error('mark as delivered', String(error));
      }
    },
    [fetchShipments, notifications.shipment]
  );

  const handleCheckStatusUpdates = React.useCallback(async () => {
    try {
      await invoke('check_and_update_ready_for_delivery');
      notifications.success(
        'Status Check Complete',
        'Shipment status check completed successfully'
      );
      fetchShipments();
    } catch (error) {
      console.error('Failed to check shipment status updates:', error);
      notifications.shipment.error('check status updates', String(error));
    }
  }, [fetchShipments, notifications]);

  const handleMigrateStatuses = React.useCallback(async () => {
    try {
      await invoke('migrate_shipment_statuses');
      notifications.success(
        'Migration Complete',
        'Shipment status migration completed successfully'
      );
      fetchShipments();
    } catch (error) {
      console.error('Failed to migrate shipment statuses:', error);
      notifications.shipment.error('migrate statuses', String(error));
    }
  }, [fetchShipments, notifications]);

  const columns = React.useMemo(
    () =>
      createShipmentColumns(
        suppliers,
        handleView,
        handleOpenFormForEdit,
        handleMarkAsDelivered
      ),
    [suppliers, handleView, handleOpenFormForEdit, handleMarkAsDelivered]
  );

  const fetchOptions = React.useCallback(async () => {
    try {
      const [
        fetchedCategories,
        fetchedIncoterms,
        fetchedModes,
        fetchedTypes,
        fetchedStatuses,
        fetchedCurrencies,
      ] = await Promise.all([
        invoke('get_categories'),
        invoke('get_incoterms'),
        invoke('get_shipment_modes'),
        invoke('get_shipment_types'),
        invoke('get_shipment_statuses'),
        invoke('get_currencies'),
      ]);
      setCategories(fetchedCategories as Option[]);
      setIncoterms(fetchedIncoterms as Option[]);
      setModes(fetchedModes as Option[]);
      setTypes(fetchedTypes as Option[]);
      setStatuses(fetchedStatuses as Option[]);
      setCurrencies(fetchedCurrencies as Option[]);
    } catch (error) {
      console.error('Failed to fetch options:', error);
      notifications.shipment.error('load dropdown options', String(error));
    }
  }, [notifications.shipment]);

  React.useEffect(() => {
    const fetchInitialData = async () => {
      setIsInitialLoad(true);
      try {
        const fetchedSuppliers: Supplier[] = await invoke('get_suppliers');
        const supplierOptions = fetchedSuppliers.map(s => ({
          value: s.id,
          label: formatText(s.supplierName, settings.textFormat),
        }));
        setSuppliers(supplierOptions);
        await fetchOptions();
        try {
          const [boeIds, expIds] = await Promise.all([
            invoke<string[]>('get_shipment_ids_with_boe_calculations'),
            invoke<string[]>('get_shipment_ids_with_expense_lines'),
          ]);
          setShipmentIdsWithBoe(new Set(boeIds));
          setShipmentIdsWithExpense(new Set(expIds));
        } catch {
          setShipmentIdsWithBoe(new Set());
          setShipmentIdsWithExpense(new Set());
        }
      } catch (error) {
        console.error('Failed to load initial data:', error);
        notifications.shipment.error('load initial data', String(error));
      } finally {
        setIsInitialLoad(false);
      }
    };
    fetchInitialData();
  }, [settings.textFormat, fetchOptions, notifications.shipment]);

  React.useEffect(() => {
    void fetchShipments();
  }, [fetchShipments]);

  const fetchExceptionSummary = React.useCallback(async () => {
    try {
      const summary = await invoke<ShipmentExceptionSummary>(
        'get_shipment_exception_summary'
      );
      setExceptionSummary(summary);
    } catch (error) {
      console.error('Failed to load shipment exception summary:', error);
    }
  }, []);

  React.useEffect(() => {
    void fetchExceptionSummary();
  }, [fetchExceptionSummary]);

  async function handleSubmit(shipmentData: Omit<Shipment, 'id'>) {
    try {
      const candidateId = shipmentToEdit?.id ?? null;
      const isDuplicate = await invoke<boolean>('check_shipment_duplicate', {
        shipmentId: candidateId,
        invoiceNumber: shipmentData.invoiceNumber,
        excludeId: shipmentToEdit?.id ?? null,
      });
      if (isDuplicate) {
        notifications.error(
          'Duplicate Shipment',
          `A shipment with ID or invoice "${shipmentData.invoiceNumber}" already exists.`
        );
        return;
      }

      if (shipmentToEdit) {
        const updatedShipment = { ...shipmentToEdit, ...shipmentData };
        await invoke('update_shipment', { shipment: updatedShipment });
        notifications.shipment.updated(updatedShipment.invoiceNumber);
      } else {
        const maxId = shipments.reduce(
          (max, s) => Math.max(max, parseInt(s.id.split('-')[1] || '0')),
          0
        );
        const newId = `SHP-${(maxId + 1).toString().padStart(3, '0')}`;
        const newShipment: Shipment = { id: newId, ...shipmentData };
        await invoke('add_shipment', { shipment: newShipment });
        notifications.shipment.created(newShipment.invoiceNumber);
      }
      fetchShipments();
      if (shipmentPanel === 'edit') {
        navigate('/shipment');
      } else {
        setFormOpen(false);
      }
    } catch (error) {
      console.error('Failed to save shipment:', error);
      notifications.shipment.error('save', String(error));
    }
  }

  const handleDownloadTemplate = () => {
    const csv = buildShipmentImportTemplateCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'shipment_template.csv';
    a.click();
    URL.revokeObjectURL(url);
    notifications.success(
      'Template Downloaded',
      'Shipment import template downloaded successfully!'
    );
  };

  async function handleImport() {
    try {
      const selectedFile = await openTextFile({
        multiple: false,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      if (!selectedFile) {
        notifications.info('Import Cancelled', 'Import cancelled.');
        return;
      }
      const importFileName =
        (selectedFile.name || selectedFile.path || '').trim() || 'uploaded.csv';

      const detectedMimeType = (
        selectedFile as { mimeType?: string | null }
      ).mimeType
        ?.trim()
        .toLowerCase();
      const allowedMimeTypes = new Set(['text/csv', 'text/plain']);
      if (detectedMimeType && !allowedMimeTypes.has(detectedMimeType)) {
        notifications.error(
          'Invalid file type detected',
          'Please upload a valid CSV file.'
        );
        return;
      }

      const headerSample = selectedFile.contents.slice(0, 500);
      const hasZipBinarySignature = sampleLooksLikeZipLocalHeader(headerSample);
      const nonPrintableChars = countNonPrintableAsciiCsvChars(headerSample);
      const hasBinaryProfile =
        headerSample.length > 0 &&
        nonPrintableChars / headerSample.length > 0.25;
      const hasCsvDelimiterHint = /[,;]/.test(headerSample);

      if (hasZipBinarySignature || hasBinaryProfile || !hasCsvDelimiterHint) {
        notifications.error(
          'Invalid file type detected',
          'Please upload a valid CSV file.'
        );
        return;
      }

      const firstNonEmptyLine =
        selectedFile.contents
          .split(/\r\n|\n|\r/)
          .find(line => line.trim().length > 0) ?? '';
      if (!firstNonEmptyLine) {
        notifications.error(
          'Invalid file type detected',
          'Please upload a valid CSV file.'
        );
        return;
      }

      const delimiter = guessShipmentCsvDelimiter(headerSample);
      const canonicalHeaders = firstNonEmptyLine.split(delimiter).map(header =>
        canonicalShipmentCsvHeader(
          header
            .trim()
            .replace(/^"+|"+$/g, '')
            .replace(/^\uFEFF/, '')
        )
      );
      const hasRequiredHeaders =
        canonicalHeaders.includes('invoiceNumber') &&
        canonicalHeaders.includes('supplierId');
      if (!hasRequiredHeaders) {
        notifications.error(
          'Invalid file type detected',
          'Please upload a valid CSV file.'
        );
        return;
      }

      const { data: importRows, errors: parseErrors } =
        await parseShipmentImportCsvStream(selectedFile.contents);
      if (parseErrors.length > 0) {
        console.error('Shipment CSV parse errors:', parseErrors);
        notifications.warning(
          'CSV parse warnings',
          parseErrors.map(e => e.message).join('; ')
        );
      }

      const seenInvoiceNumbers = new Set(
        shipments.map(s => s.invoiceNumber.toLowerCase())
      );
      const numericSuffixFromShipmentId = (id: string): number => {
        const parts = id.split('-');
        const last = parts[parts.length - 1] ?? '';
        const n = parseInt(last, 10);
        return Number.isNaN(n) ? 0 : n;
      };
      let maxId = shipments.reduce(
        (max, s) => Math.max(max, numericSuffixFromShipmentId(s.id)),
        0
      );

      const newShipments: Shipment[] = [];
      const duplicateRows: number[] = [];
      const missingInvoiceRows: number[] = [];
      for (const [rowIndex, row] of importRows.entries()) {
        const invoiceNumber = row.invoiceNumber?.trim();
        if (!invoiceNumber) {
          missingInvoiceRows.push(rowIndex + 1);
          continue;
        }

        const normalizedInvoiceNumber = invoiceNumber.toLowerCase();
        if (seenInvoiceNumbers.has(normalizedInvoiceNumber)) {
          duplicateRows.push(rowIndex + 1);
          continue;
        }
        seenInvoiceNumbers.add(normalizedInvoiceNumber);
        maxId++;

        const supplierId = row.supplierId || '';

        newShipments.push({
          id: `SHP-${maxId.toString().padStart(3, '0')}`,
          supplierId: supplierId,
          invoiceNumber,
          invoiceDate: row.invoiceDate,
          goodsCategory: row.goodsCategory,
          invoiceValue: parseFloat(row.invoiceValue) || 0,
          invoiceCurrency: row.invoiceCurrency,
          incoterm: row.incoterm,
          shipmentMode: row.shipmentMode,
          shipmentType: row.shipmentType,
          blAwbNumber: row.blAwbNumber,
          blAwbDate: row.blAwbDate,
          vesselName: row.vesselName,
          containerNumber: row.containerNumber,
          grossWeightKg: parseFloat(row.grossWeightKg) || 0,
          etd: row.etd,
          eta: row.eta,
          status: row.status,
          dateOfDelivery: row.dateOfDelivery,
          isFrozen: false,
        });
      }

      if (duplicateRows.length > 0 || missingInvoiceRows.length > 0) {
        const formatRowList = (rows: number[]): string => {
          const preview = rows.slice(0, 20);
          const extraCount = rows.length - preview.length;
          return extraCount > 0
            ? `${preview.join(', ')}... (+${extraCount} more)`
            : preview.join(', ');
        };

        const warningSections: string[] = [];
        if (duplicateRows.length > 0) {
          warningSections.push(
            `Duplicate Invoice Numbers: ${duplicateRows.length} rows`,
            `Rows: ${formatRowList(duplicateRows)}`
          );
        }
        if (missingInvoiceRows.length > 0) {
          warningSections.push(
            `Missing Invoice Numbers: ${missingInvoiceRows.length} rows`,
            `Rows: ${formatRowList(missingInvoiceRows)}`
          );
        }

        notifications.warning(
          'Import completed with warnings',
          warningSections.join('\n\n')
        );
      }

      if (newShipments.length > 0) {
        try {
          const totalRows = importRows.length;
          const skippedRows = duplicateRows.length + missingInvoiceRows.length;
          const validationErrors = (await invoke('validate_shipment_import', {
            shipments: newShipments,
          })) as string[];

          if (validationErrors && validationErrors.length > 0) {
            try {
              await invoke('log_shipment_import_result', {
                file_name: importFileName,
                total_rows: totalRows,
                inserted_rows: 0,
                skipped_rows: skippedRows,
                error_rows: validationErrors.length,
                status: 'FAILED',
              });
            } catch (logError) {
              console.error(
                'Failed to write shipment import audit log:',
                logError
              );
            }
            const errorMessage = validationErrors.join('\n');
            notifications.error('Import Validation Failed', errorMessage, {
              duration: 10000,
            });
            return;
          }

          await invoke('add_shipments_bulk', {
            shipments: newShipments,
            file_name: importFileName,
            total_rows: totalRows,
            skipped_rows: skippedRows,
            error_rows: 0,
          });
          notifications.shipment.imported(newShipments.length);
          fetchShipments();
        } catch (error) {
          console.error('Failed to import shipments:', error);
          notifications.shipment.error('import', String(error));
        }
      } else {
        const hasDataRows = importRows.length > 0;
        const anyInvoice = importRows.some(r => r.invoiceNumber?.trim());
        if (hasDataRows && !anyInvoice) {
          notifications.error(
            'Invalid Shipment Import',
            'This file does not match the shipment import template (missing invoice numbers / wrong column headers). Download the template and try again.'
          );
          return;
        }
        notifications.info('No New Data', 'No new shipments to import.');
      }
    } catch (error) {
      console.error('Failed to import shipments:', error);
      notifications.shipment.error('import', 'Please check the file format.');
    }
  }

  const exportShipmentsData = async (
    _dataToExport: Shipment[]
  ): Promise<void> => {
    if (_dataToExport.length === 0) {
      notifications.warning(
        'No Data to Export',
        'No data available to export.'
      );
      return;
    }

    const csvHeaders = [
      'id',
      'supplierName',
      'invoiceNumber',
      'invoiceDate',
      'goodsCategory',
      'invoiceValue',
      'invoiceCurrency',
      'incoterm',
      'shipmentMode',
      'shipmentType',
      'blAwbNumber',
      'blAwbDate',
      'vesselName',
      'containerNumber',
      'grossWeightKg',
      'etd',
      'eta',
      'status',
      'dateOfDelivery',
    ];

    const exportableData = _dataToExport.map((shipment: Shipment) => {
      const supplier = suppliers.find(s => s.value === shipment.supplierId);
      return {
        id: shipment.id || '',
        supplierName: supplier ? supplier.label : 'Unknown',
        invoiceNumber: shipment.invoiceNumber || '',
        invoiceDate: shipment.invoiceDate || '',
        goodsCategory: shipment.goodsCategory || '',
        invoiceValue: shipment.invoiceValue || 0,
        invoiceCurrency: shipment.invoiceCurrency || '',
        incoterm: shipment.incoterm || '',
        shipmentMode: shipment.shipmentMode || '',
        shipmentType: shipment.shipmentType || '',
        blAwbNumber: shipment.blAwbNumber || '',
        blAwbDate: shipment.blAwbDate || '',
        vesselName: shipment.vesselName || '',
        containerNumber: shipment.containerNumber || '',
        grossWeightKg: shipment.grossWeightKg || 0,
        etd: shipment.etd || '',
        eta: shipment.eta || '',
        status: shipment.status || '',
        dateOfDelivery: shipment.dateOfDelivery || '',
      };
    });

    const csv = Papa.unparse({
      fields: csvHeaders,
      data: exportableData,
    });

    try {
      if (!useNativeFileDialogs) {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'shipments.csv';
        a.click();
        URL.revokeObjectURL(url);
        notifications.shipment.exported(_dataToExport.length);
        return;
      }

      const filePath = await save({
        defaultPath: 'shipments.csv',
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      if (filePath) {
        await writeTextFile(filePath, csv);
        notifications.shipment.exported(_dataToExport.length);
      }
    } catch (error) {
      console.error('Failed to export shipments:', error);
      notifications.shipment.error('export', String(error));
    }
  };

  async function handleOptionCreate(type: OptionType, newOption: Option) {
    const correctlyCasedOption = {
      value: newOption.label,
      label: newOption.label,
    };
    const stateUpdater = {
      supplier: setSuppliers,
      category: setCategories,
      incoterm: setIncoterms,
      mode: setModes,
      type: setTypes,
      status: setStatuses,
      currency: setCurrencies,
    };

    stateUpdater[type](prev => [...prev, correctlyCasedOption]);
    try {
      await invoke('add_option', {
        optionType: type,
        option: correctlyCasedOption,
      });
      notifications.success(
        'Option Added',
        `New ${type} "${correctlyCasedOption.label}" saved.`
      );
    } catch (error) {
      console.error(`Failed to save new ${type}:`, error);
      notifications.error('Save Failed', `Failed to save new ${type}.`);

      stateUpdater[type](prev =>
        prev.filter(opt => opt.value !== correctlyCasedOption.value)
      );
    }
  }

  // Filter only within current page results; status/supplier/date/exception filtering is server-side.
  const filteredShipments = React.useMemo(() => {
    if (!searchTerm) return shipments;
    return shipments.filter(
      shipment =>
        shipment.invoiceNumber
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        shipment.blAwbNumber
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        shipment.containerNumber
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        shipment.vesselName?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [shipments, searchTerm]);

  const totalPages = React.useMemo(
    () => Math.max(1, Math.ceil(totalCount / pageSize)),
    [totalCount, pageSize]
  );

  React.useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const renderEmptyState = React.useCallback(() => {
    const hasFilters = Boolean(
      searchTerm ||
      statusFilter !== 'All' ||
      supplierFilterId ||
      dateFromFilter ||
      dateToFilter ||
      urlOverdue ||
      urlBoeMissing ||
      urlExpenseMissing
    );
    return (
      <div className="im-empty-state">
        <div className="im-empty-state__icon">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
        </div>
        <div className="im-empty-state__title">
          {hasFilters ? 'NO MATCHING SHIPMENTS' : 'NO SHIPMENTS'}
        </div>
        <div className="im-empty-state__body">
          {hasFilters
            ? 'No shipments match the current filters. Try adjusting the search or clearing the active filters.'
            : 'No shipments have been added yet. Import a CSV or add your first shipment.'}
        </div>
        {!hasFilters && (
          <div className="im-empty-state__actions">
            <button
              className="im-hdr-btn im-hdr-btn--primary"
              onClick={handleOpenFormForAdd}
            >
              + Add Shipment
            </button>
          </div>
        )}
      </div>
    );
  }, [
    searchTerm,
    statusFilter,
    supplierFilterId,
    dateFromFilter,
    dateToFilter,
    urlOverdue,
    urlBoeMissing,
    urlExpenseMissing,
    handleOpenFormForAdd,
  ]);

  const settingsDialog = (
    <Dialog open={isSettingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-5xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Shipment Module Settings</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto pr-2">
          <ModuleSettings
            moduleName="shipment"
            moduleTitle="Shipment"
            onClose={() => setSettingsOpen(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );

  if (shipmentPanel !== 'none') {
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
            onClick={closeShipmentPanel}
          >
            ← Back to shipments
          </button>
          <span style={{ color: 'var(--color-im-faint)', fontSize: 12 }}>
            {shipmentPanel === 'view'
              ? 'Viewing shipment record'
              : 'Editing shipment record'}
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
          {isInitialLoad ? (
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
              LOADING SHIPMENT…
            </div>
          ) : !selectedShipmentFromUrl ? (
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
                SHIPMENT NOT FOUND
              </h2>
              <p style={{ fontSize: 12, color: 'var(--color-im-faint)' }}>
                No shipment with ID{' '}
                <span style={{ fontFamily: 'var(--font-im-mono)' }}>
                  {decodedShipmentId ?? shipmentIdParam}
                </span>
                .
              </p>
              <button
                type="button"
                className="im-btn"
                onClick={closeShipmentPanel}
                style={{ alignSelf: 'flex-start' }}
              >
                ← Back to shipments
              </button>
            </div>
          ) : shipmentPanel === 'view' ? (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              <ProfessionalShipmentViewDialog
                isOpen={true}
                onOpenChange={open => {
                  if (!open) closeShipmentPanel();
                }}
                shipment={selectedShipmentFromUrl}
                suppliers={suppliers}
                presentation="page"
                className="min-h-0 flex-1"
                onEdit={() =>
                  navigate(
                    shipmentDetailPath(selectedShipmentFromUrl.id, 'edit')
                  )
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
              <ProfessionalShipmentForm
                isOpen={true}
                presentation="page"
                className="min-h-0 flex-1"
                onOpenChange={open => {
                  if (!open) closeShipmentPanel();
                }}
                onSubmit={handleSubmit}
                shipmentToEdit={selectedShipmentFromUrl}
                suppliers={suppliers}
                categories={categories}
                incoterms={incoterms}
                modes={modes}
                types={types}
                statuses={statuses}
                currencies={currencies}
                onOptionCreate={handleOptionCreate}
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
      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="im-page-header">
        <div className="im-page-header__title">
          <h1>Shipments</h1>
          <span className="im-record-badge">{totalCount}</span>
        </div>
        <div className="im-page-header__actions">
          <button className="im-hdr-btn" onClick={handleDownloadTemplate}>
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
          <button className="im-hdr-btn" onClick={() => void handleImport()}>
            <Upload
              style={{
                width: 12,
                height: 12,
                display: 'inline',
                marginRight: 5,
              }}
            />
            Import
          </button>
          <button
            className="im-hdr-btn"
            onClick={() => void exportShipmentsData(filteredShipments)}
          >
            <Download
              style={{
                width: 12,
                height: 12,
                display: 'inline',
                marginRight: 5,
              }}
            />
            Export CSV
          </button>
          <button
            className="im-hdr-btn"
            onClick={() => setMultilineFormOpen(true)}
          >
            <Copy
              style={{
                width: 12,
                height: 12,
                display: 'inline',
                marginRight: 5,
              }}
            />
            Multi Paste
          </button>
          <button
            className="im-hdr-btn"
            onClick={() => void handleCheckStatusUpdates()}
          >
            <RefreshCw
              style={{
                width: 12,
                height: 12,
                display: 'inline',
                marginRight: 5,
              }}
            />
            Check Status
          </button>
          <button
            className="im-hdr-btn"
            onClick={() => void handleMigrateStatuses()}
          >
            <Database
              style={{
                width: 12,
                height: 12,
                display: 'inline',
                marginRight: 5,
              }}
            />
            Migrate
          </button>
          <button className="im-hdr-btn" onClick={() => setSettingsOpen(true)}>
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
            className="im-hdr-btn im-hdr-btn--primary"
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
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────────── */}
      <ShipmentDataTable
        columns={columns}
        data={filteredShipments}
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        statusFilter={statusFilter}
        onStatusFilterChange={f => {
          setStatusFilter(f);
          setPage(1);
        }}
        totalCount={totalCount}
        isLoading={isInitialLoad}
        getRowClassName={row => {
          const f = getShipmentExceptionFlags(row);
          if (f.overdue) return 'is-overdue';
          if (f.any) return 'is-exception';
          return '';
        }}
        renderEmptyState={renderEmptyState}
        supplierOptions={suppliers}
        supplierFilterId={supplierFilterId}
        onSupplierFilterChange={v => {
          setSupplierFilterId(v);
          setPage(1);
        }}
        dateFrom={formatDateForInput(dateFromFilter)}
        onDateFromChange={setDateFromFilter}
        dateTo={formatDateForInput(dateToFilter)}
        onDateToChange={setDateToFilter}
        urlOverdue={urlOverdue}
        onOverdueToggle={() => setUrlOverdue(v => !v)}
        urlBoeMissing={urlBoeMissing}
        onBoeMissingToggle={() => setUrlBoeMissing(v => !v)}
        urlExpenseMissing={urlExpenseMissing}
        onExpenseMissingToggle={() => setUrlExpenseMissing(v => !v)}
        onClearFilters={() => {
          setSupplierFilterId('');
          setDateFromFilter('');
          setDateToFilter('');
          setUrlOverdue(false);
          setUrlBoeMissing(false);
          setUrlExpenseMissing(false);
          setStatusFilter('All');
          setPage(1);
        }}
        overdueCount={exceptionSummary.overdueCount}
        boeMissingCount={exceptionSummary.boeMissingCount}
        expenseMissingCount={exceptionSummary.expenseMissingCount}
        serverPage={page}
        serverTotalPages={totalPages}
        onServerPrevPage={() => setPage(p => Math.max(1, p - 1))}
        onServerNextPage={() => setPage(p => Math.min(totalPages, p + 1))}
      />

      <ProfessionalShipmentForm
        isOpen={isFormOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        shipmentToEdit={shipmentToEdit}
        suppliers={suppliers}
        categories={categories}
        incoterms={incoterms}
        modes={modes}
        types={types}
        statuses={statuses}
        currencies={currencies}
        onOptionCreate={handleOptionCreate}
      />
      <ShipmentMultilineForm
        isOpen={isMultilineFormOpen}
        onOpenChange={setMultilineFormOpen}
        onSuccess={fetchShipments}
        suppliers={suppliers}
        categories={categories}
        incoterms={incoterms}
        modes={modes}
        types={types}
        statuses={statuses}
        currencies={currencies}
        existingShipments={shipments}
      />
      {settingsDialog}
    </div>
  );
};

export default ShipmentPage;
