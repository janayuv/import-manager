'use client';

import { invoke } from '@tauri-apps/api/core';
import { ArrowLeft } from 'lucide-react';
import { useUnifiedNotifications } from '@/hooks/useUnifiedNotifications';

import * as React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { DeleteConfirmDialog } from '@/components/boe-entry/delete-confirm-dialog';
import { BoeEntryForm } from '@/components/boe-entry/form';
import { SavedBoeList } from '@/components/boe-entry/saved-boe-list';
import { ViewBoeDialog } from '@/components/boe-entry/view-boe-dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { BoeDetails } from '@/types/boe';
import type { SavedBoe, Shipment } from '@/types/boe-entry';

export function boeEntryDetailPath(savedBoeId: string, mode: 'view' | 'edit') {
  return `/boe-entry/${encodeURIComponent(savedBoeId)}/${mode}`;
}

export const boeEntryNewPath = '/boe-entry/new';

export default function BoeEntryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { savedBoeId: savedBoeIdParam } = useParams<{ savedBoeId: string }>();

  const notifications = useUnifiedNotifications();
  const [shipments, setShipments] = React.useState<Shipment[]>([]);
  const [savedBoes, setSavedBoes] = React.useState<SavedBoe[]>([]);
  const [allBoes, setAllBoes] = React.useState<BoeDetails[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [deletingBoe, setDeletingBoe] = React.useState<SavedBoe | null>(null);

  const entryPanel = React.useMemo((): 'none' | 'view' | 'edit' | 'add' => {
    if (location.pathname === boeEntryNewPath) return 'add';
    if (!savedBoeIdParam) return 'none';
    if (location.pathname.endsWith('/edit')) return 'edit';
    if (location.pathname.endsWith('/view')) return 'view';
    return 'none';
  }, [savedBoeIdParam, location.pathname]);

  const decodedSavedBoeId = React.useMemo(() => {
    if (!savedBoeIdParam) return null;
    try {
      return decodeURIComponent(savedBoeIdParam);
    } catch {
      return savedBoeIdParam;
    }
  }, [savedBoeIdParam]);

  const selectedSavedBoeFromUrl = React.useMemo(() => {
    if (!decodedSavedBoeId) return null;
    return savedBoes.find(b => b.id === decodedSavedBoeId) ?? null;
  }, [savedBoes, decodedSavedBoeId]);

  const closeEntryPanel = React.useCallback(() => {
    navigate('/boe-entry');
  }, [navigate]);

  const fetchData = React.useCallback(async () => {
    try {
      const [shipmentsData, savedBoesData, allBoesData] = await Promise.all([
        invoke<Shipment[]>('get_shipments_for_boe_entry'),
        invoke<SavedBoe[]>('get_boe_calculations'),
        invoke<BoeDetails[]>('get_boes'),
      ]);
      setShipments(shipmentsData);
      setSavedBoes(savedBoesData);
      setAllBoes(allBoesData);
    } catch (error) {
      notifications.boe.error('load data', String(error));
    }
  }, [notifications.boe]);

  React.useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      await fetchData();
      setIsLoading(false);
    };
    loadInitialData();
  }, [fetchData]);

  const handleSaveOrUpdateBoe = async (boeData: SavedBoe) => {
    const isEditing = savedBoes.some(b => b.id === boeData.id);
    const loadingId = notifications.loading(
      isEditing ? 'Updating BOE...' : 'Saving BOE...'
    );

    try {
      if (isEditing) {
        await invoke('update_boe_calculation', { payload: boeData });
      } else {
        await invoke('add_boe_calculation', { payload: boeData });
      }
      await fetchData();
      notifications.dismiss(loadingId);
      if (isEditing) {
        notifications.boe.updated(boeData.invoiceNumber);
      } else {
        notifications.boe.created(boeData.invoiceNumber);
      }
      if (entryPanel === 'edit' || entryPanel === 'add') {
        navigate('/boe-entry');
      }
    } catch (error) {
      notifications.dismiss(loadingId);
      notifications.boe.error(isEditing ? 'update' : 'save', String(error));
    }
  };

  const handleViewBoe = React.useCallback(
    (boeId: string) => {
      navigate(boeEntryDetailPath(boeId, 'view'));
    },
    [navigate]
  );

  const handleEditBoe = React.useCallback(
    (boeId: string) => {
      navigate(boeEntryDetailPath(boeId, 'edit'));
    },
    [navigate]
  );

  const handleCancelEdit = () => {
    closeEntryPanel();
  };

  const handleDeleteBoe = (boeId: string) => {
    const boeToDelete = savedBoes.find(b => b.id === boeId) || null;
    setDeletingBoe(boeToDelete);
  };

  const handleConfirmDelete = async () => {
    if (!deletingBoe) return;
    const loadingId = notifications.loading('Deleting BOE...');
    try {
      await invoke('delete_boe_calculation', { id: deletingBoe.id });
      await fetchData();
      notifications.dismiss(loadingId);
      notifications.boe.deleted(deletingBoe.invoiceNumber);
      if (decodedSavedBoeId === deletingBoe.id) {
        navigate('/boe-entry');
      }
      setDeletingBoe(null);
    } catch (error) {
      notifications.dismiss(loadingId);
      notifications.boe.error('delete', String(error));
    }
  };

  const deleteDialog = deletingBoe ? (
    <DeleteConfirmDialog
      boe={deletingBoe}
      onConfirm={handleConfirmDelete}
      onCancel={() => setDeletingBoe(null)}
    />
  ) : null;

  if (entryPanel !== 'none') {
    return (
      <div className="from-background to-muted/20 flex min-h-screen flex-col bg-gradient-to-br">
        <div className="container mx-auto flex min-h-0 flex-1 flex-col px-4 py-6">
          <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              useAccentColor
              onClick={closeEntryPanel}
              className="gap-2"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Back to BOE entry
            </Button>
            <span className="text-muted-foreground text-sm">
              {entryPanel === 'view'
                ? 'Viewing saved calculation'
                : entryPanel === 'edit'
                  ? 'Editing saved calculation'
                  : 'New BOE calculation'}
            </span>
          </div>

          {isLoading ? (
            <div
              className="border-border bg-card text-muted-foreground flex min-h-[240px] w-full max-w-[min(calc(100vw-2rem),120rem)] flex-1 items-center justify-center self-center rounded-xl border text-sm shadow-sm"
              role="status"
              aria-live="polite"
            >
              Loading…
            </div>
          ) : entryPanel === 'add' ? (
            <div className="border-border bg-card flex min-h-0 w-full max-w-[min(calc(100vw-2rem),120rem)] flex-1 flex-col self-center overflow-hidden rounded-xl border p-6 shadow-sm">
              <BoeEntryForm
                shipments={shipments}
                allBoes={allBoes}
                savedBoes={savedBoes}
                onSaveOrUpdate={handleSaveOrUpdateBoe}
                initialData={null}
                onCancelEdit={handleCancelEdit}
              />
            </div>
          ) : !selectedSavedBoeFromUrl ? (
            <div className="border-border bg-card mx-auto flex w-full max-w-lg flex-col gap-4 rounded-xl border p-8 shadow-sm">
              <h2 className="text-card-foreground text-lg font-semibold">
                Record not found
              </h2>
              <p className="text-muted-foreground text-sm">
                No saved BOE calculation with ID{' '}
                <span className="text-foreground font-mono">
                  {decodedSavedBoeId ?? savedBoeIdParam}
                </span>
                .
              </p>
              <Button
                type="button"
                variant="default"
                useAccentColor
                onClick={closeEntryPanel}
                className="w-fit"
              >
                Back to BOE entry
              </Button>
            </div>
          ) : entryPanel === 'view' ? (
            <div className="border-border bg-card flex min-h-0 w-full max-w-[min(calc(100vw-2rem),120rem)] flex-1 flex-col self-center overflow-hidden rounded-xl border shadow-sm">
              <ViewBoeDialog
                boe={selectedSavedBoeFromUrl}
                onClose={closeEntryPanel}
                presentation="page"
                className="min-h-0 flex-1"
                onEdit={() =>
                  navigate(
                    boeEntryDetailPath(selectedSavedBoeFromUrl.id, 'edit')
                  )
                }
              />
            </div>
          ) : (
            <div className="border-border bg-card flex min-h-0 w-full max-w-[min(calc(100vw-2rem),120rem)] flex-1 flex-col self-center overflow-hidden rounded-xl border p-6 shadow-sm">
              <BoeEntryForm
                shipments={shipments}
                allBoes={allBoes}
                savedBoes={savedBoes}
                onSaveOrUpdate={handleSaveOrUpdateBoe}
                initialData={selectedSavedBoeFromUrl}
                onCancelEdit={handleCancelEdit}
              />
            </div>
          )}
        </div>
        {deleteDialog}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-8 p-4 md:p-8">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="mt-2 h-4 w-96" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3 lg:grid-cols-6">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-72" />
            <Skeleton className="mt-2 h-4 w-80" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-4 md:p-8">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-xl font-semibold text-blue-600">
                BOE Entry & Calculation
              </CardTitle>
              <CardDescription>
                Select a shipment, link to a BOE, and enter details to calculate
                customs duties.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              useAccentColor
              className="shrink-0 self-start"
              onClick={() => navigate(boeEntryNewPath)}
            >
              Open full-page new calculation
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <BoeEntryForm
            shipments={shipments}
            allBoes={allBoes}
            savedBoes={savedBoes}
            onSaveOrUpdate={handleSaveOrUpdateBoe}
            initialData={null}
            onCancelEdit={handleCancelEdit}
          />
        </CardContent>
      </Card>

      <SavedBoeList
        savedBoes={savedBoes}
        onView={handleViewBoe}
        onEdit={handleEditBoe}
        onDelete={handleDeleteBoe}
      />

      {deleteDialog}
    </div>
  );
}
