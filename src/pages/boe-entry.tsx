'use client';

import { safeInvoke as invoke } from '@/lib/ipc-safe';
import { useUnifiedNotifications } from '@/hooks/useUnifiedNotifications';

import * as React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { DeleteConfirmDialog } from '@/components/boe-entry/delete-confirm-dialog';
import { BoeEntryForm } from '@/components/boe-entry/form';
import { SavedBoeList } from '@/components/boe-entry/saved-boe-list';
import { ViewBoeDialog } from '@/components/boe-entry/view-boe-dialog';
import {
  AppBar,
  BreadcrumbBar,
  IdentityHeader,
  ImSection,
  ImStatusPill,
  PageHeader,
  StatusBar,
  ViewField,
} from '@/components/shared/im';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { BoeDetails } from '@/types/boe';
import type { BoeStatus, SavedBoe, Shipment } from '@/types/boe-entry';

type StatusPillVariant =
  | 'active'
  | 'inactive'
  | 'warning'
  | 'info'
  | 'neutral'
  | 'accent';

function boeStatusPillVariant(status: BoeStatus): StatusPillVariant {
  switch (status) {
    case 'Reconciled':
    case 'Closed':
      return 'active';
    case 'Discrepancy Found':
    case 'Investigation':
      return 'warning';
    case 'Awaiting BOE Data':
      return 'info';
    default:
      return 'neutral';
  }
}

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
  const [savedBoePage, setSavedBoePage] = React.useState(1);
  const [savedBoeTotal, setSavedBoeTotal] = React.useState(0);
  const pageSize = 50;

  type PaginatedResult<T> = { data: T[]; totalCount: number };

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

  const savedBoeTotalPages = Math.max(1, Math.ceil(savedBoeTotal / pageSize));

  const closeEntryPanel = React.useCallback(() => {
    navigate('/boe-entry');
  }, [navigate]);

  const fetchData = React.useCallback(async () => {
    try {
      const [shipmentsData, savedBoesData, allBoesRows] = await Promise.all([
        invoke<PaginatedResult<Shipment>>(
          'get_shipments_for_boe_entry_paginated',
          {
            page: 1,
            pageSize: 100,
          }
        ),
        invoke<PaginatedResult<SavedBoe>>('get_boe_calculations_paginated', {
          page: savedBoePage,
          pageSize,
        }),
        invoke<BoeDetails[]>('get_boes'),
      ]);
      const safeShipments = Array.isArray(shipmentsData?.data)
        ? shipmentsData.data
        : [];
      const safeSavedBoes = Array.isArray(savedBoesData?.data)
        ? savedBoesData.data
        : [];
      const safeAllBoes = Array.isArray(allBoesRows) ? allBoesRows : [];
      const safeSavedBoeTotal = Number.isFinite(savedBoesData?.totalCount)
        ? savedBoesData.totalCount
        : safeSavedBoes.length;
      setShipments(safeShipments);
      setSavedBoes(safeSavedBoes);
      setSavedBoeTotal(safeSavedBoeTotal);
      setAllBoes(safeAllBoes);
    } catch (error) {
      notifications.boe.error('load data', String(error));
    }
  }, [notifications.boe, savedBoePage]);

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
    const panelCrumb =
      entryPanel === 'add' ? 'New' : entryPanel === 'view' ? 'View' : 'Edit';
    const panelContext =
      entryPanel === 'view' ? 'VIEW' : entryPanel === 'edit' ? 'EDIT' : 'NEW';

    return (
      <div className="im-page">
        <AppBar crumbs={['Import Manager', 'BOE Entry', panelCrumb]} />
        <div className="flex min-h-0 flex-1 flex-col px-3 py-3 md:px-5 md:py-4">
          <BreadcrumbBar
            backLabel="BOE entry"
            current={panelCrumb}
            context={panelContext}
            onBack={closeEntryPanel}
          />

          <div className="mx-auto mt-3 flex min-h-0 w-full max-w-[min(calc(100vw-1.5rem),120rem)] flex-1 flex-col">
            {isLoading ? (
              <div
                className="border-im-rule bg-im-panel text-im-muted flex min-h-[220px] flex-1 items-center justify-center border font-mono text-xs tracking-wide"
                role="status"
                aria-live="polite"
              >
                LOADING…
              </div>
            ) : entryPanel === 'add' ? (
              <>
                <div className="im-page-title-block mb-3 shrink-0">
                  <h1>NEW BOE CALCULATION</h1>
                  <p>
                    Select a shipment, link to a BOE, and enter details to
                    calculate customs duties.
                  </p>
                </div>
                <ImSection
                  label="RECORD CONTEXT"
                  sub="Snapshot fields — live inputs follow in the form below."
                >
                  <div className="im-grid im-grid__4">
                    <ViewField label="SUPPLIER" />
                    <ViewField label="INVOICE" />
                    <ViewField label="LINKED BOE" />
                    <ViewField label="STATUS" />
                  </div>
                </ImSection>
                <div className="border-im-rule bg-im-panel mt-3 flex min-h-0 flex-1 flex-col border">
                  <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 md:px-4 md:py-3">
                    <BoeEntryForm
                      shipments={shipments}
                      allBoes={allBoes}
                      savedBoes={savedBoes}
                      onSaveOrUpdate={handleSaveOrUpdateBoe}
                      initialData={null}
                      onCancelEdit={handleCancelEdit}
                    />
                  </div>
                </div>
              </>
            ) : !selectedSavedBoeFromUrl ? (
              <div className="border-im-rule bg-im-panel mx-auto flex w-full max-w-lg flex-col gap-3 border p-6">
                <h2 className="text-im-text text-sm font-semibold tracking-wide">
                  RECORD NOT FOUND
                </h2>
                <p className="text-im-muted text-xs leading-relaxed">
                  No saved BOE calculation with ID{' '}
                  <span className="text-im-text font-mono text-[11px]">
                    {decodedSavedBoeId ?? savedBoeIdParam}
                  </span>
                  .
                </p>
                <Button
                  type="button"
                  variant="default"
                  useAccentColor
                  onClick={closeEntryPanel}
                  className="im-hdr-btn w-fit"
                >
                  Back to BOE entry
                </Button>
              </div>
            ) : entryPanel === 'view' ? (
              <>
                <IdentityHeader
                  name={selectedSavedBoeFromUrl.invoiceNumber}
                  sub={`${selectedSavedBoeFromUrl.supplierName} · Read-only saved calculation.`}
                  id={selectedSavedBoeFromUrl.id}
                  tags={
                    <ImStatusPill
                      label={selectedSavedBoeFromUrl.status}
                      variant={boeStatusPillVariant(
                        selectedSavedBoeFromUrl.status
                      )}
                    />
                  }
                />
                <ImSection
                  label="RECORD CONTEXT"
                  sub="Key fields from the saved run."
                >
                  <div className="im-grid im-grid__4">
                    <ViewField
                      label="SUPPLIER"
                      value={selectedSavedBoeFromUrl.supplierName}
                    />
                    <ViewField
                      label="INVOICE"
                      value={selectedSavedBoeFromUrl.invoiceNumber}
                      mono
                    />
                    <ViewField
                      label="LINKED BOE"
                      value={
                        selectedSavedBoeFromUrl.boeId
                          ? (allBoes.find(
                              be => be.id === selectedSavedBoeFromUrl.boeId
                            )?.beNumber ?? selectedSavedBoeFromUrl.boeId)
                          : undefined
                      }
                      mono
                    />
                    <ViewField
                      label="EXCHANGE RATE"
                      value={
                        selectedSavedBoeFromUrl.formValues.exchangeRate ??
                        undefined
                      }
                      mono
                    />
                  </div>
                </ImSection>
                <div className="border-im-rule bg-im-panel mt-3 flex min-h-0 flex-1 flex-col border">
                  <ViewBoeDialog
                    boe={selectedSavedBoeFromUrl}
                    allBoes={allBoes}
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
              </>
            ) : (
              <>
                <IdentityHeader
                  name={selectedSavedBoeFromUrl.invoiceNumber}
                  sub={`${selectedSavedBoeFromUrl.supplierName} · Adjust inputs and recalculate duties.`}
                  id={selectedSavedBoeFromUrl.id}
                  tags={
                    <ImStatusPill
                      label={selectedSavedBoeFromUrl.status}
                      variant={boeStatusPillVariant(
                        selectedSavedBoeFromUrl.status
                      )}
                    />
                  }
                />
                <ImSection
                  label="RECORD CONTEXT"
                  sub="Key fields from the saved run — edit in the form below."
                >
                  <div className="im-grid im-grid__4">
                    <ViewField
                      label="SUPPLIER"
                      value={selectedSavedBoeFromUrl.supplierName}
                    />
                    <ViewField
                      label="INVOICE"
                      value={selectedSavedBoeFromUrl.invoiceNumber}
                      mono
                    />
                    <ViewField
                      label="LINKED BOE"
                      value={
                        selectedSavedBoeFromUrl.boeId
                          ? (allBoes.find(
                              be => be.id === selectedSavedBoeFromUrl.boeId
                            )?.beNumber ?? selectedSavedBoeFromUrl.boeId)
                          : undefined
                      }
                      mono
                    />
                    <ViewField
                      label="EXCHANGE RATE"
                      value={
                        selectedSavedBoeFromUrl.formValues.exchangeRate ??
                        undefined
                      }
                      mono
                    />
                  </div>
                </ImSection>
                <div className="border-im-rule bg-im-panel mt-3 flex min-h-0 flex-1 flex-col border">
                  <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 md:px-4 md:py-3">
                    <BoeEntryForm
                      shipments={shipments}
                      allBoes={allBoes}
                      savedBoes={savedBoes}
                      onSaveOrUpdate={handleSaveOrUpdateBoe}
                      initialData={selectedSavedBoeFromUrl}
                      onCancelEdit={handleCancelEdit}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        {deleteDialog}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="im-page">
        <AppBar crumbs={['Import Manager', 'BOE Entry']} />
        <PageHeader
          title="BOE ENTRY & CALCULATION"
          subtitle="Loading workspace…"
        />
        <div className="im-dashboard-body flex flex-col gap-3">
          <div className="im-section">
            <div className="im-section__header">
              <Skeleton className="bg-im-rule h-3 w-40" />
              <Skeleton className="bg-im-rule mt-2 h-3 w-64" />
            </div>
            <div className="im-section__body space-y-3">
              <div className="im-grid im-grid__3">
                <Skeleton className="bg-im-rule h-9 w-full" />
                <Skeleton className="bg-im-rule h-9 w-full" />
                <Skeleton className="bg-im-rule h-9 w-full" />
              </div>
              <div className="im-grid im-grid__4">
                <Skeleton className="bg-im-rule h-9 w-full" />
                <Skeleton className="bg-im-rule h-9 w-full" />
                <Skeleton className="bg-im-rule h-9 w-full" />
                <Skeleton className="bg-im-rule h-9 w-full" />
              </div>
            </div>
          </div>
          <div className="im-section">
            <div className="im-section__header">
              <Skeleton className="bg-im-rule h-3 w-48" />
              <Skeleton className="bg-im-rule mt-2 h-3 w-56" />
            </div>
            <div className="im-section__body space-y-2">
              <Skeleton className="bg-im-rule h-10 w-full" />
              <Skeleton className="bg-im-rule h-10 w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="im-page">
      <AppBar crumbs={['Import Manager', 'BOE Entry']} />
      <PageHeader
        title="BOE ENTRY & CALCULATION"
        count={savedBoeTotal}
        subtitle="Select a shipment, link to a BOE, and enter details to calculate customs duties."
        actions={
          <button
            type="button"
            className="im-hdr-btn im-hdr-btn--primary"
            onClick={() => navigate(boeEntryNewPath)}
          >
            Open full-page new calculation
          </button>
        }
      />

      <div className="im-dashboard-body flex flex-col gap-3 pb-2">
        <div className="border-im-rule bg-im-panel border">
          <BoeEntryForm
            shipments={shipments}
            allBoes={allBoes}
            savedBoes={savedBoes}
            onSaveOrUpdate={handleSaveOrUpdateBoe}
            initialData={null}
            onCancelEdit={handleCancelEdit}
          />
        </div>

        <SavedBoeList
          savedBoes={savedBoes}
          allBoes={allBoes}
          onView={handleViewBoe}
          onEdit={handleEditBoe}
          onDelete={handleDeleteBoe}
        />
      </div>

      <StatusBar
        total={savedBoeTotal}
        selected={0}
        page={savedBoePage}
        pages={savedBoeTotalPages}
        onPrev={() => setSavedBoePage(prev => Math.max(1, prev - 1))}
        onNext={() => setSavedBoePage(prev => prev + 1)}
        canPrev={savedBoePage > 1}
        canNext={savedBoePage * pageSize < savedBoeTotal}
        extra={
          <>
            <span className="im-status-bar__sep">·</span>
            <span>
              Showing {(savedBoePage - 1) * pageSize + 1}-
              {Math.min(savedBoePage * pageSize, savedBoeTotal)} loaded
            </span>
          </>
        }
      />

      {deleteDialog}
    </div>
  );
}
