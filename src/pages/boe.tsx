// src/pages/boe/index.tsx (MODIFIED)
import { invoke } from '@tauri-apps/api/core';
import {
  isTauriEnvironment,
  openTextFile,
  save,
  writeTextFile,
} from '@/lib/tauri-bridge';
import { ArrowLeft, Download, Loader2, Plus, Upload } from 'lucide-react';
import Papa from 'papaparse';
import { useUnifiedNotifications } from '@/hooks/useUnifiedNotifications';

import * as React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { getBoeColumns } from '@/components/boe/columns';
import { BoeForm } from '@/components/boe/form';
import { BoeViewDialog } from '@/components/boe/view';
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
import { useSettings } from '@/lib/use-settings';
import type { BoeDetails } from '@/types/boe';

/** URL path for BOE view or edit (bookmarkable, browser back/forward). */
export function boeDetailPath(boeId: string, mode: 'view' | 'edit') {
  return `/boe/${encodeURIComponent(boeId)}/${mode}`;
}

/** URL path to create a new BOE (full page). */
export const boeNewPath = '/boe/new';

const BoePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { boeId: boeIdParam } = useParams<{ boeId: string }>();

  const { settings } = useSettings();
  const notifications = useUnifiedNotifications();
  const [boes, setBoes] = React.useState<BoeDetails[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [boeToDelete, setBoeToDelete] = React.useState<{
    id: string;
    number: string;
  } | null>(null);

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
    return boes.find(b => b.id === decodedBoeId) ?? null;
  }, [boes, decodedBoeId]);

  const closeBoePanel = React.useCallback(() => {
    navigate('/boe');
  }, [navigate]);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const fetchedBoes = await invoke<BoeDetails[]>('get_boes');
      setBoes(fetchedBoes);
    } catch (error) {
      console.error('Failed to fetch BOE data:', error);
      notifications.boe.error('load data', String(error));
    } finally {
      setLoading(false);
    }
  }, [notifications.boe]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenFormForAdd = () => {
    navigate(boeNewPath);
  };

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

  const handleImport = async () => {
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
  };

  const handleExport = async () => {
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

      if (!isTauriEnvironment) {
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
  };

  const handleDownloadTemplate = async () => {
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
  };

  const columns = React.useMemo(
    () =>
      getBoeColumns({
        onView: handleView,
        onEdit: handleOpenFormForEdit,
        onDelete: handleDeleteRequest,
        settings,
      }),
    [handleView, handleOpenFormForEdit, handleDeleteRequest, settings]
  );

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
      <div className="from-background to-muted/20 flex min-h-screen flex-col bg-gradient-to-br">
        <div className="container mx-auto flex min-h-0 flex-1 flex-col px-4 py-6">
          <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              useAccentColor
              onClick={closeBoePanel}
              className="gap-2"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Back to all BOE
            </Button>
            <span className="text-muted-foreground text-sm">
              {boePanel === 'view'
                ? 'Viewing BOE record'
                : boePanel === 'edit'
                  ? 'Editing BOE record'
                  : 'Adding new BOE'}
            </span>
          </div>

          {loading ? (
            <div
              className="border-border bg-card text-muted-foreground flex min-h-[240px] w-full max-w-[min(calc(100vw-2rem),120rem)] flex-1 items-center justify-center self-center rounded-xl border text-sm shadow-sm"
              role="status"
              aria-live="polite"
            >
              Loading…
            </div>
          ) : boePanel === 'add' ? (
            <div className="border-border bg-card flex min-h-0 w-full max-w-[min(calc(100vw-2rem),120rem)] flex-1 flex-col self-center overflow-hidden rounded-xl border shadow-sm">
              <BoeForm
                isOpen={true}
                presentation="page"
                className="min-h-0 flex-1"
                onOpenChange={open => {
                  if (!open) closeBoePanel();
                }}
                onSubmit={handleSubmit}
                boeToEdit={null}
                existingBoes={boes}
              />
            </div>
          ) : !selectedBoeFromUrl ? (
            <div className="border-border bg-card mx-auto flex w-full max-w-lg flex-col gap-4 rounded-xl border p-8 shadow-sm">
              <h2 className="text-card-foreground text-lg font-semibold">
                BOE not found
              </h2>
              <p className="text-muted-foreground text-sm">
                No BOE with ID{' '}
                <span className="text-foreground font-mono">
                  {decodedBoeId ?? boeIdParam}
                </span>
                .
              </p>
              <Button
                type="button"
                variant="default"
                useAccentColor
                onClick={closeBoePanel}
                className="w-fit"
              >
                Back to all BOE
              </Button>
            </div>
          ) : boePanel === 'view' ? (
            <div className="border-border bg-card flex min-h-0 w-full max-w-[min(calc(100vw-2rem),120rem)] flex-1 flex-col self-center overflow-hidden rounded-xl border shadow-sm">
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
            <div className="border-border bg-card flex min-h-0 w-full max-w-[min(calc(100vw-2rem),120rem)] flex-1 flex-col self-center overflow-hidden rounded-xl border shadow-sm">
              <BoeForm
                isOpen={true}
                presentation="page"
                className="min-h-0 flex-1"
                onOpenChange={open => {
                  if (!open) closeBoePanel();
                }}
                onSubmit={handleSubmit}
                boeToEdit={selectedBoeFromUrl}
                existingBoes={boes}
              />
            </div>
          )}
        </div>
        {deleteDialog}
      </div>
    );
  }

  if (loading && boePanel === 'none') {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-blue-600">
            Bill of Entry Details
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage customs declarations and duty calculations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleDownloadTemplate}
            variant="default"
            useAccentColor
          >
            <Download className="mr-2 h-4 w-4" /> Template
          </Button>
          <Button onClick={handleImport} variant="default" useAccentColor>
            <Upload className="mr-2 h-4 w-4" /> Import
          </Button>
          <Button onClick={handleExport} variant="default" useAccentColor>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Button
            onClick={handleOpenFormForAdd}
            variant="default"
            useAccentColor
          >
            <Plus className="mr-2 h-4 w-4" /> Add New BOE
          </Button>
        </div>
      </div>

      <ResponsiveDataTable
        columns={columns}
        data={boes}
        searchPlaceholder="Search all BOEs..."
        showSearch={true}
        showPagination={true}
        pageSize={settings.modules?.boe?.itemsPerPage || 10}
        className=""
        hideColumnsOnSmall={['paymentDate', 'dutyPaid']}
        columnWidths={{
          beNumber: { minWidth: '120px', maxWidth: '150px' },
          beDate: { minWidth: '100px', maxWidth: '120px' },
          location: { minWidth: '120px', maxWidth: '180px' },
          totalAssessmentValue: { minWidth: '140px', maxWidth: '160px' },
          dutyAmount: { minWidth: '120px', maxWidth: '140px' },
          paymentDate: { minWidth: '100px', maxWidth: '120px' },
          dutyPaid: { minWidth: '100px', maxWidth: '120px' },
          actions: { minWidth: '120px', maxWidth: '150px' },
        }}
        moduleName="boe"
      />

      {deleteDialog}
    </div>
  );
};

export default BoePage;
