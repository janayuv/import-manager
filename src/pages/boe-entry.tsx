// src/pages/boe-entry/index.tsx (FIXED)
'use client';

import { invoke } from '@tauri-apps/api/core';
import { Toaster } from 'sonner';
import { useUnifiedNotifications } from '@/hooks/useUnifiedNotifications';

import * as React from 'react';

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
import { Skeleton } from '@/components/ui/skeleton';
import type { BoeDetails } from '@/types/boe';
import type { SavedBoe, Shipment } from '@/types/boe-entry';

// src/pages/boe-entry/index.tsx (FIXED)

// src/pages/boe-entry/index.tsx (FIXED)

// src/pages/boe-entry/index.tsx (FIXED)

// src/pages/boe-entry/index.tsx (FIXED)

// src/pages/boe-entry/index.tsx (FIXED)

// src/pages/boe-entry/index.tsx (FIXED)

export default function BoeEntryPage() {
  const notifications = useUnifiedNotifications();
  const [shipments, setShipments] = React.useState<Shipment[]>([]);
  const [savedBoes, setSavedBoes] = React.useState<SavedBoe[]>([]);
  const [allBoes, setAllBoes] = React.useState<BoeDetails[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const [viewingBoe, setViewingBoe] = React.useState<SavedBoe | null>(null);
  const [editingBoe, setEditingBoe] = React.useState<SavedBoe | null>(null);
  const [deletingBoe, setDeletingBoe] = React.useState<SavedBoe | null>(null);

  const fetchData = async () => {
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
  };

  React.useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      await fetchData();
      setIsLoading(false);
    };
    loadInitialData();
  }, []);

  const handleSaveOrUpdateBoe = async (boeData: SavedBoe) => {
    const isEditing = savedBoes.some(b => b.id === boeData.id);
    notifications.loading(isEditing ? 'Updating BOE...' : 'Saving BOE...');

    try {
      if (isEditing) {
        await invoke('update_boe_calculation', { payload: boeData });
      } else {
        await invoke('add_boe_calculation', { payload: boeData });
      }
      await fetchData();
      if (isEditing) {
        notifications.boe.updated(boeData.invoiceNumber);
      } else {
        notifications.boe.created(boeData.invoiceNumber);
      }
      setEditingBoe(null);
    } catch (error) {
      notifications.boe.error(isEditing ? 'update' : 'save', String(error));
    }
  };

  const handleViewBoe = (boeId: string) => {
    const boeToView = savedBoes.find(b => b.id === boeId) || null;
    setViewingBoe(boeToView);
  };

  const handleEditBoe = (boeId: string) => {
    const boeToEdit = savedBoes.find(b => b.id === boeId) || null;
    setEditingBoe(boeToEdit);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingBoe(null);
  };

  const handleDeleteBoe = (boeId: string) => {
    const boeToDelete = savedBoes.find(b => b.id === boeId) || null;
    setDeletingBoe(boeToDelete);
  };

  const handleConfirmDelete = async () => {
    if (!deletingBoe) return;
    notifications.loading('Deleting BOE...');
    try {
      await invoke('delete_boe_calculation', { id: deletingBoe.id });
      await fetchData();
      notifications.boe.deleted(deletingBoe.invoiceNumber);
      setDeletingBoe(null);
    } catch (error) {
      notifications.boe.error('delete', String(error));
    }
  };

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
          <div>
            <CardTitle>
              {editingBoe
                ? `Editing BOE - ${editingBoe.invoiceNumber}`
                : 'BOE Entry & Calculation'}
            </CardTitle>
            <CardDescription>
              {editingBoe
                ? 'Modify the details below and update the calculation.'
                : 'Select a shipment, link to a BOE, and enter details to calculate customs duties.'}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <BoeEntryForm
            shipments={shipments}
            allBoes={allBoes}
            savedBoes={savedBoes}
            onSaveOrUpdate={handleSaveOrUpdateBoe}
            initialData={editingBoe}
            onCancelEdit={handleCancelEdit}
            setEditingBoe={setEditingBoe}
          />
        </CardContent>
      </Card>

      <SavedBoeList
        savedBoes={savedBoes}
        onView={handleViewBoe}
        onEdit={handleEditBoe}
        onDelete={handleDeleteBoe}
      />

      {viewingBoe && (
        <ViewBoeDialog boe={viewingBoe} onClose={() => setViewingBoe(null)} />
      )}

      {deletingBoe && (
        <DeleteConfirmDialog
          boe={deletingBoe}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeletingBoe(null)}
        />
      )}

      <Toaster richColors />
    </div>
  );
}
