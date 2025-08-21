import { zodResolver } from '@hookform/resolvers/zod'
import { invoke } from '@tauri-apps/api/core'
import { toast } from 'sonner'
import * as z from 'zod'

import React, { useEffect, useState } from 'react'

import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { CreatableCombobox } from '@/components/ui/combobox-creatable'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import type { ExpenseType, ExpenseWithInvoice, ServiceProvider } from '@/types/expense'

import { Label } from '../ui/label'

// Select option type
interface Option {
  value: string
  label: string
}

// ✅ Fixed Zod schema with proper number types
const expenseSchema = z.object({
  expenseTypeId: z.string().min(1, 'Expense type is required.'),
  serviceProviderId: z.string().min(1, 'Service provider is required.'),
  invoiceNo: z.string().min(1, 'Invoice number is required.'),
  invoiceDate: z.string().min(1, 'Invoice date is required.'),
  amount: z.string().min(1, 'Amount is required.'),
  cgstAmount: z.string().optional(),
  sgstAmount: z.string().optional(),
  igstAmount: z.string().optional(),
  tdsRate: z.string().optional(),
  remarks: z.string().optional(),
})

type ExpenseFormValues = z.infer<typeof expenseSchema>

interface ExpenseFormProps {
  expenseToEdit?: ExpenseWithInvoice | null
  onFormSubmit: () => void
  onCancelEdit?: () => void
}

const ExpenseForm: React.FC<ExpenseFormProps> = ({ expenseToEdit, onFormSubmit, onCancelEdit }) => {
  const [expenseTypes, setExpenseTypes] = useState<Option[]>([])
  const [serviceProviders, setServiceProviders] = useState<Option[]>([])
  const [totalAmount, setTotalAmount] = useState<number>(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ✅ Form setup with proper type inference
  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      expenseTypeId: expenseToEdit?.expenseTypeId || '',
      serviceProviderId: expenseToEdit?.serviceProviderId || '',
      invoiceNo: expenseToEdit?.invoiceNo || '',
      invoiceDate: expenseToEdit?.invoiceDate
        ? new Date(expenseToEdit.invoiceDate).toISOString().split('T')[0]
        : '',
      amount: expenseToEdit?.amount?.toString() || '',
      cgstAmount: expenseToEdit?.cgstAmount?.toString() || '',
      sgstAmount: expenseToEdit?.sgstAmount?.toString() || '',
      igstAmount: expenseToEdit?.igstAmount?.toString() || '',
      tdsRate: '0', // Default TDS rate
      remarks: expenseToEdit?.remarks || '',
    },
  })

  // ✅ Reset form when expenseToEdit changes
  useEffect(() => {
    if (expenseToEdit) {
      form.reset({
        expenseTypeId: expenseToEdit.expenseTypeId,
        serviceProviderId: expenseToEdit.serviceProviderId,
        invoiceNo: expenseToEdit.invoiceNo,
        invoiceDate: new Date(expenseToEdit.invoiceDate).toISOString().split('T')[0],
        amount: expenseToEdit.amount.toString(),
        cgstAmount: expenseToEdit.cgstAmount.toString(),
        sgstAmount: expenseToEdit.sgstAmount.toString(),
        igstAmount: expenseToEdit.igstAmount.toString(),
        tdsRate: '0', // Default TDS rate for editing
        remarks: expenseToEdit.remarks || '',
      })
    } else {
      form.reset({
        expenseTypeId: '',
        serviceProviderId: '',
        invoiceNo: '',
        invoiceDate: '',
        amount: '',
        cgstAmount: '',
        sgstAmount: '',
        igstAmount: '',
        tdsRate: '0',
        remarks: '',
      })
    }
  }, [expenseToEdit, form])

  const amount = form.watch('amount')
  const cgstAmount = form.watch('cgstAmount')
  const sgstAmount = form.watch('sgstAmount')
  const igstAmount = form.watch('igstAmount')
  const tdsRate = form.watch('tdsRate')

  // ✅ Calculate total whenever amounts change
  useEffect(() => {
    const baseAmount = Number(amount) || 0
    const cgst = Number(cgstAmount) || 0
    const sgst = Number(sgstAmount) || 0
    const igst = Number(igstAmount) || 0
    const tdsAmount = (baseAmount * (Number(tdsRate) || 0)) / 100

    setTotalAmount(baseAmount + cgst + sgst + igst - tdsAmount)
  }, [amount, cgstAmount, sgstAmount, igstAmount, tdsRate])

  // ✅ Fetch dropdown data on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [types, providers] = await Promise.all([
          invoke<ExpenseType[]>('get_expense_types'),
          invoke<ServiceProvider[]>('get_service_providers'),
        ])
        setExpenseTypes(types.map((t) => ({ value: t.id, label: t.name })))
        setServiceProviders(providers.map((p) => ({ value: p.id, label: p.name })))
      } catch (error) {
        console.error('Failed to fetch data for expense form:', error)
        toast.error('Failed to load expense form data')
      }
    }
    fetchData()
  }, [])

  // ✅ Create expense type
  const handleCreateExpenseType = async (name: string) => {
    try {
      const newExpenseType: ExpenseType = await invoke('add_expense_type', { name })
      const newOption = { value: newExpenseType.id, label: newExpenseType.name }
      setExpenseTypes((prev) => [...prev, newOption])
      form.setValue('expenseTypeId', newExpenseType.id)
      toast.success(`Expense type "${name}" created successfully`)
    } catch (error) {
      console.error('Failed to create new expense type:', error)
      toast.error('Failed to create expense type')
    }
  }

  // ✅ Create service provider
  const handleCreateServiceProvider = async (name: string) => {
    try {
      const newServiceProvider: ServiceProvider = await invoke('add_service_provider', { name })
      const newOption = { value: newServiceProvider.id, label: newServiceProvider.name }
      setServiceProviders((prev) => [...prev, newOption])
      form.setValue('serviceProviderId', newServiceProvider.id)
      toast.success(`Service provider "${name}" created successfully`)
    } catch (error) {
      console.error('Failed to create new service provider:', error)
      toast.error('Failed to create service provider')
    }
  }

  // ✅ Submit handler
  const onSubmit = async (values: ExpenseFormValues) => {
    setIsSubmitting(true)

    try {
      const baseAmount = Number(values.amount) || 0
      const cgstAmt = Number(values.cgstAmount) || 0
      const sgstAmt = Number(values.sgstAmount) || 0
      const igstAmt = Number(values.igstAmount) || 0
      const tdsRate = Number(values.tdsRate) || 0

      if (baseAmount === 0 && (cgstAmt > 0 || sgstAmt > 0 || igstAmt > 0)) {
        toast.error('Amount must be greater than 0 to enter GST amounts')
        return
      }

      const toRate = (taxAmount: number): number => {
        if (baseAmount <= 0) return 0
        return (taxAmount / baseAmount) * 100
      }

      if (expenseToEdit) {
        // Editing existing expense - only update expense fields
        const payload = {
          expenseInvoiceId: expenseToEdit.expenseInvoiceId,
          expenseTypeId: values.expenseTypeId,
          amount: baseAmount,
          cgstRate: toRate(cgstAmt),
          sgstRate: toRate(sgstAmt),
          igstRate: toRate(igstAmt),
          tdsRate: tdsRate,
          remarks: values.remarks,
        }
        await invoke('update_expense', { id: expenseToEdit.id, payload })
        toast.success('Expense updated successfully')
      } else {
        // Adding new expense - need to create both invoice and expense
        // For now, we'll use a simple approach with default invoice data
        // In the future, this should be handled by a proper invoice creation flow
        toast.error(
          'Adding new expenses requires invoice information. Please use the "Add Multiple Expenses" feature.'
        )
        return
      }

      onFormSubmit()
      form.reset({
        expenseTypeId: '',
        serviceProviderId: '',
        invoiceNo: '',
        invoiceDate: '',
        amount: '',
        cgstAmount: '',
        sgstAmount: '',
        igstAmount: '',
        tdsRate: '0',
        remarks: '',
      })
    } catch (error) {
      console.error('Failed to submit expense:', error)
      toast.error(expenseToEdit ? 'Failed to update expense' : 'Failed to add expense')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ✅ Cancel edit handler
  const handleCancelEdit = () => {
    if (onCancelEdit) {
      onCancelEdit()
    } else {
      form.reset({
        expenseTypeId: '',
        serviceProviderId: '',
        invoiceNo: '',
        invoiceDate: '',
        amount: '',
        cgstAmount: '',
        sgstAmount: '',
        igstAmount: '',
        tdsRate: '0',
        remarks: '',
      })
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Expense Type */}
        <FormField
          control={form.control}
          name="expenseTypeId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Expense Type</FormLabel>
              <FormControl>
                <CreatableCombobox
                  options={expenseTypes}
                  value={field.value}
                  onChange={field.onChange}
                  onNameCreate={handleCreateExpenseType}
                  placeholder="Select expense type"
                  dialogTitle="Create New Expense Type"
                  dialogDescription="Enter the name for the new expense type."
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Service Provider */}
        <FormField
          control={form.control}
          name="serviceProviderId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Service Provider</FormLabel>
              <FormControl>
                <CreatableCombobox
                  options={serviceProviders}
                  value={field.value}
                  onChange={field.onChange}
                  onNameCreate={handleCreateServiceProvider}
                  placeholder="Select service provider"
                  dialogTitle="Create New Service Provider"
                  dialogDescription="Enter the name for the new service provider."
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Invoice No */}
        <FormField
          control={form.control}
          name="invoiceNo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Invoice Number</FormLabel>
              <FormControl>
                <Input placeholder="Invoice Number" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Invoice Date */}
        <FormField
          control={form.control}
          name="invoiceDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Invoice Date</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Amount */}
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Amount (w/o GST)</FormLabel>
              <FormControl>
                <Input type="number" placeholder="Amount" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* GST Amounts */}
        <div className="grid grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="cgstAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CGST Amount</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="CGST Amount" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="sgstAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>SGST Amount</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="SGST Amount" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="igstAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>IGST Amount</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="IGST Amount" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* TDS Rate */}
        <FormField
          control={form.control}
          name="tdsRate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>TDS %</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" placeholder="TDS Percentage" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Total */}
        <div className="space-y-2">
          <Label>Total Amount</Label>
          <Input value={totalAmount.toFixed(2)} readOnly />
        </div>

        {/* Remarks */}
        <FormField
          control={form.control}
          name="remarks"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Remarks</FormLabel>
              <FormControl>
                <Input placeholder="Remarks" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Action Buttons */}
        <div className="flex space-x-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : (expenseToEdit ? 'Update' : 'Add') + ' Expense'}
          </Button>
          {expenseToEdit && (
            <Button type="button" variant="outline" onClick={handleCancelEdit}>
              Cancel Edit
            </Button>
          )}
        </div>
      </form>
    </Form>
  )
}

export default ExpenseForm
