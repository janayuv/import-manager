import { invoke } from '@tauri-apps/api/core'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import React, { useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const ExpenseDataManager: React.FC = () => {
  const [isClearing, setIsClearing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const clearExpenseData = async () => {
    if (
      !confirm(
        'Are you sure you want to clear all expense types and service providers? This action cannot be undone.'
      )
    ) {
      return
    }

    setIsClearing(true)
    setMessage(null)

    try {
      const result = await invoke<string>('clear_expense_data')
      setMessage(result)
      toast.success('Expense data cleared successfully')
    } catch (error) {
      console.error('Failed to clear expense data:', error)
      setMessage(`Error: ${error}`)
      toast.error('Failed to clear expense data')
    } finally {
      setIsClearing(false)
    }
  }

  const debugExpenseData = async () => {
    try {
      const result = await invoke<string>('debug_expense_data')
      setMessage(result)
      console.log('Debug result:', result)
    } catch (error) {
      console.error('Failed to debug expense data:', error)
      setMessage(`Error: ${error}`)
      toast.error('Failed to debug expense data')
    }
  }

  const cleanupOrphanedExpenses = async () => {
    if (
      !confirm(
        'Are you sure you want to clean up orphaned expense data? This will remove expenses and invoices that are not properly linked.'
      )
    ) {
      return
    }

    try {
      const result = await invoke<string>('cleanup_orphaned_expenses')
      setMessage(result)
      console.log('Cleanup result:', result)
      toast.success('Orphaned expense data cleaned up successfully')
    } catch (error) {
      console.error('Failed to cleanup orphaned expenses:', error)
      setMessage(`Error: ${error}`)
      toast.error('Failed to cleanup orphaned expenses')
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Expense Data Manager
          </CardTitle>
          <CardDescription>Manage expense types and service providers data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This will remove all existing expense types and service providers from the database.
              You will need to add them manually after clearing.
            </AlertDescription>
          </Alert>

          <div className="flex gap-2">
            <Button variant="destructive" onClick={clearExpenseData} disabled={isClearing}>
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
  )
}

export default ExpenseDataManager
