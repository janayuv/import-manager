// src/pages/boe.tsx
import { safeInvoke as invoke } from '@/lib/ipc-safe';
import {
  useNativeFileDialogs,
  openTextFile,
  save,
  writeTextFile,
} from '@/lib/tauri-bridge';
import { Download, FileText, Plus, Upload } from 'lucide-react';
import Papa from 'papaparse';
import { useUnifiedNotifications } from '@/hooks/useUnifiedNotifications';

import * as React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { getBoeColumns } from '@/components/boe/columns';
import { BoeForm } from '@/components/boe/form';
import { BoeDataTable } from '@/components/boe/table-boe';
import { BoeViewDialog } from '@/components/boe/view';
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
import { useSettings } from '@/lib/use-settings';
import type { BoeDetails } from '@/types/boe';
import type { SavedBoe } from '@/types/boe-entry';

/** URL path for BOE view or edit (bookmarkable, browser back/forward). */
export function boeDetailPath(boeId: string, mode: 'view' | 'edit') {
  return `/boe/${encodeURIComponent(boeId)}/${mode}`;
}

/** URL path to create a new BOE (full page). */
export const boeNewPath = '/boe/new';

type PaginatedResult<T> = {
  data: T[];
  totalCount: number;
};

const BoePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { boeId: boeIdParam } = useParams<{ boeId: string }>();

  const { settings } = useSettings();
  const notifications = useUnifiedNotifications();
  const [boes, setBoes] = React.useState<BoeDetails[]>([]);
  const [allBoesForMetrics, setAllBoesForMetrics] = React.useState<
    BoeDetails[]
  >([]);
  const [savedBoes, setSavedBoes] = React.useState<SavedBoe[]>([]);
  const [totalCount, setTotalCount] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(settings.modules?.boe?.itemsPerPage || 50);
  const [loading, setLoading] = React.useState(true);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [boeToDelete, setBoeToDelete] = React.useState<{
    id: string;
    number: string;
  } | null>(null);

  const [searchInput, setSearchInput] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('All');

  React.useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const boePanel = React.useMemo((): 'none' | 'view' | 'edit' | 'add' => {
    if (location.pathname === boeNewPath) return 'add';
    if (!boeIdParam) return 'none';
    if (location.pathname.endsWith('/edit')) return 'edit';
    if (location.pathname.endsWith('/view')) return 'view';
    return 'none';
  }, [boeIdParam, location.pathname]);

  const decodedBoeId = React.useMemo(() => {
    if (!boeIdParam) return null;
    try {
      return decodeURIComponent(boeIdParam);
    } catch {
      return boeIdParam;
    }
  }, [boeIdParam]);

  const selectedBoeFromUrl = React.useMemo(() => {
    if (!decodedBoeId) return null;
    return allBoesForMetrics.find(b => b.id === decodedBoeId) ?? null;
  }, [allBoesForMetrics, decodedBoeId]);

  const closeBoePanel = React.useCallback(() => {
    navigate('/boe');
  }, [navigate]);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [result, allRows, savedRows] = await Promise.all([
        invoke<PaginatedResult<BoeDetails>>('get_boes_paginated', {
          page,
          pageSize,
        }),
        invoke<BoeDetails[]>('get_boes'),
        invoke<SavedBoe[]>('get_boe_calculations'),
      ]);
      const safeData = Array.isArray(result?.data) ? result.data : [];
      const safeTotalCount = Number.isFinite(result?.totalCount)
        ? result.totalCount
        : safeData.length;
      setBoes(safeData);
      setTotalCount(safeTotalCount);
      setAllBoesForMetrics(Array.isArray(allRows) ? allRows : []);
      setSavedBoes(Array.isArray(savedRows) ? savedRows : []);
    } catch (error) {
      console.error('Failed to fetch BOE data:', error);
      notifications.boe.error('load data', String(error));
    } finally {
      setLoading(false);
    }
  }, [notifications.boe, page, pageSize]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const workflowStatusByBoeId = React.useMemo(() => {
    const map = new Map<string, SavedBoe['status']>();
    for (const s of savedBoes) {
      if (!s.boeId) continue;
      map.set(s.boeId, s.status);
    }
    return map;
  }, [savedBoes]);

  const getWorkflowStatus = React.useCallback(
    (boe: BoeDetails): SavedBoe['status'] =>
      workflowStatusByBoeId.get(boe.id) ?? 'Awaiting BOE Data',
    [workflowStatusByBoeId]
  );

  const boeMetrics = React.useMemo(() => {
    let closed = 0;
    let reconciled = 0;
    let discrepancyOrInvestigation = 0;
    for (const b of allBoesForMetrics) {
      const s = getWorkflowStatus(b);
      if (s === 'Closed') closed++;
      else if (s === 'Reconciled') reconciled++;
      else if (s === 'Discrepancy Found' || s === 'Investigation') {
        discrepancyOrInvestigation++;
      }
    }
    return {
      total: allBoesForMetrics.length,
      closed,
      reconciled,
      discrepancyOrInvestigation,
    };
  }, [allBoesForMetrics, getWorkflowStatus]);

  const filteredAllBoes = React.useMemo(() => {
    let rows = allBoesForMetrics;
    const q = debouncedSearch.trim().toLowerCase();
    if (q) {
      rows = rows.filter(b => {
        const hay = [
          b.beNumber,
          b.location,
          b.challanNumber,
          b.refId,
          b.transactionId,
          b.id,
        ]
          .filter(Boolean)
          .map(s => String(s).toLowerCase());
        return hay.some(s => s.includes(q));
      });
    }
    if (statusFilter !== 'All') {
      rows = rows.filter(b => getWorkflowStatus(b) === statusFilter);
    }
    return rows;
  }, [allBoesForMetrics, debouncedSearch, statusFilter, getWorkflowStatus]);

  const filteredTotal = filteredAllBoes.length;
  const serverTotalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));

  React.useEffect(() => {
    const maxP = Math.max(1, Math.ceil(filteredTotal / pageSize));
    setPage(p => (p > maxP ? maxP : p));
  }, [filteredTotal, pageSize]);

  const tableRows = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredAllBoes.slice(start, start + pageSize);
  }, [filteredAllBoes, page, pageSize]);

  const hasActiveFilters = !!debouncedSearch.trim() || statusFilter !== 'All';

  const handleOpenFormForAdd = React.useCallback(() => {
    navigate(boeNewPath);
  }, [navigate]);

  const handleOpenFormForEdit = React.useCallback(
    (boe: BoeDetails) => {
      navigate(boeDetailPath(boe.id, 'edit'));
    },
    [navigate]
  );

  const handleView = React.useCallback(
    (boe: BoeDetails) => {
      navigate(boeDetailPath(boe.id, 'view'));
    },
    [navigate]
  );

  const handleDeleteRequest = React.useCallback((boe: BoeDetails) => {
    setBoeToDelete({ id: boe.id, number: boe.beNumber });
    setIsDeleteDialogOpen(true);
  }, []);

  const handleDeleteConfirm = async () => {
    if (boeToDelete) {
      try {
        await invoke('delete_boe', { id: boeToDelete.id });
        notifications.boe.deleted(boeToDelete.number);
        fetchData();
        if (decodedBoeId === boeToDelete.id) {
          navigate('/boe');
        }
      } catch (error) {
        console.error('Failed to delete BOE:', error);
        notifications.boe.error('delete', String(error));
      }
    }
    setIsDeleteDialogOpen(false);
    setBoeToDelete(null);
  };

  const handleSubmit = async (data: Omit<BoeDetails, 'id'>, id?: string) => {
    try {
      if (id) {
        await invoke('update_boe', { boe: { id, ...data } });
        notifications.boe.updated(data.beNumber);
      } else {
        await invoke('add_boe', { payload: data });
        notifications.boe.created(data.beNumber);
      }
      fetchData();
      if (boePanel === 'edit' || boePanel === 'add') {
        navigate('/boe');
      }
    } catch (error) {
      console.error('Failed to save BOE:', error);
      notifications.boe.error('save', String(error));
    }
  };

  type BoeCsvRow = { [key: string]: string };

  const handleImport = React.useCallback(async () => {
    try {
      const selectedFile = await openTextFile({
        multiple: false,
        filters: [
          {
            name: 'CSV Files',
            extensions: ['csv'],
          },
        ],
      });

      if (selectedFile) {
        const csvText = selectedFile.contents;

        let csvRows: BoeCsvRow[] = [];
        let hasErrors = false;

        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: results => {
            if (results.errors.length > 0) {
              hasErrors = true;
              console.error('CSV parsing errors:', results.errors);
            } else {
              csvRows = results.data as BoeCsvRow[];
            }
          },
          error: (err: Error) => {
            hasErrors = true;
            console.error('CSV parsing error:', err);
          },
        });

        if (hasErrors) {
          notifications.error(
            'CSV Parsing Error',
            'CSV parsing errors occurred.'
          );
          return;
        }

        const validRows = csvRows.filter(
          row => (row.beNumber || '').trim() !== ''
        );
        if (csvRows.length > 0 && validRows.length === 0) {
          notifications.error(
            'Import Failed',
            'No valid BOE rows found. Use the template columns: beNumber, beDate, location, totalAssessmentValue, dutyAmount, paymentDate, dutyPaid, challanNumber, refId, transactionId.'
          );
          return;
        }

        let successCount = 0;
        let errorCount = 0;

        for (const row of validRows) {
          try {
            const challanNumber = (row.challanNumber ?? '').trim();
            const refId = (row.refId ?? '').trim();
            const transactionId = (row.transactionId ?? '').trim();
            const boeData = {
              beNumber: row.beNumber || '',
              beDate: row.beDate || '',
              location: row.location || '',
              totalAssessmentValue: parseFloat(row.totalAssessmentValue || '0'),
              dutyAmount: parseFloat(row.dutyAmount || '0'),
              paymentDate: row.paymentDate || '',
              dutyPaid: parseFloat(row.dutyPaid || '0'),
              challanNumber: challanNumber || undefined,
              refId: refId || undefined,
              transactionId: transactionId || undefined,
            };

            await invoke('add_boe', { payload: boeData });
            successCount++;
          } catch (error) {
            console.error('Failed to import BOE row:', row, error);
            errorCount++;
          }
        }

        if (successCount > 0) {
          notifications.boe.imported(successCount);
          if (errorCount > 0) {
            notifications.error(
              'Partial Import',
              `${errorCount} BOEs failed to import.`
            );
          }
          fetchData();
        } else {
          notifications.error('Import Failed', 'No BOEs were imported.');
        }
      } else {
        notifications.info('Import Cancelled', 'Import cancelled.');
      }
    } catch (error) {
      console.error('Failed to import BOEs:', error);
      notifications.boe.error('import', String(error));
    }
  }, [notifications, fetchData]);

  const handleExport = React.useCallback(async () => {
    try {
      const csv = Papa.unparse(
        boes.map(boe => ({
          beNumber: boe.beNumber,
          beDate: boe.beDate,
          location: boe.location,
          totalAssessmentValue: boe.totalAssessmentValue,
          dutyAmount: boe.dutyAmount,
          paymentDate: boe.paymentDate,
          dutyPaid: boe.dutyPaid,
          challanNumber: boe.challanNumber ?? '',
          refId: boe.refId ?? '',
          transactionId: boe.transactionId ?? '',
        }))
      );

      if (!useNativeFileDialogs) {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'boes.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        notifications.success('Export Complete', 'BOEs exported successfully!');
        return;
      }

      const filePath = await save({
        filters: [
          {
            name: 'CSV Files',
            extensions: ['csv'],
          },
        ],
      });

      if (filePath) {
        await writeTextFile(filePath, csv);
        notifications.success('Export Complete', 'BOEs exported successfully!');
      }
    } catch (error) {
      console.error('Failed to export BOEs:', error);
      notifications.boe.error('export', String(error));
    }
  }, [boes, notifications]);

  const handleDownloadTemplate = React.useCallback(async () => {
    const templateData = [
      {
        beNumber: 'BE123456789',
        beDate: '01-01-2024',
        location: 'Mumbai',
        totalAssessmentValue: '100000',
        dutyAmount: '15000',
        paymentDate: '02-01-2024',
        dutyPaid: '15000',
        challanNumber: '2041914258',
        refId: 'REF-EXAMPLE-001',
        transactionId: 'TXN-EXAMPLE-001',
      },
    ];

    const csv = Papa.unparse(templateData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'boe-import-template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    notifications.success(
      'Template Downloaded',
      'BOE import template downloaded successfully!'
    );
  }, [notifications]);

  const columns = React.useMemo(
    () =>
      getBoeColumns({
        onView: handleView,
        onEdit: handleOpenFormForEdit,
        onDelete: handleDeleteRequest,
        settings,
        getWorkflowStatus,
      }),
    [
      handleView,
      handleOpenFormForEdit,
      handleDeleteRequest,
      settings,
      getWorkflowStatus,
    ]
  );

  const renderEmptyState = React.useCallback((): React.ReactNode => {
    const isFiltered = hasActiveFilters;
    const title = isFiltered ? 'No matching BOEs' : 'No BOEs on this page';
    const body = debouncedSearch.trim()
      ? `No rows match "${debouncedSearch.trim()}". Try a different search.`
      : statusFilter !== 'All'
        ? 'No rows for the current status filter on this page.'
        : 'Add a BOE, import a CSV, or go to another page.';
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
              Add New BOE
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
            <button type="button" className="im-hdr-btn" onClick={handleImport}>
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
          </div>
        )}
      </div>
    );
  }, [
    hasActiveFilters,
    debouncedSearch,
    statusFilter,
    handleOpenFormForAdd,
    handleDownloadTemplate,
    handleImport,
  ]);

  const deleteDialog = (
    <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete BOE{' '}
            <strong>{boeToDelete?.number}</strong>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button
              onClick={() => setBoeToDelete(null)}
              variant="outline"
              useAccentColor
            >
              Cancel
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button onClick={handleDeleteConfirm} variant="destructive">
              Continue
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (boePanel !== 'none') {
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
            onClick={closeBoePanel}
          >
            ← Back to all BOE
          </button>
          <span style={{ color: 'var(--color-im-faint)', fontSize: 12 }}>
            {boePanel === 'view'
              ? 'Viewing BOE record'
              : boePanel === 'edit'
                ? 'Editing BOE record'
                : 'Adding new BOE'}
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
              LOADING…
            </div>
          ) : boePanel === 'add' ? (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              <BoeForm
                isOpen={true}
                presentation="page"
                className="min-h-0 flex-1"
                onOpenChange={open => {
                  if (!open) closeBoePanel();
                }}
                onSubmit={handleSubmit}
                boeToEdit={null}
                existingBoes={allBoesForMetrics}
              />
            </div>
          ) : !selectedBoeFromUrl ? (
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
                BOE NOT FOUND
              </h2>
              <p style={{ fontSize: 12, color: 'var(--color-im-faint)' }}>
                No BOE with ID{' '}
                <span style={{ fontFamily: 'var(--font-im-mono)' }}>
                  {decodedBoeId ?? boeIdParam}
                </span>
                .
              </p>
              <button
                type="button"
                className="im-btn"
                onClick={closeBoePanel}
                style={{ alignSelf: 'flex-start' }}
              >
                ← Back to all BOE
              </button>
            </div>
          ) : boePanel === 'view' ? (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              <BoeViewDialog
                isOpen={true}
                onOpenChange={open => {
                  if (!open) closeBoePanel();
                }}
                boe={selectedBoeFromUrl}
                presentation="page"
                className="min-h-0 flex-1"
                onEdit={() =>
                  navigate(boeDetailPath(selectedBoeFromUrl.id, 'edit'))
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
              <BoeForm
                isOpen={true}
                presentation="page"
                className="min-h-0 flex-1"
                onOpenChange={open => {
                  if (!open) closeBoePanel();
                }}
                onSubmit={handleSubmit}
                boeToEdit={selectedBoeFromUrl}
                existingBoes={allBoesForMetrics}
              />
            </div>
          )}
        </div>
        {deleteDialog}
      </div>
    );
  }

  return (
    <div className="im-supplier-page">
      <div className="im-page-header">
        <div className="im-page-header__title">
          <h1>
            Bill of Entry
            <span className="sr-only">Bill of Entry Details</span>
          </h1>
          <span className="im-record-badge">{totalCount} RECORDS</span>
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
          <button type="button" className="im-hdr-btn" onClick={handleImport}>
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
          <button type="button" className="im-hdr-btn" onClick={handleExport}>
            <Download
              style={{
                width: 12,
                height: 12,
                display: 'inline',
                marginRight: 5,
              }}
            />
            Export
          </button>
          <button
            type="button"
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
            Add New BOE
          </button>
        </div>
      </div>

      <div className="im-boe-metrics">
        <div className="im-boe-metric im-boe-metric--accent">
          <div className="im-boe-metric__label">Total BOE</div>
          <div className="im-boe-metric__value">{boeMetrics.total}</div>
        </div>
        <div className="im-boe-metric im-boe-metric--good">
          <div className="im-boe-metric__label">Cleared</div>
          <div className="im-boe-metric__value">{boeMetrics.closed}</div>
        </div>
        <div className="im-boe-metric im-boe-metric--warn">
          <div className="im-boe-metric__label">Reconciled</div>
          <div className="im-boe-metric__value">{boeMetrics.reconciled}</div>
        </div>
        <div className="im-boe-metric im-boe-metric--bad">
          <div className="im-boe-metric__label">Needs Attention</div>
          <div className="im-boe-metric__value">
            {boeMetrics.discrepancyOrInvestigation}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <BoeDataTable
          columns={columns}
          data={tableRows}
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          totalCount={filteredTotal}
          isLoading={loading}
          getRowClassName={boe => {
            const status = getWorkflowStatus(boe);
            if (status === 'Discrepancy Found' || status === 'Investigation') {
              return 'is-boe-hold';
            }
            if (status === 'Reconciled') return 'is-boe-pending-overdue';
            return '';
          }}
          renderEmptyState={renderEmptyState}
          serverPage={page}
          serverTotalPages={serverTotalPages}
          onServerPrevPage={() => setPage(p => Math.max(1, p - 1))}
          onServerNextPage={() =>
            setPage(p => Math.min(serverTotalPages, p + 1))
          }
          onClearFilters={() => {
            setSearchInput('');
            setDebouncedSearch('');
            setStatusFilter('All');
          }}
          hasActiveFilters={hasActiveFilters}
        />
      </div>

      {deleteDialog}
    </div>
  );
};

export default BoePage;
