import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2, X } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { toast } from 'sonner'
import type { ServiceProvider, ExpenseType, ExpenseInvoiceWithExpenses } from '@/types/expense'

interface ExpenseInvoiceFormProps {
  shipmentId: string
  onSuccess: () => void
  onCancel: () => void
}

interface ExpenseLine {
  id: string
  expenseTypeId: string
  amount: number
  cgstRate: number
  sgstRate: number
  igstRate: number
  tdsRate: number
  remarks?: string
}

export function ExpenseInvoiceForm({ shipmentId, onSuccess, onCancel }: ExpenseInvoiceFormProps) {
  const [serviceProviders, setServiceProviders] = useState<ServiceProvider[]>([])
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([])
  const [loading, setLoading] = useState(false)

  // Form state
  const [serviceProviderId, setServiceProviderId] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [remarks, setRemarks] = useState('')
  const [expenseLines, setExpenseLines] = useState<ExpenseLine[]>([
    {
      id: '1',
      expenseTypeId: '',
      amount: 0,
      cgstRate: 0,
      sgstRate: 0,
      igstRate: 0,
      tdsRate: 0,
      remarks: '',
    },
  ])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [providers, types] = await Promise.all([
        invoke<ServiceProvider[]>('get_service_providers'),
        invoke<ExpenseType[]>('get_expense_types'),
      ])
      setServiceProviders(providers)
      setExpenseTypes(types)
    } catch (error) {
      console.error('Failed to load data:', error)
      toast.error('Failed to load service providers and expense types')
    }
  }

  const addExpenseLine = () => {
    const newId = (expenseLines.length + 1).toString()
    setExpenseLines([
      ...expenseLines,
      {
        id: newId,
        expenseTypeId: '',
        amount: 0,
        cgstRate: 0,
        sgstRate: 0,
        igstRate: 0,
        tdsRate: 0,
        remarks: '',
      },
    ])
  }

  const removeExpenseLine = (id: string) => {
    if (expenseLines.length > 1) {
      setExpenseLines(expenseLines.filter((line) => line.id !== id))
    }
  }

  const updateExpenseLine = (id: string, field: keyof ExpenseLine, value: string | number) => {
    setExpenseLines(
      expenseLines.map((line) => (line.id === id ? { ...line, [field]: value } : line))
    )
  }

  const getExpenseTypeDefaults = (expenseTypeId: string) => {
    const expenseType = expenseTypes.find((et) => et.id === expenseTypeId)
    if (expenseType) {
      return {
        cgstRate: expenseType.defaultCgstRate,
        sgstRate: expenseType.defaultSgstRate,
        igstRate: expenseType.defaultIgstRate,
      }
    }
    return { cgstRate: 0, sgstRate: 0, igstRate: 0 }
  }

  const handleExpenseTypeChange = (id: string, expenseTypeId: string) => {
    const defaults = getExpenseTypeDefaults(expenseTypeId)
    updateExpenseLine(id, 'expenseTypeId', expenseTypeId)
    updateExpenseLine(id, 'cgstRate', defaults.cgstRate)
    updateExpenseLine(id, 'sgstRate', defaults.sgstRate)
    updateExpenseLine(id, 'igstRate', defaults.igstRate)
  }

  const calculateTotal = () => {
    return expenseLines.reduce((total, line) => {
      const amount = line.amount || 0
      const cgst = (amount * (line.cgstRate || 0)) / 100
      const sgst = (amount * (line.sgstRate || 0)) / 100
      const igst = (amount * (line.igstRate || 0)) / 100
      const tds = (amount * (line.tdsRate || 0)) / 100
      return total + amount + cgst + sgst + igst - tds
    }, 0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!serviceProviderId || !invoiceNo || !invoiceDate) {
      toast.error('Please fill in all required fields')
      return
    }

    if (expenseLines.some((line) => !line.expenseTypeId || line.amount <= 0)) {
      toast.error('Please fill in all expense details')
      return
    }

    setLoading(true)
    try {
      const payload: ExpenseInvoiceWithExpenses = {
        shipmentId,
        serviceProviderId,
        invoiceNo,
        invoiceDate,
        remarks: remarks || undefined,
        expenses: expenseLines.map((line) => ({
          expenseTypeId: line.expenseTypeId,
          amount: line.amount,
          cgstRate: line.cgstRate,
          sgstRate: line.sgstRate,
          igstRate: line.igstRate,
          tdsRate: line.tdsRate,
          remarks: line.remarks || undefined,
        })),
      }

      await invoke('add_expense_invoice_with_expenses', { payload })
      toast.success('Expense invoice created successfully')
      onSuccess()
    } catch (error) {
      console.error('Failed to create expense invoice:', error)
      toast.error('Failed to create expense invoice')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="mx-auto w-full max-w-4xl">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Create Expense Invoice</span>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Invoice Details */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="serviceProvider">Service Provider *</Label>
              <Select value={serviceProviderId} onValueChange={setServiceProviderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select service provider" />
                </SelectTrigger>
                <SelectContent>
                  {serviceProviders.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoiceNo">Invoice Number *</Label>
              <Input
                id="invoiceNo"
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                placeholder="Enter invoice number"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoiceDate">Invoice Date *</Label>
              <Input
                id="invoiceDate"
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>
          </div>

          {/* Expense Lines */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-lg font-semibold">Expense Lines</Label>
              <Button type="button" variant="outline" size="sm" onClick={addExpenseLine}>
                <Plus className="mr-2 h-4 w-4" />
                Add Expense
              </Button>
            </div>

            {expenseLines.map((line, index) => (
              <Card key={line.id} className="p-4">
                <div className="mb-4 flex items-center justify-between">
                  <h4 className="font-medium">Expense Line {index + 1}</h4>
                  {expenseLines.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeExpenseLine(line.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Expense Type *</Label>
                    <Select
                      value={line.expenseTypeId}
                      onValueChange={(value) => handleExpenseTypeChange(line.id, value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {expenseTypes.map((type_) => (
                          <SelectItem key={type_.id} value={type_.id}>
                            {type_.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Amount *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={line.amount}
                      onChange={(e) =>
                        updateExpenseLine(line.id, 'amount', parseFloat(e.target.value) || 0)
                      }
                      placeholder="0.00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>CGST Rate (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={line.cgstRate}
                      onChange={(e) =>
                        updateExpenseLine(line.id, 'cgstRate', parseFloat(e.target.value) || 0)
                      }
                      placeholder="0.00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>SGST Rate (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={line.sgstRate}
                      onChange={(e) =>
                        updateExpenseLine(line.id, 'sgstRate', parseFloat(e.target.value) || 0)
                      }
                      placeholder="0.00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>IGST Rate (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={line.igstRate}
                      onChange={(e) =>
                        updateExpenseLine(line.id, 'igstRate', parseFloat(e.target.value) || 0)
                      }
                      placeholder="0.00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>TDS Rate (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={line.tdsRate}
                      onChange={(e) =>
                        updateExpenseLine(line.id, 'tdsRate', parseFloat(e.target.value) || 0)
                      }
                      placeholder="0.00"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label>Remarks</Label>
                    <Input
                      value={line.remarks || ''}
                      onChange={(e) => updateExpenseLine(line.id, 'remarks', e.target.value)}
                      placeholder="Optional remarks"
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Invoice Remarks */}
          <div className="space-y-2">
            <Label htmlFor="remarks">Invoice Remarks</Label>
            <Textarea
              id="remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Optional remarks for the entire invoice"
              rows={3}
            />
          </div>

          {/* Total */}
          <div className="bg-muted flex items-center justify-between rounded-lg p-4">
            <span className="text-lg font-semibold">Total Amount:</span>
            <span className="text-2xl font-bold">₹{calculateTotal().toFixed(2)}</span>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Expense Invoice'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
