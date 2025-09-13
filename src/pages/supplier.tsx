// src/pages/supplier.tsx
import type { Column, ColumnDef } from '@tanstack/react-table';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Upload,
} from 'lucide-react';
import { useUnifiedNotifications } from '@/hooks/useUnifiedNotifications';

import * as React from 'react';

import { SupplierActions } from '@/components/supplier/actions';
import { EditSupplierDialog } from '@/components/supplier/edit';
import { AddSupplierForm } from '@/components/supplier/form';
import { ResponsiveDataTable } from '@/components/ui/responsive-table';
import { ViewSupplierDialog } from '@/components/supplier/view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { formatText } from '@/lib/settings';
import { useSettings } from '@/lib/use-settings';
import { useResponsiveContext } from '@/providers/ResponsiveProvider';
import type { Supplier } from '@/types/supplier';

const SupplierPage = () => {
  const { settings } = useSettings();
  const { getTextClass, getButtonClass, getSpacingClass } =
    useResponsiveContext();
  const notifications = useUnifiedNotifications();
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [isViewOpen, setViewOpen] = React.useState(false);
  const [isEditOpen, setEditOpen] = React.useState(false);
  const [selectedSupplier, setSelectedSupplier] =
    React.useState<Supplier | null>(null);

  const fetchSuppliers = async () => {
    try {
      const fetchedSuppliers: Supplier[] = await invoke('get_suppliers');
      setSuppliers(fetchedSuppliers);
    } catch (error) {
      console.error('Failed to fetch suppliers:', error);
      notifications.supplier.error('fetch', String(error));
    }
  };

  React.useEffect(() => {
    fetchSuppliers();
  }, []);

  const handleView = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setViewOpen(true);
  };

  const handleEdit = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setEditOpen(true);
  };

  const handleAdd = async (newSupplierData: Omit<Supplier, 'id'>) => {
    const maxId = suppliers.reduce((max, s) => {
      const num = parseInt(s.id.split('-')[1]);
      return num > max ? num : max;
    }, 0);
    const newId = `Sup-${(maxId + 1).toString().padStart(3, '0')}`;
    const newSupplier: Supplier = { id: newId, ...newSupplierData };

    try {
      await invoke('add_supplier', { supplier: newSupplier });
      notifications.supplier.created(newSupplier.name);
      fetchSuppliers();
    } catch (error) {
      console.error('Failed to add supplier:', error);
      notifications.supplier.error('add', String(error));
    }
  };

  const handleSave = async (updatedSupplier: Supplier) => {
    try {
      await invoke('update_supplier', { supplier: updatedSupplier });
      notifications.supplier.updated(updatedSupplier.name);
      fetchSuppliers();
    } catch (error) {
      console.error('Failed to update supplier:', error);
      notifications.supplier.error('update', String(error));
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
      const selectedPath = await open({
        multiple: false,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });

      if (!selectedPath) {
        toast.info('Import cancelled.');
        return;
      }

      const content = await readTextFile(selectedPath as string);
      const lines = content.split('\n').slice(1); // Skip header
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

  const columns: ColumnDef<Supplier>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={value => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={value => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'id',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
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
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Supplier Name
          <SortIndicator column={column} />
        </Button>
      ),
      cell: ({ row }) =>
        formatText(row.getValue('supplierName'), settings.textFormat),
      meta: {
        visible: settings.modules.supplier.fields.supplierName?.visible ?? true,
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
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
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
      cell: ({ row }) => formatText(row.getValue('phone'), settings.textFormat),
      meta: {
        visible: settings.modules.supplier.fields.phone?.visible ?? true,
      },
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => formatText(row.getValue('email'), settings.textFormat),
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
        visible: settings.modules.supplier.fields.bankAddress?.visible ?? true,
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
      cell: ({ row }) => formatText(row.getValue('iban'), settings.textFormat),
      meta: { visible: settings.modules.supplier.fields.iban?.visible ?? true },
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

  return (
    <div className="container mx-auto py-10">
      <div
        className={`mb-4 flex items-center justify-between ${getSpacingClass()}`}
      >
        <h1 className={`${getTextClass('2xl')} font-bold`}>Suppliers</h1>
        <div className={`flex items-center ${getSpacingClass()}`}>
          <Button
            variant="outline"
            onClick={handleDownloadTemplate}
            className={getButtonClass()}
          >
            <Download className="mr-2 h-4 w-4" />
            Download Template
          </Button>
          <Button onClick={handleImport} className={getButtonClass()}>
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>

          <AddSupplierForm onAdd={handleAdd} />
        </div>
      </div>
      <ResponsiveDataTable
        columns={columns}
        data={suppliers}
        searchPlaceholder="Search suppliers..."
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
          supplierName: { minWidth: '200px', maxWidth: '300px' },
          email: { minWidth: '180px', maxWidth: '250px' },
          bankAddress: { minWidth: '200px', maxWidth: '300px' },
        }}
      />
      <ViewSupplierDialog
        isOpen={isViewOpen}
        onOpenChange={setViewOpen}
        supplier={selectedSupplier}
      />
      <EditSupplierDialog
        isOpen={isEditOpen}
        onOpenChange={setEditOpen}
        supplier={selectedSupplier}
        onSave={handleSave}
      />
    </div>
  );
};

export default SupplierPage;
