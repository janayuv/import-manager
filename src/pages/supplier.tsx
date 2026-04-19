// src/pages/supplier.tsx
import type { Column, ColumnDef } from '@tanstack/react-table';
import { invoke } from '@tauri-apps/api/core';
import { openTextFile } from '@/lib/tauri-bridge';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  Download,
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

/** URL path for supplier view or edit (bookmarkable, browser back/forward). */
export function supplierDetailPath(supplierId: string, mode: 'view' | 'edit') {
  return `/supplier/${encodeURIComponent(supplierId)}/${mode}`;
}

const SupplierPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { supplierId: supplierIdParam } = useParams<{ supplierId: string }>();

  const { settings } = useSettings();
  const notifications = useUnifiedNotifications();
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [isLoadingSuppliers, setIsLoadingSuppliers] = React.useState(true);
  const [isSettingsOpen, setSettingsOpen] = React.useState(false);

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
    setIsLoadingSuppliers(true);
    try {
      const fetchedSuppliers: Supplier[] = await invoke('get_suppliers');
      setSuppliers(fetchedSuppliers);
    } catch (error) {
      console.error('Failed to fetch suppliers:', error);
      notifications.supplier.error('fetch', String(error));
    } finally {
      setIsLoadingSuppliers(false);
    }
    // Context `notifications` changes identity each render; listing it recreated this callback
    // every render and retriggered the mount effect (refetch loop), so imports never showed in UI.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable callback; see comment above
  }, []);

  React.useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  const handleAdd = async (newSupplierData: Omit<Supplier, 'id'>) => {
    const maxId = suppliers.reduce((max, s) => {
      const num = parseInt(s.id.split('-')[1]);
      return num > max ? num : max;
    }, 0);
    const newId = `Sup-${(maxId + 1).toString().padStart(3, '0')}`;
    const newSupplier: Supplier = { id: newId, ...newSupplierData };

    try {
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

  const handleExportExcel = async () => {
    try {
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

      suppliers.forEach(s => {
        worksheet.addRow([
          s.id,
          s.supplierName ?? '',
          s.shortName ?? '',
          s.country ?? '',
          s.email ?? '',
          s.phone ?? '',
          s.beneficiaryName ?? '',
          s.bankName ?? '',
          s.branch ?? '',
          s.bankAddress ?? '',
          s.accountNo ?? '',
          s.iban ?? '',
          s.swiftCode ?? '',
          s.isActive ? 'Yes' : 'No',
        ]);
      });

      worksheet.columns.forEach(column => {
        if (!column.values) return;
        const maxLength = Math.max(
          ...column.values.map(v => (v ? String(v).length : 0))
        );
        column.width = Math.min(Math.max(12, maxLength + 2), 40);
      });

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
        'Suppliers Excel downloaded successfully.'
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
    const headers =
      'supplierName,shortName,country,email,phone,beneficiaryName,bankName,branch,bankAddress,accountNo,iban,swiftCode,isActive';
    const blob = new Blob([headers], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'supplier_template.csv';
    a.click();
    URL.revokeObjectURL(url);
    notifications.success(
      'Template Downloaded',
      'Supplier import template downloaded successfully!'
    );
  };

  const handleImport = async () => {
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
      const lines = content.split(/\r?\n/).slice(1); // Skip header
      const newSuppliers: Supplier[] = [];
      let maxId = suppliers.reduce(
        (max, s) => Math.max(max, parseInt(s.id.split('-')[1])),
        0
      );

      for (const line of lines) {
        if (line.trim() === '') continue;
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
        ] = line.split(',');

        maxId++;
        const newId = `Sup-${maxId.toString().padStart(3, '0')}`;

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
          isActive: isActiveStr.trim().toLowerCase() === 'true',
        });
      }

      if (newSuppliers.length > 0) {
        await invoke('add_suppliers_bulk', { suppliers: newSuppliers });
        notifications.supplier.imported(newSuppliers.length);
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
            className="h-auto bg-transparent p-0 !text-sm !font-semibold text-accent-foreground hover:bg-transparent hover:text-accent-foreground"
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
            className="h-auto bg-transparent p-0 !text-sm !font-semibold text-accent-foreground hover:bg-transparent hover:text-accent-foreground"
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
            className="h-auto bg-transparent p-0 !text-sm !font-semibold text-accent-foreground hover:bg-transparent hover:text-accent-foreground"
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
  }, [settings.modules.supplier, settings.textFormat, handleView, handleEdit]);

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
      <div className="from-background to-muted/20 flex min-h-screen flex-col bg-gradient-to-br">
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
    <div className="from-background to-muted/20 min-h-screen bg-gradient-to-br">
      <div className="container mx-auto px-4 py-8">
        {/* Professional Header Section */}
        <div className="mb-8">
          <div className="bg-card rounded-xl border p-6 shadow-sm">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              {/* Title Section */}
              <div className="flex items-center gap-4">
                <div className="bg-primary/10 rounded-lg p-3">
                  <Settings className="text-primary h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-card-foreground text-2xl font-bold">
                    Suppliers
                  </h1>
                  <p className="text-muted-foreground mt-1">
                    Manage supplier information and business relationships
                  </p>
                  <div className="text-muted-foreground mt-2 flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1">
                      <div className="h-2 w-2 rounded-full bg-green-500"></div>
                      {suppliers.length} Active Suppliers
                    </span>
                    <span className="flex items-center gap-1">
                      <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                      {suppliers.filter(s => s.isActive).length} Enabled
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="default"
                        size="icon"
                        onClick={() => setSettingsOpen(true)}
                        className="h-10 w-10"
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
                  onClick={handleExportExcel}
                  className="h-10 px-4"
                  useAccentColor
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>

                <Button
                  variant="default"
                  onClick={handleDownloadTemplate}
                  className="h-10 px-4"
                  useAccentColor
                >
                  <Download className="mr-2 h-4 w-4" />
                  Template
                </Button>

                <Button
                  variant="default"
                  onClick={handleImport}
                  className="h-10 px-4"
                  useAccentColor
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Import
                </Button>

                <AddSupplierForm onAdd={handleAdd} />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card min-h-[280px] min-w-0 overflow-hidden rounded-xl border shadow-sm">
          <ResponsiveDataTable
            columns={columns}
            data={suppliers}
            searchPlaceholder="Search suppliers by name, country, email..."
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
        </div>

        {settingsDialog}
      </div>
    </div>
  );
};

export default SupplierPage;
