// src/pages/supplier.tsx
import type { Column, ColumnDef } from '@tanstack/react-table';
import { safeInvoke as invoke } from '@/lib/ipc-safe';
import { openTextFile } from '@/lib/tauri-bridge';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  CircleDot,
  Download,
  Filter,
  Loader2,
  Search,
  Upload,
  Settings,
} from 'lucide-react';
import { useUnifiedNotifications } from '@/hooks/useUnifiedNotifications';
import ExcelJS from 'exceljs';

import * as React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { SupplierActions } from '@/components/supplier/actions';
import { SupplierEditPanel } from '@/components/supplier/edit';
import { AddSupplierForm } from '@/components/supplier/form';
import { ModuleSettings } from '@/components/module-settings';
import { SupplierViewPanel } from '@/components/supplier/view';
import { ResponsiveDataTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
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
import { formatText } from '@/lib/settings';
import { useSettings } from '@/lib/use-settings';
import type { Supplier } from '@/types/supplier';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/** URL path for supplier view or edit (bookmarkable, browser back/forward). */
export function supplierDetailPath(supplierId: string, mode: 'view' | 'edit') {
  return `/supplier/${encodeURIComponent(supplierId)}/${mode}`;
}

const PAGE_SIZE = 50;
const SUPPLIER_IMPORT_HEADER =
  'supplierName,shortName,country,email,phone,beneficiaryName,bankName,branch,bankAddress,accountNo,iban,swiftCode,isActive';

function parseIsActiveValue(value: string): boolean | null {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (normalized === '') return true;
  if (['true', 'yes', '1', 'active'].includes(normalized)) return true;
  if (['false', 'no', '0', 'inactive'].includes(normalized)) return false;
  return null;
}

/** Normalize a row for Excel export (handles snake_case if IPC ever differs). */
function supplierToExportRow(s: Supplier & Record<string, unknown>): string[] {
  const pick = (camel: keyof Supplier, snake: string) => {
    const v = s[camel] ?? s[snake];
    return v != null && v !== '' ? String(v) : '';
  };
  const activeRaw: unknown = s.isActive ?? s.is_active;
  const isActive =
    activeRaw === true ||
    activeRaw === 'true' ||
    activeRaw === 1 ||
    activeRaw === '1';
  return [
    pick('id', 'id'),
    pick('supplierName', 'supplier_name'),
    pick('shortName', 'short_name'),
    pick('country', 'country'),
    pick('email', 'email'),
    pick('phone', 'phone'),
    pick('beneficiaryName', 'beneficiary_name'),
    pick('bankName', 'bank_name'),
    pick('branch', 'branch'),
    pick('bankAddress', 'bank_address'),
    pick('accountNo', 'account_no'),
    pick('iban', 'iban'),
    pick('swiftCode', 'swift_code'),
    isActive ? 'Yes' : 'No',
  ];
}

const SupplierPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { supplierId: supplierIdParam } = useParams<{ supplierId: string }>();

  const { settings } = useSettings();
  const notifications = useUnifiedNotifications();
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [deletedSuppliers, setDeletedSuppliers] = React.useState<Supplier[]>(
    []
  );
  const [isLoadingSuppliers, setIsLoadingSuppliers] = React.useState(true);
  const [isLoadingDeletedSuppliers, setIsLoadingDeletedSuppliers] =
    React.useState(false);
  const [isSettingsOpen, setSettingsOpen] = React.useState(false);
  const [isDeletedSuppliersOpen, setDeletedSuppliersOpen] =
    React.useState(false);
  const [currentPage, setCurrentPage] = React.useState(0);
  const [isImportingSuppliers, setIsImportingSuppliers] = React.useState(false);
  const [totalSuppliersCount, setTotalSuppliersCount] = React.useState(0);
  const [searchText, setSearchText] = React.useState('');
  const [debouncedSearchText, setDebouncedSearchText] = React.useState('');
  const [isSearching, setIsSearching] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState<
    'all' | 'active' | 'inactive'
  >('all');

  const isSearchDebouncing =
    searchText.trim() !== debouncedSearchText.trim() &&
    searchText.trim().length > 0;
  const totalPages = Math.max(1, Math.ceil(totalSuppliersCount / PAGE_SIZE));
  const startRecord =
    totalSuppliersCount === 0
      ? 0
      : Math.min(currentPage * PAGE_SIZE + 1, totalSuppliersCount);
  const endRecord =
    totalSuppliersCount === 0
      ? 0
      : Math.min((currentPage + 1) * PAGE_SIZE, totalSuppliersCount);

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchText(searchText);
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [searchText]);

  React.useEffect(() => {
    setCurrentPage(0);
  }, [debouncedSearchText]);

  const supplierPanel = React.useMemo((): 'none' | 'view' | 'edit' => {
    if (!supplierIdParam) return 'none';
    if (location.pathname.endsWith('/edit')) return 'edit';
    if (location.pathname.endsWith('/view')) return 'view';
    return 'none';
  }, [supplierIdParam, location.pathname]);

  const decodedSupplierId = React.useMemo(() => {
    if (!supplierIdParam) return null;
    try {
      return decodeURIComponent(supplierIdParam);
    } catch {
      return supplierIdParam;
    }
  }, [supplierIdParam]);

  const selectedSupplier = React.useMemo(() => {
    if (!decodedSupplierId) return null;
    return suppliers.find(s => s.id === decodedSupplierId) ?? null;
  }, [suppliers, decodedSupplierId]);

  const filteredSuppliers = React.useMemo(() => {
    if (statusFilter === 'all') return suppliers;
    const showActive = statusFilter === 'active';
    return suppliers.filter(supplier => supplier.isActive === showActive);
  }, [suppliers, statusFilter]);

  const activeSuppliersOnPage = React.useMemo(
    () => suppliers.filter(supplier => supplier.isActive).length,
    [suppliers]
  );

  const closeSupplierPanel = React.useCallback(() => {
    navigate('/supplier');
  }, [navigate]);

  const handleView = React.useCallback(
    (supplier: Supplier) => {
      navigate(supplierDetailPath(supplier.id, 'view'));
    },
    [navigate]
  );

  const handleEdit = React.useCallback(
    (supplier: Supplier) => {
      navigate(supplierDetailPath(supplier.id, 'edit'));
    },
    [navigate]
  );

  const fetchSuppliers = React.useCallback(async () => {
    const fetchStarted = performance.now();
    setIsLoadingSuppliers(true);
    const searchingActive = debouncedSearchText.trim().length > 0;
    const paginatingActive = currentPage > 0;
    if (searchingActive) {
      setIsSearching(true);
    }
    try {
      const trimmedSearchText = debouncedSearchText.trim();
      const [fetchedSuppliers, fetchedCount] = await Promise.all([
        invoke<Supplier[]>('get_suppliers', {
          limit: PAGE_SIZE,
          offset: currentPage * PAGE_SIZE,
          searchText: trimmedSearchText || null,
        }),
        invoke<number>('get_suppliers_count', {
          searchText: trimmedSearchText || null,
        }),
      ]);
      setSuppliers(fetchedSuppliers);
      setTotalSuppliersCount(fetchedCount);
    } catch (error) {
      console.error('Failed to fetch suppliers:', error);
      notifications.supplier.error('fetch', String(error));
    } finally {
      setIsLoadingSuppliers(false);
      if (searchingActive) {
        setIsSearching(false);
      }
      const elapsedMs = (performance.now() - fetchStarted).toFixed(2);
      if (searchingActive) {
        console.log(`supplier_search execution time: ${elapsedMs} ms`);
      } else if (paginatingActive) {
        console.log(`supplier_pagination execution time: ${elapsedMs} ms`);
      } else {
        console.log(`get_suppliers execution time: ${elapsedMs} ms`);
      }
    }
    // Context `notifications` changes identity each render; listing it recreated this callback
    // every render and retriggered effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, debouncedSearchText]);

  React.useEffect(() => {
    console.time('supplier_render');
    return () => {
      console.timeEnd('supplier_render');
    };
  }, [suppliers, isLoadingSuppliers, currentPage, debouncedSearchText]);

  React.useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers, currentPage, debouncedSearchText]);

  const fetchDeletedSuppliers = React.useCallback(async () => {
    setIsLoadingDeletedSuppliers(true);
    try {
      const fetchedDeletedSuppliers: Supplier[] = await invoke(
        'get_deleted_suppliers'
      );
      setDeletedSuppliers(fetchedDeletedSuppliers);
    } catch (error) {
      console.error('Failed to fetch deleted suppliers:', error);
      notifications.supplier.error('fetch', String(error));
    } finally {
      setIsLoadingDeletedSuppliers(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenDeletedSuppliers = async () => {
    setDeletedSuppliersOpen(true);
    await fetchDeletedSuppliers();
  };

  const handleAdd = async (newSupplierData: Omit<Supplier, 'id'>) => {
    try {
      const newId: string = await invoke('generate_supplier_id');
      const newSupplier: Supplier = { id: newId, ...newSupplierData };
      await invoke('add_supplier', { supplier: newSupplier });
      notifications.supplier.created(newSupplier.supplierName);
      fetchSuppliers();
    } catch (error) {
      console.error('Failed to add supplier:', error);
      notifications.supplier.error('add', String(error));
    }
  };

  const handleSave = async (updatedSupplier: Supplier) => {
    try {
      await invoke('update_supplier', { supplier: updatedSupplier });
      notifications.supplier.updated(updatedSupplier.supplierName);
      fetchSuppliers();
    } catch (error) {
      console.error('Failed to update supplier:', error);
      notifications.supplier.error('update', String(error));
    }
  };

  const handleDelete = React.useCallback(
    async (supplier: Supplier) => {
      try {
        await invoke('delete_supplier', { supplierId: supplier.id });
        notifications.success(
          'Supplier Deleted',
          `"${supplier.supplierName}" has been removed from the list.`
        );
        fetchSuppliers();
      } catch (error) {
        const message = String(error);
        if (message.includes('Supplier used in shipments — cannot delete')) {
          notifications.warning(
            'Cannot Delete Supplier',
            'Supplier used in shipments — cannot delete'
          );
          return;
        }
        console.error('Failed to delete supplier:', error);
        notifications.supplier.error('delete', message);
      }
    },
    [fetchSuppliers, notifications]
  );

  const handleRestoreSupplier = async (supplier: Supplier) => {
    const confirmed = window.confirm('Restore this supplier?');
    if (!confirmed) return;

    try {
      await invoke('restore_supplier', { supplierId: supplier.id });
      notifications.success(
        'Supplier Restored',
        `"${supplier.supplierName}" has been restored successfully.`
      );
      await Promise.all([fetchSuppliers(), fetchDeletedSuppliers()]);
    } catch (error) {
      console.error('Failed to restore supplier:', error);
      notifications.supplier.error('update', String(error));
    }
  };

  const handleExportExcel = async () => {
    try {
      const allSuppliers: Supplier[] = await invoke('get_suppliers');
      if (allSuppliers.length === 0) {
        notifications.info(
          'No Records Found',
          'No suppliers available to export.'
        );
        return;
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Suppliers');

      const headers = [
        'ID',
        'Supplier Name',
        'Short Name',
        'Country',
        'Email',
        'Phone',
        'Beneficiary Name',
        'Bank Name',
        'Branch',
        'Bank Address',
        'Account No',
        'IBAN',
        'SWIFT Code',
        'Active',
      ];
      worksheet.addRow(headers);

      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };

      const colMax = headers.map(h => String(h).length);
      allSuppliers.forEach(s => {
        const row = supplierToExportRow(s);
        row.forEach((cell, i) => {
          const len = cell ? String(cell).length : 0;
          if (len > colMax[i]) colMax[i] = len;
        });
        worksheet.addRow(row);
      });

      // Only size columns we use. `worksheet.columns.forEach` can touch the whole
      // grid in ExcelJS and makes the sheet look "empty" after scrolling right.
      for (let c = 1; c <= headers.length; c++) {
        const width = Math.min(Math.max(12, colMax[c - 1] + 2), 40);
        worksheet.getColumn(c).width = width;
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `suppliers_${Date.now()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      notifications.success(
        'Exported',
        `Suppliers Excel downloaded successfully (${allSuppliers.length} records).`
      );
    } catch (err) {
      console.error('Failed to export suppliers:', err);
      notifications.error(
        'Export Failed',
        'Could not export suppliers. Try again.'
      );
    }
  };

  const handleDownloadTemplate = () => {
    const sampleRow =
      'Demo Supplier,DS,India,demo@supplier.com,+91-9000000000,Demo Beneficiary,Demo Bank,Main Branch,Demo Address,1234567890,IN00DEMO123456,DEMOIN00,true';
    const templateContent = `${SUPPLIER_IMPORT_HEADER}\n${sampleRow}`;
    const blob = new Blob([templateContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'supplier_template.csv';
    a.click();
    URL.revokeObjectURL(url);
    notifications.success(
      'Template Downloaded',
      'Supplier template downloaded. For isActive use true/false, yes/no, 1/0, or active/inactive.'
    );
  };

  const handleImport = async () => {
    setIsImportingSuppliers(true);
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
      const rawLines = content.split(/\r?\n/);
      const headerIdx = rawLines.findIndex(
        l => l.replace(/^\uFEFF/, '').trim() !== ''
      );
      if (headerIdx < 0) {
        notifications.warning(
          'No New Data',
          'No new suppliers found in the file.'
        );
        return;
      }
      const headerLine = rawLines[headerIdx].replace(/^\uFEFF/, '').trim();
      if (headerLine !== SUPPLIER_IMPORT_HEADER) {
        notifications.supplier.error(
          'import',
          'This file does not match the supplier import template (wrong column headers). Download the template and try again.'
        );
        return;
      }
      const lines = rawLines.slice(headerIdx + 1);
      const newSuppliers: Supplier[] = [];
      const firstId: string = await invoke('generate_supplier_id');
      let nextIdValue = Number.parseInt(firstId.split('-')[1] ?? '0', 10);
      if (Number.isNaN(nextIdValue) || nextIdValue < 1) {
        notifications.supplier.error(
          'import',
          'Could not generate supplier IDs for import.'
        );
        return;
      }

      for (const line of lines) {
        if (line.trim() === '') continue;
        const parts = line.split(',');
        if (parts.length < 13) {
          notifications.supplier.error(
            'import',
            'One or more data rows have too few columns. Download the supplier template and try again.'
          );
          return;
        }
        const [
          supplierName,
          shortName,
          country,
          email,
          phone,
          beneficiaryName,
          bankName,
          branch,
          bankAddress,
          accountNo,
          iban,
          swiftCode,
          isActiveStr,
        ] = parts;

        if (!String(supplierName ?? '').trim()) {
          notifications.supplier.error(
            'import',
            'Each supplier row must include a supplier name.'
          );
          return;
        }

        const newId = `Sup-${nextIdValue.toString().padStart(3, '0')}`;
        nextIdValue += 1;

        const parsedIsActive = parseIsActiveValue(isActiveStr);
        if (parsedIsActive === null) {
          notifications.supplier.error(
            'import',
            `Invalid isActive value "${isActiveStr}" for supplier "${supplierName}". Use true/false, yes/no, 1/0, or active/inactive.`
          );
          return;
        }

        newSuppliers.push({
          id: newId,
          supplierName,
          shortName,
          country,
          email,
          phone,
          beneficiaryName,
          bankName,
          branch,
          bankAddress,
          accountNo,
          iban,
          swiftCode,
          isActive: parsedIsActive,
        });
      }

      if (newSuppliers.length > 0) {
        const insertedCount: number = await invoke('add_suppliers_bulk', {
          suppliers: newSuppliers,
        });
        notifications.supplier.imported(insertedCount);
        fetchSuppliers();
      } else {
        notifications.warning(
          'No New Data',
          'No new suppliers found in the file.'
        );
      }
    } catch (error) {
      console.error('Failed to import suppliers:', error);
      notifications.supplier.error('import', 'Please check the file format.');
    } finally {
      setIsImportingSuppliers(false);
    }
  };

  const SortIndicator = ({ column }: { column: Column<Supplier, unknown> }) => {
    const sorted = column.getIsSorted();
    if (sorted === 'asc') return <ArrowUp className="ml-2 h-4 w-4" />;
    if (sorted === 'desc') return <ArrowDown className="ml-2 h-4 w-4" />;
    return <ArrowUpDown className="ml-2 h-4 w-4" />;
  };

  const columns = React.useMemo(() => {
    const allColumns: ColumnDef<Supplier>[] = [
      {
        accessorKey: 'id',
        header: ({ column }) => (
          <Button
            variant="default"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            useAccentColor
            className="text-sm! font-semibold! h-auto bg-transparent p-0 text-accent-foreground hover:bg-transparent hover:text-accent-foreground"
          >
            Supplier ID
            <SortIndicator column={column} />
          </Button>
        ),
        meta: { visible: settings.modules.supplier.fields.id?.visible ?? true },
      },
      {
        accessorKey: 'supplierName',
        header: ({ column }) => (
          <Button
            variant="default"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            useAccentColor
            className="text-sm! font-semibold! h-auto bg-transparent p-0 text-accent-foreground hover:bg-transparent hover:text-accent-foreground"
          >
            Supplier Name
            <SortIndicator column={column} />
          </Button>
        ),
        cell: ({ row }) =>
          formatText(row.getValue('supplierName'), settings.textFormat),
        meta: {
          visible:
            settings.modules.supplier.fields.supplierName?.visible ?? true,
        },
      },
      {
        accessorKey: 'shortName',
        header: 'Short Name',
        cell: ({ row }) =>
          formatText(row.getValue('shortName'), settings.textFormat),
        meta: {
          visible: settings.modules.supplier.fields.shortName?.visible ?? true,
        },
      },
      {
        accessorKey: 'country',
        header: ({ column }) => (
          <Button
            variant="default"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            useAccentColor
            className="text-sm! font-semibold! h-auto bg-transparent p-0 text-accent-foreground hover:bg-transparent hover:text-accent-foreground"
          >
            Country
            <SortIndicator column={column} />
          </Button>
        ),
        cell: ({ row }) =>
          formatText(row.getValue('country'), settings.textFormat),
        meta: {
          visible: settings.modules.supplier.fields.country?.visible ?? true,
        },
      },
      {
        accessorKey: 'phone',
        header: 'Phone',
        cell: ({ row }) =>
          formatText(row.getValue('phone'), settings.textFormat),
        meta: {
          visible: settings.modules.supplier.fields.phone?.visible ?? true,
        },
      },
      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }) =>
          formatText(row.getValue('email'), settings.textFormat),
        meta: {
          visible: settings.modules.supplier.fields.email?.visible ?? true,
        },
      },
      {
        accessorKey: 'beneficiaryName',
        header: 'Beneficiary Name',
        cell: ({ row }) =>
          formatText(row.getValue('beneficiaryName'), settings.textFormat),
        meta: {
          visible:
            settings.modules.supplier.fields.beneficiaryName?.visible ?? true,
        },
      },
      {
        accessorKey: 'bankName',
        header: 'Bank Name',
        cell: ({ row }) =>
          formatText(row.getValue('bankName'), settings.textFormat),
        meta: {
          visible: settings.modules.supplier.fields.bankName?.visible ?? true,
        },
      },
      {
        accessorKey: 'branch',
        header: 'Branch',
        cell: ({ row }) =>
          formatText(row.getValue('branch'), settings.textFormat),
        meta: {
          visible: settings.modules.supplier.fields.branch?.visible ?? true,
        },
      },
      {
        accessorKey: 'bankAddress',
        header: 'Bank Address',
        cell: ({ row }) =>
          formatText(row.getValue('bankAddress'), settings.textFormat),
        meta: {
          visible:
            settings.modules.supplier.fields.bankAddress?.visible ?? true,
        },
      },
      {
        accessorKey: 'accountNo',
        header: 'Account No.',
        cell: ({ row }) =>
          formatText(row.getValue('accountNo'), settings.textFormat),
        meta: {
          visible: settings.modules.supplier.fields.accountNo?.visible ?? true,
        },
      },
      {
        accessorKey: 'iban',
        header: 'IBAN',
        cell: ({ row }) =>
          formatText(row.getValue('iban'), settings.textFormat),
        meta: {
          visible: settings.modules.supplier.fields.iban?.visible ?? true,
        },
      },
      {
        accessorKey: 'swiftCode',
        header: 'SWIFT Code',
        cell: ({ row }) =>
          formatText(row.getValue('swiftCode'), settings.textFormat),
        meta: {
          visible: settings.modules.supplier.fields.swiftCode?.visible ?? true,
        },
      },
      {
        accessorKey: 'isActive',
        header: 'Status',
        cell: ({ row }) => {
          const isActive = row.getValue('isActive');
          return (
            <Badge variant={isActive ? 'success' : 'destructive'}>
              {isActive ? 'Active' : 'Inactive'}
            </Badge>
          );
        },
        meta: {
          visible: settings.modules.supplier.fields.isActive?.visible ?? true,
        },
      },
      {
        id: 'actions',
        cell: ({ row }) => (
          <SupplierActions
            supplier={row.original}
            onView={() => handleView(row.original)}
            onEdit={() => handleEdit(row.original)}
            onDelete={() => handleDelete(row.original)}
          />
        ),
        meta: {
          visible: settings.modules.supplier.fields.actions?.visible ?? true,
        },
      },
    ];

    // Sort columns based on settings order
    return allColumns.sort((a, b) => {
      // Keep actions column last (right side)
      if (a.id === 'actions') return 1;
      if (b.id === 'actions') return -1;

      // Get order from settings
      const aOrder =
        settings.modules.supplier.fields[a.id as string]?.order ?? 999;
      const bOrder =
        settings.modules.supplier.fields[b.id as string]?.order ?? 999;

      return aOrder - bOrder;
    });
  }, [
    settings.modules.supplier,
    settings.textFormat,
    handleView,
    handleEdit,
    handleDelete,
  ]);

  const settingsDialog = (
    <Dialog open={isSettingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-6xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0 border-b pb-4">
          <DialogTitle className="text-card-foreground text-xl font-semibold">
            Supplier Module Settings
          </DialogTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            Customize your supplier table view and preferences
          </p>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto pr-2">
          <ModuleSettings
            moduleName="supplier"
            moduleTitle="Supplier"
            onClose={() => setSettingsOpen(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );

  if (supplierPanel !== 'none') {
    return (
      <div className="from-background to-muted/20 bg-linear-to-br flex min-h-screen flex-col">
        <div className="container mx-auto flex min-h-0 flex-1 flex-col px-4 py-6">
          <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              useAccentColor
              onClick={closeSupplierPanel}
              className="gap-2"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Back to suppliers
            </Button>
            <span className="text-muted-foreground text-sm">
              {supplierPanel === 'view'
                ? 'Viewing supplier record'
                : 'Editing supplier record'}
            </span>
          </div>

          {isLoadingSuppliers ? (
            <div
              className="border-border bg-card text-muted-foreground flex min-h-[240px] w-full max-w-6xl flex-1 items-center justify-center self-center rounded-xl border text-sm shadow-sm"
              role="status"
              aria-live="polite"
            >
              Loading supplier…
            </div>
          ) : !selectedSupplier ? (
            <div className="border-border bg-card mx-auto flex w-full max-w-lg flex-col gap-4 rounded-xl border p-8 shadow-sm">
              <h2 className="text-card-foreground text-lg font-semibold">
                Supplier not found
              </h2>
              <p className="text-muted-foreground text-sm">
                There is no supplier with ID{' '}
                <span className="text-foreground font-mono">
                  {decodedSupplierId ?? supplierIdParam}
                </span>
                . It may have been removed or the link may be incorrect.
              </p>
              <Button
                type="button"
                variant="default"
                useAccentColor
                onClick={closeSupplierPanel}
                className="w-fit"
              >
                Back to suppliers
              </Button>
            </div>
          ) : (
            <div
              className="border-border bg-card flex min-h-0 w-full max-w-6xl flex-1 flex-col self-center overflow-hidden rounded-xl border shadow-sm"
              role="main"
              aria-label={
                supplierPanel === 'view'
                  ? 'Supplier details'
                  : 'Edit supplier form'
              }
            >
              {supplierPanel === 'view' ? (
                <SupplierViewPanel
                  supplier={selectedSupplier}
                  onClose={closeSupplierPanel}
                  onEdit={() =>
                    navigate(supplierDetailPath(selectedSupplier.id, 'edit'))
                  }
                  className="min-h-0 flex-1"
                />
              ) : (
                <SupplierEditPanel
                  supplier={selectedSupplier}
                  onCancel={closeSupplierPanel}
                  onSave={async updated => {
                    await handleSave(updated);
                    closeSupplierPanel();
                  }}
                  className="min-h-0 flex-1"
                />
              )}
            </div>
          )}
        </div>
        {settingsDialog}
      </div>
    );
  }

  return (
    <div className="from-background to-muted/20 bg-linear-to-br min-h-screen">
      <div className="container mx-auto px-4 py-8">
        <div className="bg-card mb-6 rounded-xl border p-5 shadow-sm">
          <div className="flex flex-col gap-4 border-b pb-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="bg-primary/10 mt-0.5 rounded-lg p-2.5">
                <Settings className="text-primary h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-card-foreground text-xl font-semibold tracking-tight">
                  Suppliers
                </h1>
                <p className="text-muted-foreground mt-1 text-sm">
                  Manage supplier identity, contact, and banking records.
                </p>
                <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-3 text-xs">
                  <span className="bg-muted inline-flex items-center gap-1.5 rounded-md px-2 py-1">
                    <CircleDot className="text-success size-3" />
                    {activeSuppliersOnPage} active on this page
                  </span>
                  <span className="bg-muted inline-flex items-center gap-1.5 rounded-md px-2 py-1">
                    <CircleDot className="text-primary size-3" />
                    Showing {startRecord}-{endRecord} of {totalSuppliersCount}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <AddSupplierForm
                onAdd={handleAdd}
                disabled={isImportingSuppliers}
              />
              <Button
                variant="outline"
                onClick={handleImport}
                className="h-9 px-3"
                useAccentColor
                disabled={isImportingSuppliers}
              >
                <Upload className="mr-2 h-4 w-4" />
                {isImportingSuppliers ? 'Importing...' : 'Import'}
              </Button>
              <Button
                variant="outline"
                onClick={handleExportExcel}
                className="h-9 px-3"
                useAccentColor
                disabled={isImportingSuppliers}
              >
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
              <Button
                variant="outline"
                onClick={handleOpenDeletedSuppliers}
                className="h-9 px-3"
                useAccentColor
                disabled={isImportingSuppliers}
              >
                Deleted suppliers
              </Button>
              <Button
                variant="outline"
                onClick={handleDownloadTemplate}
                className="h-9 px-3"
                useAccentColor
                disabled={isImportingSuppliers}
              >
                Template
              </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setSettingsOpen(true)}
                      className="h-9 w-9"
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
          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(280px,420px)_1fr] lg:items-center">
            <div className="space-y-1.5">
              <div className="relative">
                <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                <Input
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  placeholder="Search by supplier name, email, or country..."
                  disabled={isLoadingSuppliers}
                  className="h-9 pl-9 pr-10"
                />
                {isSearching || isSearchDebouncing ? (
                  <Loader2 className="text-muted-foreground absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin" />
                ) : null}
              </div>
              <p className="text-muted-foreground text-xs">
                {isSearching || isSearchDebouncing
                  ? 'Refreshing results...'
                  : `Page ${Math.min(currentPage + 1, totalPages)} of ${totalPages}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
              <span className="text-muted-foreground inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide">
                <Filter className="size-3.5" />
                Status
              </span>
              <Button
                type="button"
                variant={statusFilter === 'all' ? 'default' : 'outline'}
                useAccentColor
                className="h-8 px-3 text-xs"
                onClick={() => setStatusFilter('all')}
              >
                All
              </Button>
              <Button
                type="button"
                variant={statusFilter === 'active' ? 'default' : 'outline'}
                useAccentColor
                className="h-8 px-3 text-xs"
                onClick={() => setStatusFilter('active')}
              >
                Active
              </Button>
              <Button
                type="button"
                variant={statusFilter === 'inactive' ? 'default' : 'outline'}
                useAccentColor
                className="h-8 px-3 text-xs"
                onClick={() => setStatusFilter('inactive')}
              >
                Inactive
              </Button>
            </div>
          </div>
        </div>

        <div className="bg-card min-h-[280px] min-w-0 overflow-hidden rounded-xl border shadow-sm">
          <ResponsiveDataTable
            columns={columns}
            data={filteredSuppliers}
            showSearch={false}
            hideColumnsOnSmall={[
              'phone',
              'bankName',
              'branch',
              'bankAddress',
              'accountNo',
              'iban',
              'swiftCode',
            ]}
            columnWidths={{
              supplierName: { minWidth: '180px', maxWidth: '250px' },
              email: { minWidth: '180px', maxWidth: '220px' },
              bankAddress: { minWidth: '160px', maxWidth: '200px' },
              country: { minWidth: '120px', maxWidth: '150px' },
              phone: { minWidth: '130px', maxWidth: '160px' },
            }}
            className="border-0"
            moduleName="supplier"
          />
          {!isLoadingSuppliers && filteredSuppliers.length === 0 ? (
            <div className="text-muted-foreground border-t p-4 text-sm">
              {debouncedSearchText.trim().length > 0 || statusFilter !== 'all'
                ? 'No suppliers match the current filters. Try widening search or status filter.'
                : 'No suppliers found. Add your first supplier to get started.'}
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <span className="text-muted-foreground text-sm">
            Showing {startRecord}-{endRecord} of {totalSuppliersCount} total
            suppliers
          </span>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground mr-1 text-xs">
              Page {Math.min(currentPage + 1, totalPages)} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              useAccentColor
              className="h-8"
              disabled={currentPage === 0}
              onClick={() => setCurrentPage(p => p - 1)}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              useAccentColor
              className="h-8"
              disabled={currentPage >= totalPages - 1}
              onClick={() => setCurrentPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>

        <Dialog
          open={isDeletedSuppliersOpen}
          onOpenChange={setDeletedSuppliersOpen}
        >
          <DialogContent className="max-h-[85vh] w-[95vw] max-w-5xl overflow-hidden">
            <DialogHeader>
              <DialogTitle>Deleted Suppliers</DialogTitle>
            </DialogHeader>
            <div className="mt-2 overflow-auto">
              {isLoadingDeletedSuppliers ? (
                <div className="text-muted-foreground py-8 text-center text-sm">
                  Loading deleted suppliers...
                </div>
              ) : deletedSuppliers.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center text-sm">
                  No deleted suppliers found to restore.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Supplier name</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead className="w-[120px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deletedSuppliers.map(supplier => (
                      <TableRow key={supplier.id}>
                        <TableCell>{supplier.id}</TableCell>
                        <TableCell className="font-medium">
                          {supplier.supplierName}
                        </TableCell>
                        <TableCell>{supplier.country}</TableCell>
                        <TableCell>{supplier.email}</TableCell>
                        <TableCell>{supplier.phone || '-'}</TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="outline"
                            useAccentColor
                            className="h-8"
                            onClick={() => handleRestoreSupplier(supplier)}
                          >
                            Restore
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {settingsDialog}
      </div>
    </div>
  );
};

export default SupplierPage;
