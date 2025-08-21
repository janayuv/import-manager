'use client'

import { invoke } from '@tauri-apps/api/core'

import * as React from 'react'

import { BoeSummaryClient } from '@/components/boe-summary/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { BoeDetails } from '@/types/boe'
import type { SavedBoe, Shipment } from '@/types/boe-entry'

export default function BoeSummaryPage() {
  const [savedBoes, setSavedBoes] = React.useState<SavedBoe[]>([])
  const [shipments, setShipments] = React.useState<Shipment[]>([])
  const [allBoes, setAllBoes] = React.useState<BoeDetails[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        const [shipmentsData, savedBoesData, allBoesData] = await Promise.all([
          invoke<Shipment[]>('get_shipments_for_boe_summary'),
          invoke<SavedBoe[]>('get_boe_calculations'),
          invoke<BoeDetails[]>('get_boes'),
        ])
        setShipments(shipmentsData)
        setSavedBoes(savedBoesData)
        setAllBoes(allBoesData)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

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
    )
  }

  return (
    <div className="space-y-8 p-4 md:p-8">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>BOE Reconciliation Report</CardTitle>
            <CardDescription>
              Select a supplier and invoice to view a detailed breakdown of duties and variance.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <BoeSummaryClient savedBoes={savedBoes} shipments={shipments} allBoes={allBoes} />
        </CardContent>
      </Card>
    </div>
  )
}
