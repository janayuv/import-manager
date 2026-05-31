import { safeInvoke as invoke } from '@/lib/ipc-safe';
import { confirm } from '@/lib/tauri-bridge';
import { AlertTriangle } from 'lucide-react';

import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function ExpenseDataManagerAdminPanel() {
  const [isClearing, setIsClearing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const clearExpenseData = async () => {
    const confirmed = await confirm(
      'Are you sure you want to clear all expense types and service providers? This action cannot be undone.',
      {
        title: 'Clear Expense Data',
        kind: 'warning',
      }
    );

    if (!confirmed) {
      return;
    }

    setIsClearing(true);
    setMessage(null);

    try {
      const result = await invoke<string>('clear_expense_data');
      setMessage(result);
    } catch (error) {
      setMessage(`Error: ${String(error)}`);
    } finally {
      setIsClearing(false);
    }
  };

  const debugExpenseData = async () => {
    try {
      const result = await invoke<string>('debug_expense_data');
      setMessage(result);
    } catch (error) {
      setMessage(`Error: ${String(error)}`);
    }
  };

  const cleanupOrphanedExpenses = async () => {
    const confirmed = await confirm(
      'Are you sure you want to clean up orphaned expense data? This will remove expenses and invoices that are not properly linked.',
      {
        title: 'Cleanup Orphaned Data',
        kind: 'warning',
      }
    );

    if (!confirmed) {
      return;
    }

    try {
      const result = await invoke<string>('cleanup_orphaned_expenses');
      setMessage(result);
    } catch (error) {
      setMessage(`Error: ${String(error)}`);
    }
  };

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      data-testid="admin-expense-data-manager-panel"
    >
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Destructive expense data operations. Clears types and service
          providers or removes orphaned expense rows.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="destructive"
          onClick={() => void clearExpenseData()}
          disabled={isClearing}
          data-testid="admin-clear-expense-data"
        >
          {isClearing ? 'Clearing…' : 'Clear All Expense Data'}
        </Button>

        <Button
          variant="outline"
          onClick={() => void debugExpenseData()}
          data-testid="admin-debug-expense-data"
        >
          Debug Expense Data
        </Button>

        <Button
          variant="outline"
          onClick={() => void cleanupOrphanedExpenses()}
          data-testid="admin-cleanup-orphaned-expenses"
        >
          Cleanup Orphaned Data
        </Button>
      </div>

      {message ? (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
