'use client';

import { safeInvoke as invoke } from '@/lib/ipc-safe';
import { ArrowLeft } from 'lucide-react';

import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const BoeSummaryClient = React.lazy(() =>
  import('@/components/boe-summary/client').then(module => ({
    default: module.BoeSummaryClient,
  }))
);
import { AppBar, PageHeader } from '@/components/shared/im';
import type { BoeDetails } from '@/types/boe';
import type { SavedBoe, Shipment } from '@/types/boe-entry';

export function boeSummaryPath(savedBoeId: string) {
  return `/boe-summary/${encodeURIComponent(savedBoeId)}`;
}

export default function BoeSummaryPage() {
  const navigate = useNavigate();
  const { savedBoeId: savedBoeIdParam } = useParams<{ savedBoeId: string }>();

  const [savedBoes, setSavedBoes] = React.useState<SavedBoe[]>([]);
  const [shipments, setShipments] = React.useState<Shipment[]>([]);
  const [allBoes, setAllBoes] = React.useState<BoeDetails[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const decodedSavedBoeId = React.useMemo(() => {
    if (!savedBoeIdParam) return null;
    try {
      return decodeURIComponent(savedBoeIdParam);
    } catch {
      return savedBoeIdParam;
    }
  }, [savedBoeIdParam]);

  const urlBoeNotFound = React.useMemo(() => {
    if (!decodedSavedBoeId || isLoading) return false;
    return !savedBoes.some(b => b.id === decodedSavedBoeId);
  }, [decodedSavedBoeId, isLoading, savedBoes]);

  React.useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const [shipmentsData, savedBoesData, allBoesData] = await Promise.all([
          invoke<Shipment[]>('get_shipments_for_boe_summary'),
          invoke<SavedBoe[]>('get_boe_calculations'),
          invoke<BoeDetails[]>('get_boes'),
        ]);
        setShipments(shipmentsData);
        setSavedBoes(savedBoesData);
        setAllBoes(allBoesData);
      } catch (err) {
        console.error('BOE summary data load failed:', err);
        setShipments([]);
        setSavedBoes([]);
        setAllBoes([]);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  if (isLoading) {
    return (
      <div className="im-page">
        <AppBar crumbs={['Import Manager', 'BOE Summary']} />
        <PageHeader
          title="BOE Reconciliation Report"
          subtitle="Loading data..."
        />
        <div
          className="im-dashboard-body"
          style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
        >
          <div className="im-section">
            <div className="im-section__body">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div
                  style={{ height: 40, background: 'var(--color-im-rule)' }}
                />
                <div
                  style={{ height: 40, background: 'var(--color-im-rule)' }}
                />
              </div>
            </div>
          </div>
          <div className="im-section">
            <div className="im-section__body">
              <div
                style={{ height: 160, background: 'var(--color-im-rule)' }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (decodedSavedBoeId && urlBoeNotFound) {
    return (
      <div className="im-page">
        <AppBar crumbs={['Import Manager', 'BOE Summary']} />
        <div className="im-dashboard-body">
          <div className="border-im-rule bg-im-panel mx-auto flex w-full max-w-lg flex-col gap-4 border p-8">
            <h2 className="text-im-text text-lg font-semibold">
              Record not found
            </h2>
            <p style={{ color: 'var(--color-im-muted)', fontSize: 13 }}>
              No saved BOE calculation with ID{' '}
              <span
                style={{
                  color: 'var(--color-im-text)',
                  fontFamily: 'monospace',
                  fontSize: 11,
                }}
              >
                {decodedSavedBoeId}
              </span>
              .
            </p>
            <button
              type="button"
              className="im-btn im-btn--primary"
              style={{
                width: 'fit-content',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
              onClick={() => navigate('/boe-summary')}
            >
              <ArrowLeft style={{ width: 14, height: 14 }} aria-hidden />
              Back to BOE summary
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="im-page">
      <AppBar crumbs={['Import Manager', 'BOE Summary']} />
      <PageHeader
        title="BOE Reconciliation Report"
        subtitle="Select a supplier and invoice to view a detailed breakdown of duties and variance. Open a specific calculation from the URL or pick one below."
      />
      <div className="im-dashboard-body">
        <div className="im-section">
          <div className="im-section__body">
            <React.Suspense
              fallback={
                <div
                  style={{ height: 384, background: 'var(--color-im-rule)' }}
                />
              }
            >
              <BoeSummaryClient
                savedBoes={savedBoes}
                shipments={shipments}
                allBoes={allBoes}
                initialSavedBoeId={decodedSavedBoeId}
              />
            </React.Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
