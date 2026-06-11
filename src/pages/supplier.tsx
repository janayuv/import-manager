// src/pages/supplier.tsx
import { safeInvoke as invoke } from '@/lib/ipc-safe';
import { openTextFile } from '@/lib/tauri-bridge';
import { Package2, Plus } from 'lucide-react';
import { useUnifiedNotifications } from '@/hooks/useUnifiedNotifications';
import ExcelJS from 'exceljs';

import * as React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { SupplierEditPanel } from '@/components/supplier/edit';
import { SupplierAddPanel } from '@/components/supplier/form';
import { SupplierDataTable } from '@/components/supplier/table-industrial';
import { ModuleSettings } from '@/components/module-settings';
import { SupplierViewPanel } from '@/components/supplier/view';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
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
import type { Supplier } from '@/types/supplier';
import { createSupplierColumns } from './supplier-columns';

/** URL path for supplier view or edit (bookmarkable, browser back/forward). */
export function supplierDetailPath(supplierId: string, mode: 'view' | 'edit') {
  return `/supplier/${encodeURIComponent(supplierId)}/${mode}`;
}

/** URL path for the new-supplier page view. */
export const SUPPLIER_NEW_PATH = '/supplier/new';

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
  const [statusFilter, setStatusFilter] = React.useState<
    'all' | 'active' | 'inactive'
  >('all');

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchText(searchText);
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [searchText]);

  React.useEffect(() => {
    setCurrentPage(0);
  }, [debouncedSearchText]);

  const supplierPanel = React.useMemo((): 'none' | 'new' | 'view' | 'edit' => {
    if (location.pathname === SUPPLIER_NEW_PATH) return 'new';
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

  const closeSupplierPanel = React.useCallback(() => {
    navigate('/supplier');
  }, [navigate]);

  const fetchSuppliers = React.useCallback(async () => {
    setIsLoadingSuppliers(true);
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
    }
    // Context `notifications` changes identity each render; listing it recreated this callback
    // every render and retriggered effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, debouncedSearchText]);

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

  const handleDelete = React.useCallback(
    async (supplier: Supplier) => {
      const confirmed = window.confirm(
        `Delete "${supplier.supplierName}"?\n\nThe supplier will be soft-deleted and can be restored from the Deleted list.`
      );
      if (!confirmed) return;
      try {
        await invoke('delete_supplier', { supplierId: supplier.id });
        notifications.success(
          'Supplier Deleted',
          `"${supplier.supplierName}" has been deleted.`
        );
        fetchSuppliers();
      } catch (error) {
        console.error('Failed to delete supplier:', error);
        notifications.supplier.error('delete', String(error));
      }
    },
    // notifications changes identity each render; listing it recreates this callback unnecessarily.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchSuppliers]
  );

  const columns = React.useMemo(
    () => createSupplierColumns(handleView, handleEdit, handleDelete),
    [handleView, handleEdit, handleDelete]
  );

  const renderEmptyState = React.useCallback((): React.ReactNode => {
    const isFiltered = !!debouncedSearchText || statusFilter !== 'all';
    const title = isFiltered ? 'No matching suppliers' : 'No suppliers yet';
    const body = debouncedSearchText
      ? `No suppliers match "${debouncedSearchText}". Try a different search term.`
      : statusFilter !== 'all'
        ? 'No suppliers match the active status filter.'
        : 'Add your first supplier manually or import a CSV file to get started.';
    return (
      <div className="im-empty-state">
        <div className="im-empty-state__icon">
          <Package2 size={40} strokeWidth={1} />
        </div>
        <div className="im-empty-state__title">{title}</div>
        <div className="im-empty-state__body">{body}</div>
        {!isFiltered && (
          <div className="im-empty-state__actions">
            <button
              className="im-hdr-btn im-hdr-btn--primary"
              onClick={() => navigate(SUPPLIER_NEW_PATH)}
              disabled={isImportingSuppliers}
            >
              Add supplier
            </button>
            <button
              className="im-hdr-btn"
              onClick={handleImport}
              disabled={isImportingSuppliers}
            >
              Import CSV
            </button>
          </div>
        )}
      </div>
    );
    // handleAdd and handleImport are stable; isImportingSuppliers intentionally in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchText, statusFilter, isImportingSuppliers]);

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
    } catch {
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

  // ── Settings dialog ──────────────────────────────────────────────
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

  // ── Add new supplier page view ────────────────────────────────────
  if (supplierPanel === 'new') {
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
            onClick={() => navigate('/supplier')}
          >
            ← Back to suppliers
          </button>
          <span style={{ color: 'var(--color-im-faint)', fontSize: 12 }}>
            Adding new supplier
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
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            role="main"
            aria-label="Add new supplier form"
          >
            <SupplierAddPanel
              onAdd={async newSupplierData => {
                await handleAdd(newSupplierData);
                navigate('/supplier');
              }}
              onCancel={() => navigate('/supplier')}
              className="min-h-0 flex-1"
            />
          </div>
        </div>
        {settingsDialog}
      </div>
    );
  }

  // ── Supplier detail panel (view / edit) ──────────────────────────
  if (supplierPanel !== 'none') {
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
            onClick={closeSupplierPanel}
          >
            ← Back to suppliers
          </button>
          <span style={{ color: 'var(--color-im-faint)', fontSize: 12 }}>
            {supplierPanel === 'view'
              ? 'Viewing supplier record'
              : 'Editing supplier record'}
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
          {isLoadingSuppliers ? (
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
              LOADING SUPPLIER…
            </div>
          ) : !selectedSupplier ? (
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
                SUPPLIER NOT FOUND
              </h2>
              <p style={{ fontSize: 12, color: 'var(--color-im-faint)' }}>
                There is no supplier with ID{' '}
                <span style={{ fontFamily: 'var(--font-im-mono)' }}>
                  {decodedSupplierId ?? supplierIdParam}
                </span>
                . It may have been removed or the link may be incorrect.
              </p>
              <button
                type="button"
                className="im-btn"
                onClick={closeSupplierPanel}
                style={{ alignSelf: 'flex-start' }}
              >
                ← Back to suppliers
              </button>
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

  // ── Main list view ───────────────────────────────────────────────
  return (
    <>
      <div className="im-supplier-page">
        {/* Page header */}
        <div className="im-page-header">
          <div className="im-page-header__title">
            <h1>Suppliers</h1>
            <span className="im-record-badge">
              {totalSuppliersCount} RECORDS
            </span>
          </div>
          <div className="im-page-header__actions">
            <button
              className="im-hdr-btn im-hdr-btn--primary"
              onClick={() => navigate(SUPPLIER_NEW_PATH)}
              disabled={isImportingSuppliers}
            >
              <Plus
                style={{
                  width: 12,
                  height: 12,
                  display: 'inline',
                  marginRight: 5,
                }}
              />
              Add supplier
            </button>
            <button
              className="im-hdr-btn"
              onClick={handleImport}
              disabled={isImportingSuppliers}
            >
              {isImportingSuppliers ? 'Importing…' : 'Import CSV'}
            </button>
            <button
              className="im-hdr-btn"
              onClick={handleExportExcel}
              disabled={isImportingSuppliers}
            >
              Export
            </button>
            <button
              className="im-hdr-btn"
              onClick={handleDownloadTemplate}
              disabled={isImportingSuppliers}
            >
              Template
            </button>
            <button
              className="im-hdr-btn"
              onClick={() => void handleOpenDeletedSuppliers()}
            >
              Deleted
            </button>
            <button
              className="im-hdr-btn"
              onClick={() => setSettingsOpen(true)}
            >
              Settings
            </button>
          </div>
        </div>

        {/* Table — fills remaining height */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <SupplierDataTable
            columns={columns}
            data={filteredSuppliers}
            searchValue={searchText}
            onSearchChange={setSearchText}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            totalCount={totalSuppliersCount}
            isLoading={isLoadingSuppliers}
            getRowClassName={row => (row.isActive ? '' : 'is-inactive')}
            renderEmptyState={renderEmptyState}
          />
        </div>
      </div>

      {/* Deleted suppliers dialog */}
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
    </>
  );
};

export default SupplierPage;
