import { invoke } from '@tauri-apps/api/core';
import { confirm } from '@tauri-apps/plugin-dialog';
import { AlertTriangle, Trash2 } from 'lucide-react';

import React, { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const ExpenseDataManager: React.FC = () => {
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
      console.error('Failed to clear expense data:', error);
      setMessage(`Error: ${error}`);
    } finally {
      setIsClearing(false);
    }
  };

  const debugExpenseData = async () => {
    try {
      const result = await invoke<string>('debug_expense_data');
      setMessage(result);
      console.log('Debug result:', result);
    } catch (error) {
      console.error('Failed to debug expense data:', error);
      setMessage(`Error: ${error}`);
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
      console.log('Cleanup result:', result);
    } catch (error) {
      console.error('Failed to cleanup orphaned expenses:', error);
      setMessage(`Error: ${error}`);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Data Management Tools
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This will remove all existing expense types and service providers
              from the database. You will need to add them manually after
              clearing.
            </AlertDescription>
          </Alert>

          <div className="flex gap-2">
            <Button
              variant="destructive"
              onClick={clearExpenseData}
              disabled={isClearing}
            >
              {isClearing ? 'Clearing...' : 'Clear All Expense Data'}
            </Button>

            <Button variant="outline" onClick={debugExpenseData}>
              Debug Expense Data
            </Button>

            <Button variant="outline" onClick={cleanupOrphanedExpenses}>
              Cleanup Orphaned Data
            </Button>
          </div>

          {message && (
            <Alert>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ExpenseDataManager;
