import { toast } from 'sonner'

import React, { useCallback, useEffect, useState } from 'react'

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { ExpenseType, ServiceProvider, ExpenseWithInvoice } from '@/types/expense'
import { invoke } from '@tauri-apps/api/core'

interface ExpenseListProps {
  shipmentId: string
  onEdit: (expense: ExpenseWithInvoice) => void
  onDelete: (expenseId: string) => void
  refreshKey: number
}

const ExpenseList: React.FC<ExpenseListProps> = ({ shipmentId, onEdit, onDelete, refreshKey }) => {
  const [expenses, setExpenses] = useState<ExpenseWithInvoice[]>([])
  const [serviceProviders, setServiceProviders] = useState<Map<string, string>>(new Map())
  const [expenseTypes, setExpenseTypes] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null)

  const fetchRelatedData = useCallback(async () => {
    try {
      const [providers, types] = await Promise.all([
        invoke<ServiceProvider[]>('get_service_providers'),
        invoke<ExpenseType[]>('get_expense_types'),
      ])
      setServiceProviders(new Map(providers.map((p) => [p.id, p.name])))
      setExpenseTypes(new Map(types.map((t) => [t.id, t.name])))
    } catch (error) {
      console.error('Failed to fetch related data:', error)
      toast.error('Failed to load expense data')
    }
  }, [])

  const fetchExpenses = useCallback(async () => {
    if (!shipmentId) return
    setLoading(true)
    try {
      const fetchedExpenses: ExpenseWithInvoice[] = await invoke('get_expenses_for_shipment', {
        shipmentId,
      })
      setExpenses(fetchedExpenses)
    } catch (error) {
      console.error('Failed to fetch expenses:', error)
      toast.error('Failed to load expenses')
    } finally {
      setLoading(false)
    }
  }, [shipmentId])

  const computeTotalForExpense = (exp: ExpenseWithInvoice): number => {
    const amount = Number(exp.amount) || 0
    const cgst = Number(exp.cgstAmount) || 0
    const sgst = Number(exp.sgstAmount) || 0
    const igst = Number(exp.igstAmount) || 0
    const tds = Number(exp.tdsAmount) || 0
    const serverTotal = Number(exp.totalAmount) || 0
    const derivedTotal = amount + cgst + sgst + igst - tds
    return serverTotal > 0 ? serverTotal : derivedTotal
  }

  useEffect(() => {
    fetchRelatedData()
  }, [fetchRelatedData])

  useEffect(() => {
    fetchExpenses()
  }, [shipmentId, refreshKey, fetchExpenses])

  const handleDelete = async (expenseId: string) => {
    if (deletingExpenseId) return

    setDeletingExpenseId(expenseId)
    try {
      await invoke('delete_expense', { id: expenseId })
      toast.success('Expense deleted successfully')
      onDelete(expenseId)
    } catch (error) {
      console.error('Failed to delete expense:', error)
      toast.error('Failed to delete expense')
    } finally {
      setDeletingExpenseId(null)
    }
  }

  const handleEdit = (expense: ExpenseWithInvoice) => {
    onEdit(expense)
    toast.info('Editing expense - please update the details below')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <div className="border-primary mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-b-2"></div>
          <p className="text-muted-foreground">Loading expenses...</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-medium">Expenses ({expenses.length})</h3>
        {expenses.length > 0 && (
          <Badge variant="secondary">
            Total: ₹{expenses.reduce((sum, exp) => sum + computeTotalForExpense(exp), 0).toFixed(2)}
          </Badge>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Expense Type</TableHead>
            <TableHead>Service Provider</TableHead>
            <TableHead>Invoice #</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>CGST</TableHead>
            <TableHead>SGST</TableHead>
            <TableHead>IGST</TableHead>
            <TableHead>TDS</TableHead>
            <TableHead>Total Amount</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {expenses.map((expense) => (
            <TableRow key={expense.id} className="hover:bg-muted/50">
              <TableCell>
                <Badge variant="outline">{expenseTypes.get(expense.expenseTypeId) || 'N/A'}</Badge>
              </TableCell>
              <TableCell>{serviceProviders.get(expense.serviceProviderId) || 'N/A'}</TableCell>
              <TableCell className="font-mono text-sm">{expense.invoiceNo || 'N/A'}</TableCell>
              <TableCell>
                {expense.invoiceDate ? new Date(expense.invoiceDate).toLocaleDateString() : 'N/A'}
              </TableCell>
              <TableCell className="font-mono">₹{expense.amount.toFixed(2)}</TableCell>
              <TableCell className="font-mono">₹{expense.cgstAmount.toFixed(2)}</TableCell>
              <TableCell className="font-mono">₹{expense.sgstAmount.toFixed(2)}</TableCell>
              <TableCell className="font-mono">₹{expense.igstAmount.toFixed(2)}</TableCell>
              <TableCell className="font-mono">₹{expense.tdsAmount.toFixed(2)}</TableCell>
              <TableCell className="font-mono font-semibold">
                ₹{computeTotalForExpense(expense).toFixed(2)}
              </TableCell>
              <TableCell>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(expense)}
                    className="h-8 px-2"
                  >
                    Edit
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-8 px-2"
                        disabled={deletingExpenseId === expense.id}
                      >
                        {deletingExpenseId === expense.id ? 'Deleting...' : 'Delete'}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Expense</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete this expense? This action cannot be
                          undone.
                          <br />
                          <strong>Expense Type:</strong>{' '}
                          {expenseTypes.get(expense.expenseTypeId) || 'N/A'}
                          <br />
                          <strong>Amount:</strong> ₹{computeTotalForExpense(expense).toFixed(2)}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(expense.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete Expense
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {expenses.length === 0 && !loading && (
        <div className="py-8 text-center">
          <p className="text-muted-foreground">No expenses found for this shipment.</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Add your first expense using the form on the right.
          </p>
        </div>
      )}
    </div>
  )
}

export default ExpenseList
