import { safeInvoke as invoke } from '@/lib/ipc-safe';

import React, { useCallback, useEffect, useState } from 'react';

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
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import type {
  ExpenseType,
  ExpenseWithInvoice,
  ServiceProvider,
} from '@/types/expense';

interface ExpenseListProps {
  shipmentId: string;
  onEdit: (expense: ExpenseWithInvoice) => void;
  onDelete: (expenseId: string) => void;
  refreshKey: number;
}

const ExpenseList: React.FC<ExpenseListProps> = ({
  shipmentId,
  onEdit,
  onDelete,
  refreshKey,
}) => {
  const [expenses, setExpenses] = useState<ExpenseWithInvoice[]>([]);
  const [serviceProviders, setServiceProviders] = useState<Map<string, string>>(
    new Map()
  );
  const [expenseTypes, setExpenseTypes] = useState<Map<string, string>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(
    null
  );

  const fetchRelatedData = useCallback(async () => {
    try {
      const [providers, types] = await Promise.all([
        invoke<ServiceProvider[]>('get_service_providers'),
        invoke<ExpenseType[]>('get_expense_types'),
      ]);
      setServiceProviders(new Map(providers.map(p => [p.id, p.name])));
      setExpenseTypes(new Map(types.map(t => [t.id, t.name])));
    } catch (error) {
      console.error('Failed to fetch related data:', error);
    }
  }, []);

  const fetchExpenses = useCallback(async () => {
    if (!shipmentId) return;
    setLoading(true);
    try {
      const fetchedExpenses: ExpenseWithInvoice[] = await invoke(
        'get_expenses_for_shipment',
        {
          shipmentId,
        }
      );
      setExpenses(fetchedExpenses);
    } catch (error) {
      console.error('Failed to fetch expenses:', error);
    } finally {
      setLoading(false);
    }
  }, [shipmentId]);

  const computeTotalForExpense = (exp: ExpenseWithInvoice): number => {
    const amount = Number(exp.amount) || 0;
    const cgst = Number(exp.cgstAmount) || 0;
    const sgst = Number(exp.sgstAmount) || 0;
    const igst = Number(exp.igstAmount) || 0;
    const tds = Number(exp.tdsAmount) || 0;
    const serverTotal = Number(exp.totalAmount) || 0;
    const derivedTotal = amount + cgst + sgst + igst - tds;
    return serverTotal > 0 ? serverTotal : derivedTotal;
  };

  useEffect(() => {
    fetchRelatedData();
  }, [fetchRelatedData]);

  useEffect(() => {
    fetchExpenses();
  }, [shipmentId, refreshKey, fetchExpenses]);

  const handleDelete = async (expenseId: string) => {
    if (deletingExpenseId) return;

    setDeletingExpenseId(expenseId);
    try {
      await invoke('delete_expense', { id: expenseId });
      onDelete(expenseId);
    } catch (error) {
      console.error('Failed to delete expense:', error);
    } finally {
      setDeletingExpenseId(null);
    }
  };

  const handleEdit = (expense: ExpenseWithInvoice) => {
    onEdit(expense);
  };

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 0',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              border: '2px solid var(--color-im-accent)',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              width: 32,
              height: 32,
              animation: 'spin 1s linear infinite',
              margin: '0 auto 8px',
            }}
          ></div>
          <p style={{ color: 'var(--color-im-muted)', margin: 0 }}>
            Loading expenses...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>
          Expenses ({expenses.length})
        </h3>
        {expenses.length > 0 && (
          <span className="im-badge">
            Total: ₹
            {expenses
              .reduce((sum, exp) => sum + computeTotalForExpense(exp), 0)
              .toFixed(2)}
          </span>
        )}
      </div>

      <div className="im-table-scroll">
        <table className="im-table">
          <thead>
            <tr>
              <th className="im-th">Expense Type</th>
              <th className="im-th">Service Provider</th>
              <th className="im-th">Invoice #</th>
              <th className="im-th">Date</th>
              <th className="im-th">Amount</th>
              <th className="im-th">CGST</th>
              <th className="im-th">SGST</th>
              <th className="im-th">IGST</th>
              <th className="im-th">TDS</th>
              <th className="im-th">Total Amount</th>
              <th className="im-th">Actions</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map(expense => (
              <tr className="im-tr" key={expense.id}>
                <td className="im-td">
                  <span className="im-badge">
                    {expenseTypes.get(expense.expenseTypeId) || 'N/A'}
                  </span>
                </td>
                <td className="im-td">
                  {serviceProviders.get(expense.serviceProviderId) || 'N/A'}
                </td>
                <td
                  className="im-td"
                  style={{ fontFamily: 'Consolas, monospace', fontSize: 13 }}
                >
                  {expense.invoiceNo || 'N/A'}
                </td>
                <td className="im-td">
                  {expense.invoiceDate
                    ? new Date(expense.invoiceDate).toLocaleDateString()
                    : 'N/A'}
                </td>
                <td
                  className="im-td"
                  style={{ fontFamily: 'Consolas, monospace' }}
                >
                  ₹{expense.amount.toFixed(2)}
                </td>
                <td
                  className="im-td"
                  style={{ fontFamily: 'Consolas, monospace' }}
                >
                  ₹{expense.cgstAmount.toFixed(2)}
                </td>
                <td
                  className="im-td"
                  style={{ fontFamily: 'Consolas, monospace' }}
                >
                  ₹{expense.sgstAmount.toFixed(2)}
                </td>
                <td
                  className="im-td"
                  style={{ fontFamily: 'Consolas, monospace' }}
                >
                  ₹{expense.igstAmount.toFixed(2)}
                </td>
                <td
                  className="im-td"
                  style={{ fontFamily: 'Consolas, monospace' }}
                >
                  ₹{expense.tdsAmount.toFixed(2)}
                </td>
                <td
                  className="im-td"
                  style={{ fontFamily: 'Consolas, monospace', fontWeight: 600 }}
                >
                  ₹{computeTotalForExpense(expense).toFixed(2)}
                </td>
                <td className="im-td">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button
                      variant="default"
                      size="sm"
                      useAccentColor
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
                          {deletingExpenseId === expense.id
                            ? 'Deleting...'
                            : 'Delete'}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Expense</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete this expense? This
                            action cannot be undone.
                            <br />
                            <strong>Expense Type:</strong>{' '}
                            {expenseTypes.get(expense.expenseTypeId) || 'N/A'}
                            <br />
                            <strong>Amount:</strong> ₹
                            {computeTotalForExpense(expense).toFixed(2)}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel asChild>
                            <Button variant="outline" useAccentColor>
                              Cancel
                            </Button>
                          </AlertDialogCancel>
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {expenses.length === 0 && !loading && (
        <div style={{ padding: '32px 0', textAlign: 'center' }}>
          <p style={{ color: 'var(--color-im-muted)', margin: 0 }}>
            No expenses found for this shipment.
          </p>
          <p
            style={{
              color: 'var(--color-im-muted)',
              fontSize: 13,
              marginTop: 4,
            }}
          >
            Add your first expense using the form on the right.
          </p>
        </div>
      )}
    </div>
  );
};

export default ExpenseList;
