// src/pages/shipment/index.tsx
// react-table imports not used here; table lives in a shared component
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import {
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

import * as React from 'react';

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
import { formatText } from '@/lib/settings';
import { useSettings } from '@/lib/use-settings';
import { useResponsiveContext } from '@/providers/ResponsiveProvider';
import type { Option } from '@/types/options';
import type { Shipment } from '@/types/shipment';
import type { Supplier } from '@/types/supplier';

type OptionType =
  | 'supplier'
  | 'category'
  | 'incoterm'
  | 'mode'
  | 'status'
  | 'type'
  | 'currency';

const ShipmentPage = () => {
  const { settings } = useSettings();
  const { getButtonClass } = useResponsiveContext();
  const notifications = useUnifiedNotifications();
  const [shipments, setShipments] = React.useState<Shipment[]>([]);
  const [suppliers, setSuppliers] = React.useState<Option[]>([]);
  const [isFormOpen, setFormOpen] = React.useState(false);
  const [isMultilineFormOpen, setMultilineFormOpen] = React.useState(false);
  const [isViewOpen, setViewOpen] = React.useState(false);
  const [isSettingsOpen, setSettingsOpen] = React.useState(false);
  const [selectedShipment, setSelectedShipment] =
    React.useState<Shipment | null>(null);
  const [shipmentToEdit, setShipmentToEdit] = React.useState<Shipment | null>(
    null
  );

  const [categories, setCategories] = React.useState<Option[]>([]);
  const [incoterms, setIncoterms] = React.useState<Option[]>([]);
  const [modes, setModes] = React.useState<Option[]>([]);
  const [types, setTypes] = React.useState<Option[]>([]);
  const [statuses, setStatuses] = React.useState<Option[]>([]);
  const [currencies, setCurrencies] = React.useState<Option[]>([]);
  const [statusFilter, setStatusFilter] = React.useState('All');
  const [viewMode, setViewMode] = React.useState<'table' | 'cards'>('cards');
  const [searchTerm, setSearchTerm] = React.useState('');

  const fetchShipments = React.useCallback(async () => {
    try {
      const fetchedShipments: Shipment[] = await invoke('get_shipments');
      setShipments(fetchedShipments);
    } catch (error) {
      console.error('Failed to fetch shipments:', error);
      notifications.shipment.error('load', String(error));
    }
  }, []);

  const handleOpenFormForEdit = React.useCallback((shipment: Shipment) => {
    setShipmentToEdit(shipment);
    setFormOpen(true);
  }, []);

  const handleOpenFormForAdd = React.useCallback(() => {
    setShipmentToEdit(null);
    setFormOpen(true);
  }, []);

  const handleView = React.useCallback((shipment: Shipment) => {
    setSelectedShipment(shipment);
    setViewOpen(true);
  }, []);

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
    [fetchShipments]
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
  }, [fetchShipments]);

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
  }, [fetchShipments]);

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

  // Filter shipments based on status and search
  const filteredShipments = React.useMemo(() => {
    let filtered = shipments;

    // Status filter
    if (statusFilter !== 'All') {
      filtered = filtered.filter(shipment => {
        const shipmentStatus = shipment.status || '';
        return shipmentStatus.toLowerCase() === statusFilter.toLowerCase();
      });
    }

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
  }, [shipments, statusFilter, searchTerm]);

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

  const fetchOptions = async () => {
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
  };

  React.useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const fetchedSuppliers: Supplier[] = await invoke('get_suppliers');
        const supplierOptions = fetchedSuppliers.map(s => ({
          value: s.id,
          label: formatText(s.supplierName, settings.textFormat),
        }));
        setSuppliers(supplierOptions);
        await fetchShipments();
        await fetchOptions();
      } catch (error) {
        console.error('Failed to load initial data:', error);
        notifications.shipment.error('load initial data', String(error));
      }
    };
    fetchInitialData();
  }, [settings.textFormat, fetchShipments]);

  async function handleSubmit(shipmentData: Omit<Shipment, 'id'>) {
    const isDuplicate = shipments.some(
      s =>
        s.invoiceNumber.toLowerCase() ===
          shipmentData.invoiceNumber.toLowerCase() &&
        s.id !== shipmentToEdit?.id
    );

    if (isDuplicate) {
      notifications.error(
        'Duplicate Invoice',
        `A shipment with the invoice number "${shipmentData.invoiceNumber}" already exists.`
      );
      return;
    }

    try {
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
      setFormOpen(false);
    } catch (error) {
      console.error('Failed to save shipment:', error);
      notifications.shipment.error('save', String(error));
    }
  }

  const handleDownloadTemplate = () => {
    const headers = [
      'supplierId',
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
    const csv = headers.join(',');
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
      const selectedPath = await open({
        multiple: false,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      if (!selectedPath) {
        notifications.info('Import Cancelled', 'Import cancelled.');
        return;
      }

      const content = await readTextFile(selectedPath as string);
      const results = Papa.parse<Record<string, string>>(content, {
        header: true,
        skipEmptyLines: true,
      });

      const seenInvoiceNumbers = new Set(
        shipments.map(s => s.invoiceNumber.toLowerCase())
      );
      let maxId = shipments.reduce(
        (max, s) => Math.max(max, parseInt(s.id.split('-')[1] || '0')),
        0
      );

      const newShipments: Shipment[] = [];
      for (const row of results.data) {
        if (
          !row.invoiceNumber ||
          seenInvoiceNumbers.has(row.invoiceNumber.toLowerCase())
        ) {
          continue; // Skip duplicates or rows without an invoice number
        }
        maxId++;

        // Use supplier ID as is - validation will catch invalid values
        const supplierId = row.supplierId || '';

        newShipments.push({
          id: `SHP-${maxId.toString().padStart(3, '0')}`,
          supplierId: supplierId,
          invoiceNumber: row.invoiceNumber,
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
        seenInvoiceNumbers.add(row.invoiceNumber.toLowerCase());
      }

      if (newShipments.length > 0) {
        try {
          // First validate the shipments
          const validationErrors = (await invoke('validate_shipment_import', {
            shipments: newShipments,
          })) as string[];

          if (validationErrors && validationErrors.length > 0) {
            // Show validation errors in a detailed notification
            const errorMessage = validationErrors.join('\n');
            notifications.error('Import Validation Failed', errorMessage, {
              duration: 10000,
            });
            return;
          }

          // If validation passes, proceed with import
          await invoke('add_shipments_bulk', { shipments: newShipments });
          notifications.shipment.imported(newShipments.length);
          fetchShipments();
        } catch (error) {
          console.error('Failed to import shipments:', error);
          notifications.shipment.error('import', String(error));
        }
      } else {
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
      const filePath = await save({
        defaultPath: 'shipments.csv',
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      if (filePath) {
        await writeTextFile(filePath, csv);
        notifications.shipment.exported(shipments.length);
      }
    } catch (error) {
      console.error('Failed to export shipments:', error);
      notifications.shipment.error('export', String(error));
    }
  };
  void exportShipmentsData;

  // Keep functions but do not create unused vars to satisfy linter
  // export handlers are wired in UI below via inline lambdas

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
  const ShipmentCard = ({ shipment }: { shipment: Shipment }) => {
    const supplier = suppliers.find(s => s.value === shipment.supplierId);

    return (
      <Card className="cursor-pointer transition-shadow duration-200 hover:shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="mb-1 text-lg font-semibold text-purple-700">
                {shipment.invoiceNumber}
              </CardTitle>
              <CardDescription className="mb-2 text-sm text-indigo-600">
                {supplier?.label || 'Unknown Supplier'}
              </CardDescription>
              <div className="flex items-center gap-2">
                <Badge
                  variant={getStatusBadgeVariant(shipment.status || '')}
                  className="text-xs"
                >
                  {getStatusDisplayName(shipment.status || '')}
                </Badge>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-purple-500">
                    #{shipment.id}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={e => {
                      e.stopPropagation();
                      handleCopyShipmentId(shipment.id);
                    }}
                    className="h-6 w-6 p-0 hover:bg-purple-100"
                    title="Copy Shipment ID"
                  >
                    <Copy className="h-3 w-3 text-purple-400 hover:text-purple-600" />
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleView(shipment)}
                className="h-8 w-8 p-0"
              >
                <Search className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleOpenFormForEdit(shipment)}
                className="h-8 w-8 p-0"
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
                <DollarSign className="h-4 w-4 text-emerald-500" />
                <span className="font-medium text-emerald-700">
                  {formatCurrency(
                    shipment.invoiceValue || 0,
                    shipment.invoiceCurrency || 'USD'
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Package className="h-4 w-4 text-blue-500" />
                <span className="font-medium text-blue-700">
                  {shipment.goodsCategory}
                </span>
              </div>
              {shipment.grossWeightKg && (
                <div className="flex items-center gap-2 text-sm">
                  <Ship className="h-4 w-4 text-cyan-500" />
                  <span className="font-medium text-cyan-700">
                    {shipment.grossWeightKg} kg
                  </span>
                </div>
              )}
            </div>

            {/* Dates */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-orange-500" />
                <span className="font-medium text-orange-700">
                  Invoice: {shipment.invoiceDate}
                </span>
              </div>
              {shipment.eta && (
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-rose-500" />
                  <span className="font-medium text-rose-700">
                    ETA: {shipment.eta}
                  </span>
                </div>
              )}
            </div>

            {/* Shipping Details */}
            {(shipment.blAwbNumber ||
              shipment.vesselName ||
              shipment.containerNumber) && (
              <div className="border-t border-purple-200 pt-2">
                <div className="mb-2 flex items-center gap-2 text-sm">
                  <Ship className="h-4 w-4 text-purple-500" />
                  <span className="font-medium text-purple-700">
                    Shipping Details
                  </span>
                </div>
                {shipment.blAwbNumber && (
                  <div className="mb-1 text-xs text-purple-600">
                    <span className="font-medium">B/L:</span>{' '}
                    {shipment.blAwbNumber}
                  </div>
                )}
                {shipment.vesselName && (
                  <div className="mb-1 text-xs text-purple-600">
                    <span className="font-medium">Vessel:</span>{' '}
                    {shipment.vesselName}
                  </div>
                )}
                {shipment.containerNumber && (
                  <div className="text-xs text-purple-600">
                    <span className="font-medium">Container:</span>{' '}
                    {shipment.containerNumber}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

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
              variant="outline"
              onClick={handleDownloadTemplate}
              className={getButtonClass()}
            >
              <Download className="mr-2 h-4 w-4" />
              Template
            </Button>
            <Button onClick={handleImport} className={getButtonClass()}>
              <Upload className="mr-2 h-4 w-4" />
              Import
            </Button>
            <Button
              onClick={() => setMultilineFormOpen(true)}
              className={getButtonClass()}
              variant="secondary"
            >
              <Copy className="mr-2 h-4 w-4" />
              Multi-line Paste
            </Button>
            <Button onClick={handleOpenFormForAdd} className={getButtonClass()}>
              <Plus className="mr-2 h-4 w-4" />
              Add New
            </Button>
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
          </div>
        </div>

        {/* Metrics Dashboard */}
        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-cyan-200 bg-gradient-to-r from-cyan-50 to-cyan-100">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-cyan-600">
                    Document Received
                  </p>
                  <p className="text-lg font-bold text-cyan-900">
                    {metrics.docsReceived}
                  </p>
                </div>
                <Clock className="h-5 w-5 text-cyan-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-orange-200 bg-gradient-to-r from-orange-50 to-orange-100">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-orange-600">
                    In Transit
                  </p>
                  <p className="text-lg font-bold text-orange-900">
                    {metrics.inTransit}
                  </p>
                </div>
                <Truck className="h-5 w-5 text-orange-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-indigo-200 bg-gradient-to-r from-indigo-50 to-indigo-100">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-indigo-600">
                    Customs Clearance
                  </p>
                  <p className="text-lg font-bold text-indigo-900">
                    {metrics.customsClearance}
                  </p>
                </div>
                <Globe className="h-5 w-5 text-indigo-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-yellow-200 bg-gradient-to-r from-yellow-50 to-yellow-100">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-yellow-600">
                    Ready for Delivery
                  </p>
                  <p className="text-lg font-bold text-yellow-900">
                    {metrics.readyForDelivery}
                  </p>
                </div>
                <Package className="h-5 w-5 text-yellow-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Controls */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
              <Input
                placeholder="Search shipments..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
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
            >
              Cards
            </Button>
            <Button
              variant={viewMode === 'table' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('table')}
            >
              Table
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                >
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
                    console.log('All shipments:', shipments);
                    console.log('Unique statuses:', uniqueStatuses);
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
            Showing {filteredShipments.length} of {shipments.length} shipments
            {statusFilter !== 'All' && ` (${statusFilter})`}
            {searchTerm && ` matching "${searchTerm}"`}
          </p>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'cards' ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredShipments.map(shipment => (
            <ShipmentCard key={shipment.id} shipment={shipment} />
          ))}
        </div>
      ) : (
        <ResponsiveDataTable
          columns={columns}
          data={filteredShipments}
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
      <ProfessionalShipmentViewDialog
        isOpen={isViewOpen}
        onOpenChange={setViewOpen}
        shipment={selectedShipment}
        suppliers={suppliers}
      />

      {/* Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-5xl flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
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
    </div>
  );
};

export default ShipmentPage;
