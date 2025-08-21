// src/components/shipment/form.tsx
// Enhanced shipment form with better UX and responsive design
import { toast } from 'sonner'

import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CreatableCombobox } from '@/components/ui/combobox-creatable'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDateForDisplay, formatDateForInput } from '@/lib/date-format'
import type { Option } from '@/types/options'
import type { Shipment } from '@/types/shipment'

// Define a type for the dynamic options
type OptionType = 'category' | 'incoterm' | 'mode' | 'status' | 'type' | 'currency'

interface ShipmentFormProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  onSubmit: (shipment: Omit<Shipment, 'id'>) => void
  shipmentToEdit?: Shipment | null
  suppliers: Option[]
  categories: Option[]
  incoterms: Option[]
  modes: Option[]
  types: Option[]
  statuses: Option[]
  currencies: Option[]
  onOptionCreate: (type: OptionType, newOption: Option) => void
}

export function ShipmentForm({
  isOpen,
  onOpenChange,
  onSubmit,
  shipmentToEdit,
  suppliers,
  categories,
  incoterms,
  modes,
  types,
  statuses,
  currencies,
  onOptionCreate,
}: ShipmentFormProps) {
  const [formData, setFormData] = React.useState<Partial<Shipment>>(shipmentToEdit || {})
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (shipmentToEdit) {
      setFormData(shipmentToEdit)
    } else {
      setFormData({ status: 'docu-received' })
    }
  }, [shipmentToEdit, isOpen])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value, type } = e.target
    if (type === 'date') {
      setFormData((prev) => ({ ...prev, [id]: formatDateForDisplay(value) }))
    } else {
      setFormData((prev) => ({
        ...prev,
        [id]: type === 'number' ? parseFloat(value) || '' : value,
      }))
    }
  }

  const handleSelectChange = (id: keyof Shipment, value: string) => {
    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  const handleSubmit = async () => {
    const mandatoryFields: (keyof Shipment)[] = [
      'supplierId',
      'invoiceNumber',
      'invoiceDate',
      'goodsCategory',
      'invoiceValue',
      'invoiceCurrency',
      'incoterm',
    ]
    const missingFields = mandatoryFields.filter((field) => {
      return !formData[field]
    })

    if (missingFields.length > 0) {
      toast.error(`Please fill all mandatory fields: ${missingFields.join(', ')}`)
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmit(formData as Omit<Shipment, 'id'>)
      toast.success(
        shipmentToEdit ? 'Shipment updated successfully' : 'Shipment created successfully'
      )
      onOpenChange(false)
    } catch {
      toast.error('Failed to save shipment')
    } finally {
      setIsSubmitting(false)
    }
  }

  const calculateTransitDays = () => {
    if (formData.etd && formData.eta) {
      const etdParts = formData.etd.split('-')
      const etaParts = formData.eta.split('-')
      if (etdParts.length === 3 && etaParts.length === 3) {
        const etd = new Date(`${etdParts[2]}-${etdParts[1]}-${etdParts[0]}`)
        const eta = new Date(`${etaParts[2]}-${etaParts[1]}-${etaParts[0]}`)
        if (!isNaN(etd.getTime()) && !isNaN(eta.getTime())) {
          const diffTime = Math.abs(eta.getTime() - etd.getTime())
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
          return diffDays
        }
      }
    }
    return 'N/A'
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'delivered':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
      case 'in-transit':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
      case 'docu-received':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {shipmentToEdit ? 'Edit Shipment' : 'Add New Shipment'}
            {formData.status && (
              <Badge className={getStatusColor(formData.status)}>
                {formData.status.replace('-', ' ')}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Fill in all the details for the shipment. Fields marked with * are required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Commercial Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Commercial Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Supplier <span className="text-red-500">*</span>
                  </Label>
                  <CreatableCombobox
                    options={suppliers}
                    value={formData.supplierId || ''}
                    onChange={(v) => handleSelectChange('supplierId', v)}
                    onOptionCreate={() => {
                      /* Supplier creation might be a more complex flow */
                    }}
                    placeholder="Select Supplier"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Invoice # <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="invoiceNumber"
                    value={formData.invoiceNumber || ''}
                    onChange={handleChange}
                    placeholder="Enter invoice number"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Invoice Date <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="invoiceDate"
                    type="date"
                    value={formatDateForInput(formData.invoiceDate)}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Goods Category <span className="text-red-500">*</span>
                  </Label>
                  <CreatableCombobox
                    options={categories}
                    value={formData.goodsCategory || ''}
                    onChange={(v) => handleSelectChange('goodsCategory', v)}
                    onOptionCreate={(newOption) => onOptionCreate('category', newOption)}
                    placeholder="Select Category"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Invoice Value <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="invoiceValue"
                    type="number"
                    value={formData.invoiceValue || ''}
                    onChange={handleChange}
                    placeholder="0.00"
                    step="0.01"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Currency <span className="text-red-500">*</span>
                  </Label>
                  <CreatableCombobox
                    options={currencies}
                    value={formData.invoiceCurrency || ''}
                    onChange={(v) => handleSelectChange('invoiceCurrency', v)}
                    onOptionCreate={(newOption) => onOptionCreate('currency', newOption)}
                    placeholder="e.g., USD"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Incoterm <span className="text-red-500">*</span>
                  </Label>
                  <CreatableCombobox
                    options={incoterms}
                    value={formData.incoterm || ''}
                    onChange={(v) => handleSelectChange('incoterm', v)}
                    onOptionCreate={(newOption) => onOptionCreate('incoterm', newOption)}
                    placeholder="Select Incoterm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Logistics Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Logistics Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label>Mode</Label>
                  <CreatableCombobox
                    options={modes}
                    value={formData.shipmentMode || ''}
                    onChange={(v) => handleSelectChange('shipmentMode', v)}
                    onOptionCreate={(newOption) => onOptionCreate('mode', newOption)}
                    placeholder="Select Mode"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <CreatableCombobox
                    options={types}
                    value={formData.shipmentType || ''}
                    onChange={(v) => handleSelectChange('shipmentType', v)}
                    onOptionCreate={(newOption) => onOptionCreate('type', newOption)}
                    placeholder="e.g., FCL"
                  />
                </div>
                <div className="space-y-2">
                  <Label>BL/AWB #</Label>
                  <Input
                    id="blAwbNumber"
                    value={formData.blAwbNumber || ''}
                    onChange={handleChange}
                    placeholder="Enter BL/AWB number"
                  />
                </div>
                <div className="space-y-2">
                  <Label>BL/AWB Date</Label>
                  <Input
                    id="blAwbDate"
                    type="date"
                    value={formatDateForInput(formData.blAwbDate)}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Vessel/Flight</Label>
                  <Input
                    id="vesselName"
                    value={formData.vesselName || ''}
                    onChange={handleChange}
                    placeholder="Enter vessel/flight name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Container #</Label>
                  <Input
                    id="containerNumber"
                    value={formData.containerNumber || ''}
                    onChange={handleChange}
                    placeholder="Enter container number"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Gross Weight (Kg)</Label>
                  <Input
                    id="grossWeightKg"
                    type="number"
                    value={formData.grossWeightKg || ''}
                    onChange={handleChange}
                    placeholder="0.00"
                    step="0.01"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Dates & Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Dates & Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label>ETD</Label>
                  <Input
                    id="etd"
                    type="date"
                    value={formatDateForInput(formData.etd)}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label>ETA</Label>
                  <Input
                    id="eta"
                    type="date"
                    value={formatDateForInput(formData.eta)}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Transit Days</Label>
                  <Input value={calculateTransitDays()} readOnly className="bg-muted font-mono" />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <CreatableCombobox
                    options={statuses}
                    value={formData.status || ''}
                    onChange={(v) => handleSelectChange('status', v)}
                    onOptionCreate={(newOption) => onOptionCreate('status', newOption)}
                    placeholder="Select Status"
                  />
                </div>
                {formData.status === 'delivered' && (
                  <div className="space-y-2">
                    <Label>Date of Delivery</Label>
                    <Input
                      id="dateOfDelivery"
                      type="date"
                      value={formatDateForInput(formData.dateOfDelivery)}
                      onChange={handleChange}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-primary hover:bg-primary/90"
          >
            {isSubmitting ? 'Saving...' : shipmentToEdit ? 'Update Shipment' : 'Save Shipment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
