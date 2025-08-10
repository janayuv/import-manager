// src/components/boe-entry/form.tsx (MODIFIED)
'use client'

import Papa, { type ParseResult } from 'papaparse'
import { toast } from 'sonner'
import * as z from 'zod'

import * as React from 'react'
import { type Resolver, useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { calculateDuties } from '@/lib/duty-calculator'
import type { BoeDetails } from '@/types/boe'
import type {
  BoeItemInput,
  CalculationMethod,
  CalculationResult,
  SavedBoe,
  Shipment,
} from '@/types/boe-entry'
import { zodResolver } from '@hookform/resolvers/zod'

import { BoeDetailsTable } from './boe-details-table'
import { CalculationResults } from './calculation-results'
import { ItemsTable } from './items-table'

// src/components/boe-entry/form.tsx (MODIFIED)

// src/components/boe-entry/form.tsx (MODIFIED)

// src/components/boe-entry/form.tsx (MODIFIED)

const formSchema = z.object({
  supplierName: z.string().min(1, { message: 'Please select a supplier.' }),
  shipmentId: z.string().min(1, { message: 'Please select an invoice.' }),
  exchangeRate: z.coerce.number().min(0, { message: 'Invalid rate.' }),
  freightCost: z.coerce.number().min(0),
  exwCost: z.coerce.number().min(0),
  insuranceRate: z.coerce.number().min(0),
  interest: z.coerce.number().min(0).optional(),
})
type FormValues = z.infer<typeof formSchema>

interface BoeEntryFormProps {
  shipments: Shipment[]
  allBoes: BoeDetails[]
  savedBoes: SavedBoe[]
  onSaveOrUpdate: (boeData: SavedBoe) => void
  initialData: SavedBoe | null
  onCancelEdit: () => void
  setEditingBoe: (boe: SavedBoe | null) => void
}

interface RawOverrideRow {
  partNo: string
  calculationMethod: string
  boeBcdRate: string
  boeSwsRate: string
  boeIgstRate: string
}

export function BoeEntryForm({
  shipments,
  allBoes,
  savedBoes,
  onSaveOrUpdate,
  initialData,
  onCancelEdit,
  setEditingBoe,
}: BoeEntryFormProps) {
  const [suppliers, setSuppliers] = React.useState<string[]>([])
  const [availableInvoices, setAvailableInvoices] = React.useState<Shipment[]>([])
  const [selectedShipment, setSelectedShipment] = React.useState<Shipment | null>(null)
  const [itemInputs, setItemInputs] = React.useState<BoeItemInput[]>([])
  const [calculationResult, setCalculationResult] = React.useState<CalculationResult | null>(null)
  const [lastValidFormValues, setLastValidFormValues] = React.useState<FormValues | null>(null)
  const [overrideFile, setOverrideFile] = React.useState<File | null>(null)

  const [selectedBoeId, setSelectedBoeId] = React.useState<string>('')
  const [selectedBoeDetails, setSelectedBoeDetails] = React.useState<BoeDetails | null>(null)
  const [isCif, setIsCif] = React.useState(false)

  const isEditing = Boolean(initialData)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues, any>,
    defaultValues: {
      supplierName: '',
      shipmentId: '',
      exchangeRate: 0,
      freightCost: 0,
      exwCost: 0,
      insuranceRate: 0.015,
      interest: 0,
    },
    mode: 'onChange',
  })

  React.useEffect(() => {
    if (selectedShipment) {
      const isCifShipment = selectedShipment.incoterm === 'CIF'
      setIsCif(isCifShipment)

      if (isCifShipment) {
        form.setValue('freightCost', 0)
        form.setValue('exwCost', 0)
        form.setValue('insuranceRate', 0)
      }
    } else {
      setIsCif(false)
    }
  }, [selectedShipment, form])

  const boeOptions = React.useMemo(() => {
    const usedBoeIds = new Set(
      savedBoes.map((savedBoe) => savedBoe.boeId).filter((id): id is string => !!id)
    )

    return allBoes
      .filter((boe) => {
        const isUnused = !usedBoeIds.has(boe.id)
        const isCurrentlyEditing = initialData?.boeId === boe.id
        return isUnused || isCurrentlyEditing
      })
      .map((boe) => ({ value: boe.id, label: boe.beNumber }))
  }, [allBoes, savedBoes, initialData])

  React.useEffect(() => {
    setSuppliers([...new Set(shipments.map((s) => s.supplierName))])
  }, [shipments])

  React.useEffect(() => {
    if (initialData) {
      form.reset(initialData.formValues)
      const invs = shipments.filter((s) => s.supplierName === initialData.formValues.supplierName)
      setAvailableInvoices(invs)
      setSelectedShipment(shipments.find((s) => s.id === initialData.shipmentId) || null)
      setItemInputs(initialData.itemInputs)
      setCalculationResult(initialData.calculationResult)
      if (initialData.boeId) {
        const boeDetails = allBoes.find((b) => b.id === initialData.boeId) || null
        setSelectedBoeId(initialData.boeId)
        setSelectedBoeDetails(boeDetails)
      }
    } else {
      form.reset({
        supplierName: '',
        shipmentId: '',
        exchangeRate: 0,
        freightCost: 0,
        exwCost: 0,
        insuranceRate: 0.015,
        interest: 0,
      })
      setAvailableInvoices([])
      setSelectedShipment(null)
      setItemInputs([])
      setCalculationResult(null)
      setSelectedBoeId('')
      setSelectedBoeDetails(null)
    }
  }, [initialData, shipments, allBoes, form])

  const handleSupplierChange = (supplierName: string) => {
    form.setValue('supplierName', supplierName, { shouldValidate: true })
    const invs = shipments.filter((s) => s.supplierName === supplierName)
    setAvailableInvoices(invs)
    form.resetField('shipmentId')
    setSelectedShipment(null)
    setItemInputs([])
    setCalculationResult(null)
  }

  const handleInvoiceChange = (shipmentId: string) => {
    form.setValue('shipmentId', shipmentId, { shouldValidate: true })
    const shipment = shipments.find((s) => s.id === shipmentId) || null
    setSelectedShipment(shipment)
    setCalculationResult(null)

    if (shipment) {
      setItemInputs(
        shipment.items.map((item) => ({
          partNo: item.partNo,
          calculationMethod: 'Standard',
          boeBcdRate: item.actualBcdRate,
          boeSwsRate: item.actualSwsRate,
          boeIgstRate: item.actualIgstRate,
        }))
      )
    }
  }

  const handleBoeSelect = (boeId: string) => {
    setSelectedBoeId(boeId)
    const details = allBoes.find((b) => b.id === boeId) || null
    setSelectedBoeDetails(details)
  }

  const parseOverrideFile = (file: File): Promise<BoeItemInput[]> =>
    new Promise((resolve, reject) => {
      Papa.parse<RawOverrideRow>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results: ParseResult<RawOverrideRow>) => {
          const required = [
            'partNo',
            'calculationMethod',
            'boeBcdRate',
            'boeSwsRate',
            'boeIgstRate',
          ]
          const actual = results.meta.fields ?? []
          if (!required.every((h) => actual.includes(h))) {
            return reject(new Error('CSV file is missing required headers.'))
          }
          try {
            const data: BoeItemInput[] = results.data.map((row) => ({
              partNo: row.partNo,
              calculationMethod: row.calculationMethod as CalculationMethod,
              boeBcdRate: parseFloat(row.boeBcdRate),
              boeSwsRate: parseFloat(row.boeSwsRate),
              boeIgstRate: parseFloat(row.boeIgstRate),
            }))
            resolve(data)
          } catch {
            reject(new Error('Failed to transform CSV rows into BoeItemInput'))
          }
        },
        error: (err: Error) => reject(err),
      })
    })

  async function onSubmit(values: FormValues) {
    if (!selectedShipment) {
      toast.error('Please select a shipment before calculating.')
      return
    }

    let finalInputs = itemInputs

    if (overrideFile) {
      try {
        const overrides = await parseOverrideFile(overrideFile)
        const originalItems = selectedShipment.items.map((item) => ({
          partNo: item.partNo,
          calculationMethod: 'Standard' as const,
          boeBcdRate: item.actualBcdRate,
          boeSwsRate: item.actualSwsRate,
          boeIgstRate: item.actualIgstRate,
        }))
        const originalIgstMap = new Map<string, number>(
          originalItems.map((o) => [o.partNo, o.boeIgstRate])
        )
        const unmatched = overrides.filter((o) => !originalIgstMap.has(o.partNo))
        const candidates = overrides.filter((o) => originalIgstMap.has(o.partNo))
        const igstMismatches = candidates.filter(
          (o) => o.boeIgstRate !== originalIgstMap.get(o.partNo)
        )
        const validOverrides = candidates.filter(
          (o) => o.boeIgstRate === originalIgstMap.get(o.partNo)
        )
        if (unmatched.length) {
          toast.warning(
            `Ignored override for unknown parts: ${unmatched.map((o) => o.partNo).join(', ')}`
          )
        }
        if (igstMismatches.length) {
          toast.warning(
            `Ignored override for IGST mismatch on parts: ${igstMismatches
              .map((o) => o.partNo)
              .join(', ')} (must match invoice IGST)`
          )
        }
        finalInputs = originalItems.map((orig) => {
          const override = validOverrides.find((o) => o.partNo === orig.partNo)
          return override ?? orig
        })
        setItemInputs(finalInputs)
      } catch (err) {
        toast.error('Import Failed', { description: (err as Error).message })
        return
      }
    }

    setLastValidFormValues(values)
    const results = calculateDuties({
      shipment: selectedShipment,
      formValues: values,
      itemInputs: finalInputs,
    })
    setCalculationResult(results)

    if (overrideFile) {
      setEditingBoe({
        id: `DRAFT-${Date.now()}`,
        shipmentId: selectedShipment.id,
        boeId: selectedBoeId, // <-- FIX: Add boeId to the top level
        invoiceNumber: selectedShipment.invoiceNumber,
        supplierName: selectedShipment.supplierName,
        status: 'Awaiting BOE Data',
        formValues: values, // <-- FIX: No longer pass boeId inside here
        itemInputs: finalInputs,
        calculationResult: results,
        attachments: [],
      })
      toast.info('Import Successful', {
        description: `Verify imported details and click "Update BOE" to save.`,
      })
    }
  }

  const handleSaveOrUpdate = () => {
    if (!calculationResult || !selectedShipment || !lastValidFormValues) {
      toast.error('Cannot save', { description: 'Please calculate duties first.' })
      return
    }

    if (selectedBoeDetails && typeof selectedBoeDetails.dutyPaid === 'number') {
      const dutyPaid = Math.round(selectedBoeDetails.dutyPaid * 100) / 100
      const totalPayable = Math.round(calculationResult.customsDutyTotal * 100) / 100

      if (dutyPaid !== totalPayable) {
        toast.error('Validation Failed', {
          description: `Duty Paid (${dutyPaid.toFixed(2)}) from the selected BOE does not match the calculated Total Duty Payable (${totalPayable.toFixed(2)}).`,
        })
        return
      }
    }

    onSaveOrUpdate({
      id: initialData?.id || `BOE-${Date.now()}`,
      shipmentId: selectedShipment.id,
      boeId: selectedBoeId,
      invoiceNumber: selectedShipment.invoiceNumber,
      supplierName: selectedShipment.supplierName,
      status: initialData?.status ?? 'Awaiting BOE Data',
      formValues: lastValidFormValues,
      itemInputs,
      calculationResult,
      attachments: initialData?.attachments ?? [],
    })
    if (!isEditing) {
      form.reset()
      setSelectedShipment(null)
      setItemInputs([])
      setCalculationResult(null)
      setAvailableInvoices([])
      setLastValidFormValues(null)
      setOverrideFile(null)
      setSelectedBoeId('')
      setSelectedBoeDetails(null)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2 lg:grid-cols-3">
          <FormField
            name="supplierName"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Supplier</FormLabel>
                <Select onValueChange={handleSupplierChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a supplier" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            name="shipmentId"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Invoice / Shipment</FormLabel>
                <Select
                  onValueChange={handleInvoiceChange}
                  value={field.value}
                  disabled={!availableInvoices.length && !isEditing}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an invoice" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {availableInvoices.map((inv) => (
                      <SelectItem key={inv.id} value={inv.id}>
                        {inv.invoiceNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormItem>
            <FormLabel>BOE No (Optional)</FormLabel>
            <Combobox
              options={boeOptions}
              value={selectedBoeId}
              onChange={handleBoeSelect}
              placeholder="Select a BOE..."
              searchPlaceholder="Search BOE No..."
              emptyText="No BOE found."
            />
          </FormItem>
        </div>

        {selectedBoeDetails && <BoeDetailsTable boe={selectedBoeDetails} />}

        <div className="mt-8 grid grid-cols-1 items-end gap-6 md:grid-cols-3 lg:grid-cols-6">
          <FormField
            name="exchangeRate"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Exchange Rate</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.001"
                    placeholder="e.g., 83.50"
                    {...field}
                    value={field.value ?? ''}
                    onChange={(e) =>
                      field.onChange(e.target.value === '' ? undefined : e.target.value)
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            name="freightCost"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Freight Cost</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="e.g., 5000"
                    {...field}
                    value={field.value ?? ''}
                    onChange={(e) =>
                      field.onChange(e.target.value === '' ? undefined : e.target.value)
                    }
                    disabled={isCif}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            name="exwCost"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>EXW Cost</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="e.g., 200"
                    {...field}
                    value={field.value ?? ''}
                    onChange={(e) =>
                      field.onChange(e.target.value === '' ? undefined : e.target.value)
                    }
                    disabled={isCif}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            name="insuranceRate"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Insurance %</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.001"
                    placeholder="e.g., 1.125"
                    {...field}
                    value={field.value ?? ''}
                    onChange={(e) =>
                      field.onChange(e.target.value === '' ? undefined : e.target.value)
                    }
                    disabled={isCif}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            name="interest"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Interest</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="e.g., 100"
                    {...field}
                    value={field.value ?? ''}
                    onChange={(e) =>
                      field.onChange(e.target.value === '' ? undefined : e.target.value)
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="md:col-span-2 lg:col-span-1">
            <Label htmlFor="override-file">Duty Override File (Optional)</Label>
            <Input
              id="override-file"
              type="file"
              accept=".csv"
              onChange={(e) => setOverrideFile(e.target.files?.[0] || null)}
            />
          </div>
        </div>

        {selectedShipment && (
          <div className="mt-8">
            <h3 className="mb-4 text-lg font-medium">Invoice Items</h3>
            <ItemsTable
              items={selectedShipment.items}
              itemInputs={itemInputs}
              setItemInputs={setItemInputs}
            />
          </div>
        )}

        <div className="flex justify-end space-x-4">
          <Button
            type="submit"
            disabled={!form.formState.isValid}
            className="custom-alert-action-orange"
          >
            {overrideFile ? 'Import & Calculate' : 'Calculate Duties'}
          </Button>
          {calculationResult && (
            <Button type="button" onClick={handleSaveOrUpdate} className="custom-alert-action-ok">
              {isEditing ? 'Update BOE' : 'Save BOE'}
            </Button>
          )}
          {isEditing && (
            <Button type="button" variant="ghost" onClick={onCancelEdit}>
              Cancel Edit
            </Button>
          )}
        </div>
      </form>

      {calculationResult && <CalculationResults results={calculationResult} />}
    </Form>
  )
}
