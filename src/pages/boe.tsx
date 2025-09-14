// src/pages/boe/index.tsx (MODIFIED)
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { Download, Loader2, Plus, Upload } from 'lucide-react';
import Papa from 'papaparse';
import { useUnifiedNotifications } from '@/hooks/useUnifiedNotifications';

import * as React from 'react';

import { getBoeColumns } from '@/components/boe/columns';
import { ResponsiveDataTable } from '@/components/ui/responsive-table';
import { BoeForm } from '@/components/boe/form';
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

const BoePage = () => {
  const { settings } = useSettings();
  const notifications = useUnifiedNotifications();
  const [boes, setBoes] = React.useState<BoeDetails[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isFormOpen, setFormOpen] = React.useState(false);
  const [isViewOpen, setViewOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [boeToEdit, setBoeToEdit] = React.useState<BoeDetails | null>(null);
  const [boeToView, setBoeToView] = React.useState<BoeDetails | null>(null);
  const [boeToDelete, setBoeToDelete] = React.useState<{
    id: string;
    number: string;
  } | null>(null);

  const fetchData = async () => {
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
  };

  React.useEffect(() => {
    fetchData();
  }, []);

  const handleOpenFormForAdd = () => {
    setBoeToEdit(null);
    setFormOpen(true);
  };

  const handleOpenFormForEdit = React.useCallback((boe: BoeDetails) => {
    setBoeToEdit(boe);
    setFormOpen(true);
  }, []);

  const handleView = React.useCallback((boe: BoeDetails) => {
    setBoeToView(boe);
    setViewOpen(true);
  }, []);

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
        // The backend command now expects the payload directly
        await invoke('add_boe', { payload: data });
        notifications.boe.created(data.beNumber);
      }
      fetchData();
      setFormOpen(false);
    } catch (error) {
      console.error('Failed to save BOE:', error);
      notifications.boe.error('save', String(error));
    }
  };

  type BoeCsvRow = { [key: string]: string };

  const handleImport = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'CSV Files',
            extensions: ['csv'],
          },
        ],
      });

      if (selected) {
        const csvText = await readTextFile(selected as string);

        // Use PapaParse with proper error handling
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
        let successCount = 0;
        let errorCount = 0;

        for (const row of csvRows) {
          try {
            const boeData = {
              beNumber: row.beNumber || '',
              beDate: row.beDate || '',
              location: row.location || '',
              totalAssessmentValue: parseFloat(row.totalAssessmentValue || '0'),
              dutyAmount: parseFloat(row.dutyAmount || '0'),
              paymentDate: row.paymentDate || '',
              dutyPaid: parseFloat(row.dutyPaid || '0'),
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
        }))
      );

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

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Bill of Entry Details</h1>
        <div className="flex items-center gap-2">
          <Button onClick={handleDownloadTemplate} variant="secondary">
            <Download className="mr-2 h-4 w-4" /> Template
          </Button>
          <Button onClick={handleImport} variant="success">
            <Upload className="mr-2 h-4 w-4" /> Import
          </Button>
          <Button onClick={handleExport} variant="info">
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Button onClick={handleOpenFormForAdd} variant="default">
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

      <BoeForm
        isOpen={isFormOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        boeToEdit={boeToEdit}
        existingBoes={boes}
      />
      <BoeViewDialog
        isOpen={isViewOpen}
        onOpenChange={setViewOpen}
        boe={boeToView}
      />
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete BOE{' '}
              <strong>{boeToDelete?.number}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setBoeToDelete(null)}
              className="custom-alert-action-ok"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="custom-alert-action-orange"
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default BoePage;
