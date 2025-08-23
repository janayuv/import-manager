import { invoke } from '@tauri-apps/api/core'
import { toast } from 'sonner'

import React, { useEffect, useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { formatNumber, formatText } from '@/lib/settings'
import { useSettings } from '@/lib/use-settings'
import type { Expense } from '@/types/expense'
import type { Shipment } from '@/types/shipment'

interface ShipmentSelectorProps {
  selectedShipment: Shipment | null
  setSelectedShipment: (shipment: Shipment | null) => void
}

interface ShipmentWithExpenseCount extends Shipment {
  expenseCount: number
  totalExpenseAmount: number
  isComplete: boolean
}

const ShipmentSelector: React.FC<ShipmentSelectorProps> = ({ selectedShipment, setSelectedShipment }) => {
  const { settings } = useSettings()
  const [shipments, setShipments] = useState<ShipmentWithExpenseCount[]>([])
  const [options, setOptions] = useState<ComboboxOption[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = React.useCallback(async () => {
    try {
      setLoading(true)
      const fetchedShipments: Shipment[] = await invoke('get_active_shipments')

      const shipmentsWithExpenses = await Promise.all(
        fetchedShipments.map(async (shipment) => {
          try {
            const expenses: Expense[] = await invoke('get_expenses_for_shipment', {
              shipmentId: shipment.id,
            })
            const totalAmount = expenses.reduce((sum, exp) => sum + exp.totalAmount, 0)
            const isComplete = expenses.length > 0
            return {
              ...shipment,
              expenseCount: expenses.length,
              totalExpenseAmount: totalAmount,
              isComplete,
            }
          } catch (error) {
            console.error(`Failed to fetch expenses for shipment ${shipment.id}:`, error)
            return { ...shipment, expenseCount: 0, totalExpenseAmount: 0, isComplete: false }
          }
        })
      )

      setShipments(shipmentsWithExpenses)
      setOptions(
        shipmentsWithExpenses.map((s) => ({
          value: s.id,
          label: `${formatText(s.invoiceNumber, settings.textFormat)} - ${formatText(s.blAwbNumber, settings.textFormat)} - ${safeDateLabel(s.invoiceDate)}`,
          metadata: {
            expenseCount: s.expenseCount,
            totalAmount: s.totalExpenseAmount,
            isComplete: s.isComplete,
          },
        }))
      )
    } catch (error) {
      console.error('Failed to fetch shipments:', error)
      toast.error('Failed to load shipments')
    } finally {
      setLoading(false)
    }
  }, [settings.textFormat])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleSelectionChange = (value: string) => {
    const shipment = shipments.find((s) => s.id === value) || null
    setSelectedShipment(shipment)
    if (shipment) {
      if (shipment.isComplete)
        toast.success(
          `Selected completed shipment: ${formatText(shipment.invoiceNumber, settings.textFormat)} (${shipment.expenseCount} expenses)`
        )
      else
        toast.info(`Selected shipment: ${formatText(shipment.invoiceNumber, settings.textFormat)} - ready for expenses`)
    }
  }

  // Helper function to get shipment with expense data
  const getSelectedShipmentWithExpenses = (): ShipmentWithExpenseCount | null => {
    if (!selectedShipment) return null
    return shipments.find((s) => s.id === selectedShipment.id) || null
  }

  const selectedShipmentWithExpenses = getSelectedShipmentWithExpenses()

  const freezeShipment = async (shipmentId: string) => {
    try {
      await invoke('freeze_shipment', { shipmentId, frozen: true })
      toast.success('Shipment frozen. It will be hidden from selection.')
      await refresh()
      if (selectedShipment?.id === shipmentId) setSelectedShipment(null)
    } catch (error) {
      console.error('Failed to freeze shipment:', error)
      toast.error('Failed to freeze shipment')
    }
  }

  const getStatusBadge = (shipment: ShipmentWithExpenseCount) => {
    if (shipment.isComplete) {
      return (
        <Badge
          variant="default"
          className="text-xs"
        >
          ✓ Complete ({shipment.expenseCount} expenses)
        </Badge>
      )
    }
    return (
      <Badge
        variant="secondary"
        className="text-xs"
      >
        Ready for Expenses
      </Badge>
    )
  }

  const getCompletionSuggestion = (shipment: ShipmentWithExpenseCount) => {
    if (shipment.expenseCount >= 0) {
      return (
        <div className="border-success/30 bg-success/10 mt-2 rounded-md border p-2">
          <p className="text-success mb-2 text-xs">
            {shipment.expenseCount > 0
              ? `✅ This shipment has ${shipment.expenseCount} expenses totaling ₹${shipment.totalExpenseAmount.toFixed(2)}`
              : 'No expenses yet for this shipment.'}
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs"
              >
                Freeze Shipment
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Freeze Shipment</AlertDialogTitle>
                <AlertDialogDescription>
                  Freezing will hide this shipment from the expense tracking list but won't delete the shipment or
                  expenses.
                  <br />
                  <br />
                  Are you sure you want to freeze it?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => freezeShipment(shipment.id)}
                  className="bg-success hover:bg-success/90"
                >
                  Freeze
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )
    }
    return null
  }

  const safeDateLabel = (dateString: string): string => {
    if (!dateString) return ''
    const iso = new Date(dateString)
    if (!isNaN(iso.getTime())) return iso.toLocaleDateString()
    const m = dateString.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/)
    if (m) {
      const d = Number(m[1])
      const mo = Number(m[2]) - 1
      const y = Number(m[3].length === 2 ? '20' + m[3] : m[3])
      const dt = new Date(y, mo, d)
      if (!isNaN(dt.getTime())) return dt.toLocaleDateString()
    }
    return dateString
  }

  if (loading) {
    return (
      <div className="max-w-md">
        <div className="flex items-center justify-center py-4">
          <div className="border-primary mr-2 h-4 w-4 animate-spin rounded-full border-b-2"></div>
          <span className="text-muted-foreground text-sm">Loading shipments...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md">
      <Combobox
        options={options}
        value={selectedShipment?.id || ''}
        onChange={handleSelectionChange}
        placeholder="Select a shipment..."
        searchPlaceholder="Search by invoice, BL/AWB..."
        emptyText="No shipments found."
        size="sm"
      />
      {selectedShipment && (
        <div className="bg-muted/50 mt-3 rounded-md border p-3">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium">Shipment Details</h4>
            <div className="flex items-center gap-2">
              {selectedShipmentWithExpenses && getStatusBadge(selectedShipmentWithExpenses)}
              {selectedShipment && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => freezeShipment(selectedShipment.id)}
                >
                  Freeze
                </Button>
              )}
            </div>
          </div>
          <div className="text-muted-foreground space-y-1 text-xs">
            <p>
              <strong>Invoice:</strong> {formatText(selectedShipment.invoiceNumber, settings.textFormat)}
            </p>
            <p>
              <strong>BL/AWB:</strong> {formatText(selectedShipment.blAwbNumber, settings.textFormat)}
            </p>
            <p>
              <strong>Date:</strong> {safeDateLabel(selectedShipment.invoiceDate)}
            </p>
            {selectedShipmentWithExpenses && selectedShipmentWithExpenses.expenseCount > 0 && (
              <p>
                <strong>Expenses:</strong> {selectedShipmentWithExpenses.expenseCount} (₹
                {formatNumber(selectedShipmentWithExpenses.totalExpenseAmount, settings.numberFormat, {
                  numberFormat: 'currency',
                  precision: 2,
                  showSign: false,
                })}
                )
              </p>
            )}
          </div>
          {selectedShipmentWithExpenses && getCompletionSuggestion(selectedShipmentWithExpenses)}
        </div>
      )}
    </div>
  )
}

export default ShipmentSelector
