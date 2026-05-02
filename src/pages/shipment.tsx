// src/pages/shipment/index.tsx
// react-table imports not used here; table lives in a shared component
import { invoke } from '@tauri-apps/api/core';
import {
  useNativeFileDialogs,
  openTextFile,
  save,
  writeTextFile,
} from '@/lib/tauri-bridge';
import {
  ArrowLeft,
  Download,
  Plus,
  Upload,
  RefreshCw,
  Settings,
  Database,
  AlertTriangle,
  Search,
  Package,
  Clock,
  Truck,
  Globe,
  Calendar,
  DollarSign,
  Activity,
  Copy,
  Ship,
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

import { ResponsiveDataTable } from '@/components/ui/responsive-table';
import { getShipmentColumns } from '@/components/shipment/columns';
import { ProfessionalShipmentForm } from '@/components/shipment/form-professional';
import { ProfessionalShipmentViewDialog } from '@/components/shipment/view-professional';
import { ShipmentMultilineForm } from '@/components/shipment/shipment-multiline-form';
import { ModuleSettings } from '@/components/module-settings';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { logDashboardActivity } from '@/lib/dashboard-activity';
import { isShipmentEtaOverdue } from '@/lib/shipment-exception-helpers';
import { formatDateForInput } from '@/lib/date-format';
import { formatText } from '@/lib/settings';
import { useSettings } from '@/lib/use-settings';
import { useUser } from '@/lib/user-context';
import { useResponsiveContext } from '@/providers/ResponsiveProvider';
import type { Option } from '@/types/options';
import type { Shipment } from '@/types/shipment';
import type { Supplier } from '@/types/supplier';

/** URL path for shipment view or edit (bookmarkable). */
export function shipmentDetailPath(shipmentId: string, mode: 'view' | 'edit') {
  return `/shipment/${encodeURIComponent(shipmentId)}/${mode}`;
}

/** ZIP local file header: PK + bytes 0x03 0x04; optional leading BOM (no control chars in RegExp sources). */
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

type ShipmentItemLite = {
  id: string;
  invoiceId: string;
  itemId: string;
  partNumber: string;
  itemDescription: string;
  quantity: number;
  unitPrice: number;
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
  const { getButtonClass } = useResponsiveContext();
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
  const [viewMode, setViewMode] = React.useState<'table' | 'cards'>('cards');
  const [searchInput, setSearchInput] = React.useState('');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(50);
  const [totalCount, setTotalCount] = React.useState(0);
  const [expandedShipmentIds, setExpandedShipmentIds] = React.useState<
    Set<string>
  >(() => new Set());
  const [, setExpandedShipmentOrder] = React.useState<string[]>([]);
  const [shipmentItemsById, setShipmentItemsById] = React.useState<
    Record<string, ShipmentItemLite[]>
  >({});
  const [, setShipmentItemsCacheOrder] = React.useState<string[]>([]);
  const [exceptionSummary, setExceptionSummary] =
    React.useState<ShipmentExceptionSummary>({
      overdueCount: 0,
      boeMissingCount: 0,
      expenseMissingCount: 0,
    });
  const [loadingShipmentItemsById, setLoadingShipmentItemsById] =
    React.useState<Record<string, boolean>>({});

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

  /** Deep link `/shipment?id=<shipmentId>` → canonical `/shipment/:id/view` (preserves other query params). */
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
        const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
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

  const handleCopyShipmentId = async (shipmentId: string) => {
    try {
      await navigator.clipboard.writeText(shipmentId);
      notifications.success(
        'Copied',
        `Shipment ID "${shipmentId}" copied to clipboard!`
      );
    } catch (error) {
      console.error('Failed to copy shipment ID:', error);
      notifications.error(
        'Copy Failed',
        'Failed to copy shipment ID to clipboard.'
      );
    }
  };

  // Calculate metrics
  const metrics = React.useMemo(() => {
    const docsReceived = shipments.filter(
      s => s.status === 'docs-rcvd' || s.status === 'docu-received'
    ).length;
    const inTransit = shipments.filter(s => s.status === 'in-transit').length;
    const customsClearance = shipments.filter(
      s => s.status === 'customs-clearance'
    ).length;
    const readyForDelivery = shipments.filter(
      s => s.status === 'ready-dly'
    ).length;

    return {
      docsReceived,
      inTransit,
      customsClearance,
      readyForDelivery,
    };
  }, [shipments]);

  // Filter only within current page results; status/supplier/date/exception filtering is server-side.
  const filteredShipments = React.useMemo(() => {
    let filtered = shipments;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(
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
    }

    return filtered;
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

  const columns = React.useMemo(
    () =>
      getShipmentColumns(
        suppliers,
        handleView,
        handleOpenFormForEdit,
        handleMarkAsDelivered,
        settings
      ),
    [
      suppliers,
      handleView,
      handleOpenFormForEdit,
      handleMarkAsDelivered,
      settings,
    ]
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

        // Use supplier ID as is - validation will catch invalid values
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
          // First validate the shipments
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
            // Show validation errors in a detailed notification
            const errorMessage = validationErrors.join('\n');
            notifications.error('Import Validation Failed', errorMessage, {
              duration: 10000,
            });
            return;
          }

          // If validation passes, proceed with import
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

  // Helper used by export buttons
  // Export helper used by inline handlers (kept for future toolbar wiring)
  // Reference from commented toolbar below; kept for future use
  // Declare and immediately use; keeps function referenced so TS doesn't flag unused in strict mode
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

  // Helper function to get status badge variant
  const getStatusBadgeVariant = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'delivered':
        return 'success';
      case 'in-transit':
        return 'default';
      case 'ready-dly':
        return 'warning';
      case 'customs-clearance':
        return 'secondary';
      case 'docs-rcvd':
      case 'docu-received':
        return 'info';
      default:
        return 'outline';
    }
  };

  // Helper function to get status display name
  const getStatusDisplayName = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'delivered':
        return 'Delivered';
      case 'in-transit':
        return 'In Transit';
      case 'ready-dly':
        return 'Ready for Delivery';
      case 'customs-clearance':
        return 'Customs Clearance';
      case 'docs-rcvd':
      case 'docu-received':
        return 'Document Received';
      default:
        return status || 'Unknown';
    }
  };

  // CRM Card Component
  type ShipmentExceptionFlags = {
    overdue: boolean;
    boeMissing: boolean;
    expenseMissing: boolean;
    any: boolean;
  };

  const toggleShipmentItems = React.useCallback(
    async (shipmentId: string) => {
      const willExpand = !expandedShipmentIds.has(shipmentId);
      setExpandedShipmentIds(prev => {
        const next = new Set(prev);
        if (next.has(shipmentId)) {
          next.delete(shipmentId);
        } else {
          next.add(shipmentId);
        }
        return next;
      });
      setExpandedShipmentOrder(prev => {
        const next = prev.filter(id => id !== shipmentId);
        if (willExpand) {
          next.push(shipmentId);
          const MAX_EXPANDED_ROWS = 12;
          if (next.length > MAX_EXPANDED_ROWS) {
            const evicted = next.shift();
            if (evicted) {
              setExpandedShipmentIds(current => {
                const updated = new Set(current);
                updated.delete(evicted);
                return updated;
              });
            }
          }
        }
        return next;
      });

      const touchLru = () => {
        setShipmentItemsCacheOrder(prev => {
          const next = prev.filter(id => id !== shipmentId);
          next.push(shipmentId);
          return next;
        });
      };

      if (!willExpand) {
        return;
      }
      if (shipmentItemsById[shipmentId]) {
        touchLru();
        return;
      }
      if (loadingShipmentItemsById[shipmentId]) return;
      try {
        setLoadingShipmentItemsById(prev => ({ ...prev, [shipmentId]: true }));
        const rows = await invoke<ShipmentItemLite[]>(
          'get_shipment_items_by_shipment_id',
          { shipmentId }
        );
        setShipmentItemsById(prev => ({ ...prev, [shipmentId]: rows }));
        const evicted: string[] = [];
        setShipmentItemsCacheOrder(prev => {
          const MAX_CACHE_ENTRIES = 40;
          const nextOrder = prev.filter(id => id !== shipmentId);
          nextOrder.push(shipmentId);
          while (nextOrder.length > MAX_CACHE_ENTRIES) {
            const candidate = nextOrder[0];
            if (!candidate) break;
            if (expandedShipmentIds.has(candidate)) break;
            evicted.push(candidate);
            nextOrder.shift();
          }
          return nextOrder;
        });
        if (evicted.length > 0) {
          setShipmentItemsById(prev => {
            const next = { ...prev };
            for (const key of evicted) {
              delete next[key];
            }
            return next;
          });
        }
      } catch (error) {
        notifications.shipment.error('load shipment items', String(error));
      } finally {
        setLoadingShipmentItemsById(prev => ({ ...prev, [shipmentId]: false }));
      }
    },
    [
      expandedShipmentIds,
      shipmentItemsById,
      loadingShipmentItemsById,
      notifications.shipment,
    ]
  );

  const ShipmentCard = ({
    shipment,
    flags,
  }: {
    shipment: Shipment;
    flags: ShipmentExceptionFlags;
  }) => {
    const supplier = suppliers.find(s => s.value === shipment.supplierId);
    const isExpanded = expandedShipmentIds.has(shipment.id);
    const isItemsLoading = loadingShipmentItemsById[shipment.id] === true;
    const items = shipmentItemsById[shipment.id] ?? [];

    return (
      <Card
        className={`cursor-pointer transition-shadow duration-200 hover:shadow-lg ${
          flags.overdue
            ? 'ring-2 ring-amber-400/80'
            : flags.any
              ? 'ring-1 ring-sky-400/70'
              : ''
        }`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="mb-1 text-lg font-semibold text-white">
                {shipment.invoiceNumber}
              </CardTitle>
              <CardDescription className="mb-2 text-sm text-white/80">
                {supplier?.label || 'Unknown Supplier'}
              </CardDescription>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={getStatusBadgeVariant(shipment.status || '')}
                  className="text-xs"
                >
                  {getStatusDisplayName(shipment.status || '')}
                </Badge>
                {flags.overdue && (
                  <Badge variant="warning" className="text-xs">
                    Overdue ETA
                  </Badge>
                )}
                {flags.boeMissing && (
                  <Badge variant="secondary" className="text-xs">
                    No BOE
                  </Badge>
                )}
                {flags.expenseMissing && (
                  <Badge variant="outline" className="text-xs">
                    No expenses
                  </Badge>
                )}
                <div className="flex items-center gap-1">
                  <span className="text-xs text-white/70">#{shipment.id}</span>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={e => {
                      e.stopPropagation();
                      handleCopyShipmentId(shipment.id);
                    }}
                    className="h-6 w-6 p-0"
                    title="Copy Shipment ID"
                    useAccentColor
                  >
                    <Copy className="h-3 w-3 text-white/60 hover:text-white" />
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex gap-1">
              <Button
                variant="default"
                size="sm"
                onClick={() => handleView(shipment)}
                className="h-8 w-8 p-0"
                useAccentColor
              >
                <Search className="h-4 w-4" />
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => handleOpenFormForEdit(shipment)}
                className="h-8 w-8 p-0"
                useAccentColor
              >
                <Activity className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            {/* Key Information */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <DollarSign className="h-4 w-4 text-white/70" />
                <span className="font-medium text-white">
                  {formatCurrency(
                    shipment.invoiceValue || 0,
                    shipment.invoiceCurrency || 'USD'
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Package className="h-4 w-4 text-white/70" />
                <span className="font-medium text-white">
                  {shipment.goodsCategory}
                </span>
              </div>
              {shipment.grossWeightKg && (
                <div className="flex items-center gap-2 text-sm">
                  <Ship className="h-4 w-4 text-white/70" />
                  <span className="font-medium text-white">
                    {shipment.grossWeightKg} kg
                  </span>
                </div>
              )}
            </div>

            {/* Dates */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-white/70" />
                <span className="font-medium text-white">
                  Invoice: {shipment.invoiceDate}
                </span>
              </div>
              {shipment.eta && (
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-white/70" />
                  <span className="font-medium text-white">
                    ETA: {shipment.eta}
                  </span>
                </div>
              )}
            </div>

            {/* Shipping Details */}
            {(shipment.blAwbNumber ||
              shipment.vesselName ||
              shipment.containerNumber) && (
              <div className="border-t border-white/20 pt-2">
                <div className="mb-2 flex items-center gap-2 text-sm">
                  <Ship className="h-4 w-4 text-white/70" />
                  <span className="font-medium text-white">
                    Shipping Details
                  </span>
                </div>
                {shipment.blAwbNumber && (
                  <div className="mb-1 text-xs text-white/60">
                    <span className="font-medium">B/L:</span>{' '}
                    {shipment.blAwbNumber}
                  </div>
                )}
                {shipment.vesselName && (
                  <div className="mb-1 text-xs text-white/60">
                    <span className="font-medium">Vessel:</span>{' '}
                    {shipment.vesselName}
                  </div>
                )}
                {shipment.containerNumber && (
                  <div className="text-xs text-white/60">
                    <span className="font-medium">Container:</span>{' '}
                    {shipment.containerNumber}
                  </div>
                )}
              </div>
            )}
            <div className="border-t border-white/20 pt-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => toggleShipmentItems(shipment.id)}
                className="text-xs"
              >
                {isExpanded ? 'Hide items' : 'Show items'}
              </Button>
              {isExpanded && (
                <div className="mt-2 space-y-1 text-xs text-white/80">
                  {isItemsLoading ? (
                    <p>Loading items...</p>
                  ) : items.length === 0 ? (
                    <p>No linked invoice items.</p>
                  ) : (
                    items.map(item => (
                      <div
                        key={item.id}
                        className="rounded bg-black/10 px-2 py-1"
                      >
                        {item.partNumber || item.itemId} - Qty {item.quantity} @{' '}
                        {item.unitPrice}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

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
      <div className="from-background to-muted/20 bg-linear-to-br flex min-h-screen flex-col">
        <div className="container mx-auto flex min-h-0 flex-1 flex-col px-4 py-6">
          <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              useAccentColor
              onClick={closeShipmentPanel}
              className="gap-2"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Back to shipments
            </Button>
            <span className="text-muted-foreground text-sm">
              {shipmentPanel === 'view'
                ? 'Viewing shipment record'
                : 'Editing shipment record'}
            </span>
          </div>

          {isInitialLoad ? (
            <div
              className="border-border bg-card text-muted-foreground flex min-h-[240px] w-full max-w-6xl flex-1 items-center justify-center self-center rounded-xl border text-sm shadow-sm"
              role="status"
              aria-live="polite"
            >
              Loading shipment…
            </div>
          ) : !selectedShipmentFromUrl ? (
            <div className="border-border bg-card mx-auto flex w-full max-w-lg flex-col gap-4 rounded-xl border p-8 shadow-sm">
              <h2 className="text-card-foreground text-lg font-semibold">
                Shipment not found
              </h2>
              <p className="text-muted-foreground text-sm">
                No shipment with ID{' '}
                <span className="text-foreground font-mono">
                  {decodedShipmentId ?? shipmentIdParam}
                </span>
                .
              </p>
              <Button
                type="button"
                variant="default"
                useAccentColor
                onClick={closeShipmentPanel}
                className="w-fit"
              >
                Back to shipments
              </Button>
            </div>
          ) : shipmentPanel === 'view' ? (
            <div className="border-border bg-card flex min-h-0 w-full max-w-6xl flex-1 flex-col self-center overflow-hidden rounded-xl border shadow-sm">
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
            <div className="border-border bg-card flex min-h-0 w-full max-w-6xl flex-1 flex-col self-center overflow-hidden rounded-xl border shadow-sm">
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
    <div className="container mx-auto px-4 py-6">
      {/* CRM Header */}
      <div className="mb-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="mb-2 text-xl font-semibold text-blue-600">
              Shipment Management
            </h1>
            <p className="text-muted-foreground">
              Track and manage your international shipments and logistics
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="default"
              onClick={handleDownloadTemplate}
              className={getButtonClass()}
              useAccentColor
            >
              <Download className="mr-2 h-4 w-4" />
              Template
            </Button>
            <Button
              variant="default"
              onClick={handleImport}
              className={getButtonClass()}
              useAccentColor
            >
              <Upload className="mr-2 h-4 w-4" />
              Import
            </Button>
            <Button
              variant="default"
              onClick={() => exportShipmentsData(filteredShipments)}
              className={getButtonClass()}
              useAccentColor
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button
              variant="default"
              onClick={() => setMultilineFormOpen(true)}
              className={getButtonClass()}
              useAccentColor
            >
              <Copy className="mr-2 h-4 w-4" />
              Multi-line Paste
            </Button>
            <Button
              variant="default"
              onClick={handleOpenFormForAdd}
              className={getButtonClass()}
              useAccentColor
            >
              <Plus className="mr-2 h-4 w-4" />
              Add New
            </Button>
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
          </div>
        </div>

        {/* Metrics Dashboard */}
        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-linear-to-r border-white/20 from-white/10 to-white/20">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-white/80">
                    Document Received
                  </p>
                  <p className="text-lg font-bold text-white">
                    {metrics.docsReceived}
                  </p>
                </div>
                <Clock className="h-5 w-5 text-white/70" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-linear-to-r border-white/20 from-white/10 to-white/20">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-white/80">
                    In Transit
                  </p>
                  <p className="text-lg font-bold text-white">
                    {metrics.inTransit}
                  </p>
                </div>
                <Truck className="h-5 w-5 text-white/70" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-linear-to-r border-white/20 from-white/10 to-white/20">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-white/80">
                    Customs Clearance
                  </p>
                  <p className="text-lg font-bold text-white">
                    {metrics.customsClearance}
                  </p>
                </div>
                <Globe className="h-5 w-5 text-white/70" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-linear-to-r border-white/20 from-white/10 to-white/20">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-white/80">
                    Ready for Delivery
                  </p>
                  <p className="text-lg font-bold text-white">
                    {metrics.readyForDelivery}
                  </p>
                </div>
                <Package className="h-5 w-5 text-white/70" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-muted/20 mb-4 border-amber-200/60">
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium">
              Exception awareness
            </CardTitle>
            <CardDescription className="text-xs">
              Global totals across all shipments. Quick filters align with
              dashboard exception routes.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="text-muted-foreground flex flex-wrap gap-4 text-sm">
              <span>
                Overdue ETA:{' '}
                <span className="text-foreground font-semibold">
                  {exceptionSummary.overdueCount}
                </span>
              </span>
              <span>
                Missing BOE:{' '}
                <span className="text-foreground font-semibold">
                  {exceptionSummary.boeMissingCount}
                </span>
              </span>
              <span>
                Missing expenses:{' '}
                <span className="text-foreground font-semibold">
                  {exceptionSummary.expenseMissingCount}
                </span>
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={urlOverdue ? 'default' : 'outline'}
                onClick={() => setUrlOverdue(v => !v)}
                useAccentColor={urlOverdue}
              >
                Overdue ETA
              </Button>
              <Button
                type="button"
                size="sm"
                variant={urlBoeMissing ? 'default' : 'outline'}
                onClick={() => setUrlBoeMissing(v => !v)}
                useAccentColor={urlBoeMissing}
              >
                Missing BOE
              </Button>
              <Button
                type="button"
                size="sm"
                variant={urlExpenseMissing ? 'default' : 'outline'}
                onClick={() => setUrlExpenseMissing(v => !v)}
                useAccentColor={urlExpenseMissing}
              >
                Missing expenses
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSupplierFilterId('');
                  setDateFromFilter('');
                  setDateToFilter('');
                  setUrlOverdue(false);
                  setUrlBoeMissing(false);
                  setUrlExpenseMissing(false);
                }}
              >
                Clear route filters
              </Button>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">Supplier</p>
                <Select
                  value={supplierFilterId || 'all'}
                  onValueChange={v => setSupplierFilterId(v === 'all' ? '' : v)}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All suppliers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All suppliers</SelectItem>
                    {suppliers.map(s => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">Invoice from</p>
                <Input
                  type="date"
                  className="w-[160px]"
                  value={formatDateForInput(dateFromFilter)}
                  onChange={e => setDateFromFilter(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">Invoice to</p>
                <Input
                  type="date"
                  className="w-[160px]"
                  value={formatDateForInput(dateToFilter)}
                  onChange={e => setDateToFilter(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Controls */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
              <Input
                placeholder="Search shipments..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                className="w-64 pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Statuses</SelectItem>
                <SelectItem value="docs-rcvd">Document Received</SelectItem>
                <SelectItem value="docu-received">
                  Document Received (Legacy)
                </SelectItem>
                <SelectItem value="in-transit">In Transit</SelectItem>
                <SelectItem value="customs-clearance">
                  Customs Clearance
                </SelectItem>
                <SelectItem value="ready-dly">Ready for Delivery</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'cards' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('cards')}
              useAccentColor
            >
              Cards
            </Button>
            <Button
              variant={viewMode === 'table' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('table')}
              useAccentColor
            >
              Table
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="default" size="sm" useAccentColor>
                  <Settings className="mr-2 h-4 w-4" />
                  Actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={handleCheckStatusUpdates}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Check Status Updates
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleMigrateStatuses}>
                  <Database className="mr-2 h-4 w-4" />
                  Migrate Statuses
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    const uniqueStatuses = [
                      ...new Set(shipments.map(s => s.status).filter(Boolean)),
                    ];
                    notifications.info(
                      'Debug Statuses',
                      `Found ${uniqueStatuses.length} unique statuses: ${uniqueStatuses.join(', ')}`
                    );
                  }}
                >
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Debug Statuses
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Results Summary */}
        <div className="mb-4">
          <p className="text-sm text-gray-600">
            Showing {filteredShipments.length} of {totalCount} shipments
            {` · page ${page} of ${totalPages}`}
            {statusFilter !== 'All' && ` (${statusFilter})`}
            {supplierFilterId && ' · supplier filter'}
            {(dateFromFilter || dateToFilter) && ' · date range'}
            {urlOverdue && ' · overdue'}
            {urlBoeMissing && ' · no BOE'}
            {urlExpenseMissing && ' · no expenses'}
            {searchTerm && ` matching "${searchTerm}"`}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next
            </Button>
            <Select
              value={String(pageSize)}
              onValueChange={v => {
                setPageSize(Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[110px]">
                <SelectValue placeholder="Page size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'cards' ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredShipments.map(shipment => (
            <ShipmentCard
              key={shipment.id}
              shipment={shipment}
              flags={getShipmentExceptionFlags(shipment)}
            />
          ))}
        </div>
      ) : (
        <ResponsiveDataTable
          columns={columns}
          data={filteredShipments}
          showSearch={false}
          showPagination={false}
          virtualizeRows={true}
          isRowExpanded={row => expandedShipmentIds.has(row.original.id)}
          onRowExpandToggle={row => {
            void toggleShipmentItems(row.original.id);
          }}
          renderExpandedRow={row => {
            const shipmentId = row.original.id;
            const isItemsLoading =
              loadingShipmentItemsById[shipmentId] === true;
            const items = shipmentItemsById[shipmentId] ?? [];
            if (isItemsLoading) {
              return <p className="text-sm">Loading items...</p>;
            }
            if (items.length === 0) {
              return <p className="text-sm">No linked invoice items.</p>;
            }
            return (
              <div className="space-y-1 text-sm">
                {items.map(item => (
                  <div
                    key={item.id}
                    className="bg-background rounded border px-2 py-1"
                  >
                    {item.partNumber || item.itemId} - Qty {item.quantity} @{' '}
                    {item.unitPrice}
                  </div>
                ))}
              </div>
            );
          }}
          rowClassName={row => {
            const f = getShipmentExceptionFlags(row.original);
            if (!f.any) return undefined;
            if (f.overdue)
              return 'border-l-4 border-l-amber-500 bg-amber-500/5';
            return 'border-l-4 border-l-sky-500 bg-sky-500/5';
          }}
          searchPlaceholder="Search shipments..."
          hideColumnsOnSmall={[
            'supplierName',
            'category',
            'incoterm',
            'mode',
            'type',
            'currency',
            'notes',
          ]}
          columnWidths={{
            invoiceNumber: { minWidth: '120px', maxWidth: '150px' },
            invoiceDate: { minWidth: '100px', maxWidth: '120px' },
            eta: { minWidth: '100px', maxWidth: '120px' },
            etd: { minWidth: '100px', maxWidth: '120px' },
            supplierId: { minWidth: '150px', maxWidth: '200px' },
            goodsCategory: { minWidth: '120px', maxWidth: '150px' },
            invoiceCurrency: { minWidth: '80px', maxWidth: '100px' },
            invoiceValue: { minWidth: '120px', maxWidth: '150px' },
            incoterm: { minWidth: '100px', maxWidth: '120px' },
            vesselName: { minWidth: '120px', maxWidth: '150px' },
            blAwbNumber: { minWidth: '120px', maxWidth: '150px' },
            containerNumber: { minWidth: '120px', maxWidth: '150px' },
            status: { minWidth: '120px', maxWidth: '150px' },
          }}
        />
      )}

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
