import { invoke } from '@tauri-apps/api/core'
import { toast } from 'sonner'

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Shipment } from '@/types/shipment'

const FrozenShipmentsPage = () => {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    try {
      setLoading(true)
      const all: Shipment[] = await invoke('get_shipments')
      setShipments(all.filter((s) => s.isFrozen))
    } catch (e) {
      console.error(e)
      toast.error('Failed to load frozen shipments')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const handleUnfreeze = async (id: string) => {
    try {
      await invoke('freeze_shipment', { shipmentId: id, frozen: false })
      toast.success('Shipment unfrozen')
      await refresh()
    } catch (e) {
      console.error(e)
      toast.error('Failed to unfreeze')
    }
  }

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Frozen Shipments</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div>Loading...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shipments.length ? (
                  shipments.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.invoiceNumber}</TableCell>
                      <TableCell>{s.status}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          onClick={() => handleUnfreeze(s.id)}
                        >
                          Unfreeze
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center"
                    >
                      No frozen shipments
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default FrozenShipmentsPage
