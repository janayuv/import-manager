/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/import-dialog.tsx (MODIFIED)    |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| This file has been corrected to fix the persistent `react-hook-form` type    |
| errors by letting the `useForm` hook infer its type from the Zod resolver.   |
| Also added the missing `key` prop to the `<SelectItem>` components.          |
================================================================================
*/
'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

import * as React from 'react'

import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { formatText } from '@/lib/settings'
import { useSettings } from '@/lib/use-settings'
import type { Shipment } from '@/types/boe-entry'

/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/import-dialog.tsx (MODIFIED)    |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| This file has been corrected to fix the persistent `react-hook-form` type    |
| errors by letting the `useForm` hook infer its type from the Zod resolver.   |
| Also added the missing `key` prop to the `<SelectItem>` components.          |
================================================================================
*/

/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/import-dialog.tsx (MODIFIED)    |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| This file has been corrected to fix the persistent `react-hook-form` type    |
| errors by letting the `useForm` hook infer its type from the Zod resolver.   |
| Also added the missing `key` prop to the `<SelectItem>` components.          |
================================================================================
*/

/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/import-dialog.tsx (MODIFIED)    |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| This file has been corrected to fix the persistent `react-hook-form` type    |
| errors by letting the `useForm` hook infer its type from the Zod resolver.   |
| Also added the missing `key` prop to the `<SelectItem>` components.          |
================================================================================
*/

/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/import-dialog.tsx (MODIFIED)    |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| This file has been corrected to fix the persistent `react-hook-form` type    |
| errors by letting the `useForm` hook infer its type from the Zod resolver.   |
| Also added the missing `key` prop to the `<SelectItem>` components.          |
================================================================================
*/

/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/import-dialog.tsx (MODIFIED)    |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| This file has been corrected to fix the persistent `react-hook-form` type    |
| errors by letting the `useForm` hook infer its type from the Zod resolver.   |
| Also added the missing `key` prop to the `<SelectItem>` components.          |
================================================================================
*/

/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/import-dialog.tsx (MODIFIED)    |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| This file has been corrected to fix the persistent `react-hook-form` type    |
| errors by letting the `useForm` hook infer its type from the Zod resolver.   |
| Also added the missing `key` prop to the `<SelectItem>` components.          |
================================================================================
*/

const importFormSchema = z.object({
  supplierName: z.string().min(1),
  shipmentId: z.string().min(1),
  exchangeRate: z.coerce.number().min(0),
  freightCost: z.coerce.number().min(0),
  exwCost: z.coerce.number().min(0),
  insuranceRate: z.coerce.number().min(0),
  interest: z.coerce.number().min(0).optional(),
})

type ImportFormValues = z.infer<typeof importFormSchema>

export interface ImportFormData {
  formValues: ImportFormValues
  overrideFile: File
}

interface ImportDialogProps {
  shipments: Shipment[]
  onClose: () => void
  onImport: (importData: ImportFormData) => void
}

export function ImportDialog({ shipments, onClose, onImport }: ImportDialogProps) {
  const { settings } = useSettings()
  const [suppliers, setSuppliers] = React.useState<string[]>([])
  const [availableInvoices, setAvailableInvoices] = React.useState<Shipment[]>([])
  const [overrideFile, setOverrideFile] = React.useState<File | null>(null)

  React.useEffect(() => {
    const uniqueSuppliers = [
      ...new Set(shipments.map((s) => formatText(s.supplierName, settings.textFormat))),
    ]
    setSuppliers(uniqueSuppliers)
  }, [shipments, settings.textFormat])

  const form = useForm({
    resolver: zodResolver(importFormSchema),
    defaultValues: {
      supplierName: '',
      shipmentId: '',
      exchangeRate: 83.55,
      freightCost: 0,
      exwCost: 0,
      insuranceRate: 1.125,
      interest: 0,
    },
  })

  const handleSupplierChange = (supplierName: string) => {
    form.setValue('supplierName', supplierName)
    const invoicesForSupplier = shipments.filter(
      (s) => formatText(s.supplierName, settings.textFormat) === supplierName
    )
    setAvailableInvoices(invoicesForSupplier)
    form.resetField('shipmentId')
  }

  function onSubmit(values: ImportFormValues) {
    if (overrideFile) {
      onImport({ formValues: values, overrideFile })
    }
  }

  return (
    <Dialog open={true} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Calculation</DialogTitle>
          <DialogDescription>
            Select an invoice, enter costs, and upload a duty override file.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="supplierName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Supplier</FormLabel>
                  <Select onValueChange={handleSupplierChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select supplier" />
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
              control={form.control}
              name="shipmentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Invoice / Shipment</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={availableInvoices.length === 0}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select invoice" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableInvoices.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.invoiceNumber}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="exchangeRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Exch. Rate</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        value={
                          typeof field.value === 'number' || typeof field.value === 'string'
                            ? field.value
                            : ''
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="freightCost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Freight</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        value={
                          typeof field.value === 'number' || typeof field.value === 'string'
                            ? field.value
                            : ''
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="exwCost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>EXW</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        value={
                          typeof field.value === 'number' || typeof field.value === 'string'
                            ? field.value
                            : ''
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="insuranceRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Insurance %</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        value={
                          typeof field.value === 'number' || typeof field.value === 'string'
                            ? field.value
                            : ''
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="interest"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Interest</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      value={
                        typeof field.value === 'number' || typeof field.value === 'string'
                          ? field.value
                          : ''
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label htmlFor="override-file">Duty Override File (.csv)</Label>
              <Input
                id="override-file"
                type="file"
                accept=".csv"
                onChange={(e) => setOverrideFile(e.target.files ? e.target.files[0] : null)}
              />
            </div>

            <DialogFooter>
              <Button variant="ghost" type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!overrideFile || !form.formState.isValid}>
                Import & Calculate
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
