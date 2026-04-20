'use client';

import { invoke } from '@tauri-apps/api/core';
import { ArrowLeft } from 'lucide-react';

import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const BoeSummaryClient = React.lazy(() =>
  import('@/components/boe-summary/client').then(module => ({
    default: module.BoeSummaryClient,
  }))
);
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
      <div className="space-y-8 p-4 md:p-8">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-72" />
            <Skeleton className="mt-2 h-4 w-96" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (decodedSavedBoeId && urlBoeNotFound) {
    return (
      <div className="space-y-8 p-4 md:p-8">
        <div className="border-border bg-card mx-auto flex w-full max-w-lg flex-col gap-4 rounded-xl border p-8 shadow-sm">
          <h2 className="text-card-foreground text-lg font-semibold">
            Record not found
          </h2>
          <p className="text-muted-foreground text-sm">
            No saved BOE calculation with ID{' '}
            <span className="text-foreground font-mono">
              {decodedSavedBoeId}
            </span>
            .
          </p>
          <Button
            type="button"
            variant="default"
            useAccentColor
            onClick={() => navigate('/boe-summary')}
            className="w-fit gap-2"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to BOE summary
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-4 md:p-8">
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="text-xl font-semibold text-blue-600">
              BOE Reconciliation Report
            </CardTitle>
            <CardDescription>
              Select a supplier and invoice to view a detailed breakdown of
              duties and variance. Open a specific calculation from the URL or
              pick one below.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <React.Suspense fallback={<Skeleton className="h-96 w-full" />}>
            <BoeSummaryClient
              savedBoes={savedBoes}
              shipments={shipments}
              allBoes={allBoes}
              initialSavedBoeId={decodedSavedBoeId}
            />
          </React.Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
