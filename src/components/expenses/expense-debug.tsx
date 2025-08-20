import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

export function ExpenseDebug() {
  const [debugInfo, setDebugInfo] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [newExpenseType, setNewExpenseType] = useState({
    name: '',
    cgstRate: 9, // 9% as percentage
    sgstRate: 9, // 9% as percentage
    igstRate: 0, // 0% as percentage
  })

  const debugExpenseTypes = async () => {
    setLoading(true)
    try {
      const info = await invoke<string>('debug_expense_types')
      setDebugInfo(info)
    } catch (error) {
      console.error('Failed to debug expense types:', error)
      toast.error('Failed to debug expense types')
    } finally {
      setLoading(false)
    }
  }

  const addExpenseType = async () => {
    if (!newExpenseType.name.trim()) {
      toast.error('Please enter an expense type name')
      return
    }

    setLoading(true)
    try {
      await invoke('add_expense_type_with_rates', {
        name: newExpenseType.name,
        cgstRate: newExpenseType.cgstRate * 100, // Convert percentage to basis points for backend
        sgstRate: newExpenseType.sgstRate * 100,
        igstRate: newExpenseType.igstRate * 100,
      })
      toast.success(`Added expense type: ${newExpenseType.name}`)
      setNewExpenseType({
        name: '',
        cgstRate: 9,
        sgstRate: 9,
        igstRate: 0,
      })
      // Refresh debug info
      await debugExpenseTypes()
    } catch (error) {
      console.error('Failed to add expense type:', error)
      toast.error('Failed to add expense type')
    } finally {
      setLoading(false)
    }
  }

  const addSampleExpenseTypes = async () => {
    setLoading(true)
    try {
      const sampleTypes = [
        { name: 'Transport Charges-LCL', cgst: 9, sgst: 9, igst: 0 },
        { name: 'Transport Charges-FCL', cgst: 9, sgst: 9, igst: 0 },
        { name: 'CFS Charges-FCL', cgst: 9, sgst: 9, igst: 0 },
        { name: 'Customs Duty', cgst: 9, sgst: 9, igst: 0 },
        { name: 'Freight Charges', cgst: 0, sgst: 0, igst: 18 },
        { name: 'Handling Charges', cgst: 9, sgst: 9, igst: 0 },
      ]

      for (const type of sampleTypes) {
        await invoke('add_expense_type_with_rates', {
          name: type.name,
          cgstRate: type.cgst * 100, // Convert percentage to basis points for backend
          sgstRate: type.sgst * 100,
          igstRate: type.igst * 100,
        })
      }

      toast.success('Added sample expense types')
      await debugExpenseTypes()
    } catch (error) {
      console.error('Failed to add sample expense types:', error)
      toast.error('Failed to add sample expense types')
    } finally {
      setLoading(false)
    }
  }

  const fixExpenseTypes = async () => {
    setLoading(true)
    try {
      const result = await invoke<string>('fix_expense_types')
      setDebugInfo(result)
      toast.success('Fixed expense types with correct rates')
    } catch (error) {
      console.error('Failed to fix expense types:', error)
      toast.error('Failed to fix expense types')
    } finally {
      setLoading(false)
    }
  }

  const fixExistingExpenses = async () => {
    setLoading(true)
    try {
      const result = await invoke<string>('fix_existing_expenses')
      setDebugInfo(result)
      toast.success('Fixed existing expenses with correct rates and recalculated amounts')
    } catch (error) {
      console.error('Failed to fix existing expenses:', error)
      toast.error('Failed to fix existing expenses')
    } finally {
      setLoading(false)
    }
  }

  const fixLclChargesRate = async () => {
    setLoading(true)
    try {
      const result = await invoke<string>('fix_lcl_charges_rate')
      setDebugInfo(result)
      toast.success('Fixed LCL Charges rate')
    } catch (error) {
      console.error('Failed to fix LCL Charges rate:', error)
      toast.error('Failed to fix LCL Charges rate')
    } finally {
      setLoading(false)
    }
  }

  const cleanupOrphanedExpenseInvoices = async () => {
    setLoading(true)
    try {
      const result = await invoke<string>('cleanup_orphaned_expense_invoices')
      setDebugInfo(result)
      toast.success('Cleaned up orphaned expense invoices')
    } catch (error) {
      console.error('Failed to cleanup orphaned expense invoices:', error)
      toast.error('Failed to cleanup orphaned expense invoices')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Expense Types Debug & Setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Debug Section */}
          <div className="space-y-4">
            <div className="flex gap-4">
              <Button onClick={debugExpenseTypes} disabled={loading}>
                {loading ? 'Loading...' : 'Debug Expense Types'}
              </Button>
              <Button onClick={addSampleExpenseTypes} disabled={loading} variant="outline">
                Add Sample Expense Types
              </Button>
              <Button onClick={fixExpenseTypes} disabled={loading} variant="destructive">
                Fix All Expense Types
              </Button>
              <Button onClick={fixExistingExpenses} disabled={loading} variant="destructive">
                Fix Existing Expenses
              </Button>
              <Button onClick={fixLclChargesRate} disabled={loading} variant="destructive">
                Fix LCL Charges Rate
              </Button>
              <Button
                onClick={cleanupOrphanedExpenseInvoices}
                disabled={loading}
                variant="destructive"
              >
                Cleanup Orphaned Invoices
              </Button>
            </div>

            {debugInfo && (
              <div className="rounded-lg bg-gray-700 p-4">
                <h3 className="mb-2 font-semibold">Debug Information:</h3>
                <pre className="text-sm whitespace-pre-wrap">{debugInfo}</pre>
              </div>
            )}
          </div>

          {/* Add New Expense Type */}
          <div className="space-y-4 border-t pt-6">
            <h3 className="font-semibold">Add New Expense Type</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={newExpenseType.name}
                  onChange={(e) => setNewExpenseType((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Expense type name"
                />
              </div>
              <div>
                <Label>CGST Rate (%)</Label>
                <Input
                  type="number"
                  step="1"
                  value={newExpenseType.cgstRate}
                  onChange={(e) => {
                    const percentage = parseFloat(e.target.value) || 0
                    setNewExpenseType((prev) => ({ ...prev, cgstRate: percentage }))
                  }}
                  placeholder="9"
                />
              </div>
              <div>
                <Label>SGST Rate (%)</Label>
                <Input
                  type="number"
                  step="1"
                  value={newExpenseType.sgstRate}
                  onChange={(e) => {
                    const percentage = parseFloat(e.target.value) || 0
                    setNewExpenseType((prev) => ({ ...prev, sgstRate: percentage }))
                  }}
                  placeholder="9"
                />
              </div>
              <div>
                <Label>IGST Rate (%)</Label>
                <Input
                  type="number"
                  step="1"
                  value={newExpenseType.igstRate}
                  onChange={(e) => {
                    const percentage = parseFloat(e.target.value) || 0
                    setNewExpenseType((prev) => ({ ...prev, igstRate: percentage }))
                  }}
                  placeholder="0"
                />
              </div>
            </div>
            <Button onClick={addExpenseType} disabled={loading || !newExpenseType.name.trim()}>
              Add Expense Type
            </Button>
          </div>

          {/* Instructions */}
          <div className="rounded-lg bg-gray-500 p-4">
            <h3 className="mb-2 font-semibold text-blue-900">Instructions:</h3>
            <ul className="space-y-1 text-sm text-blue-800">
              <li>• Click "Debug Expense Types" to see current expense types and their rates</li>
              <li>
                • Click "Add Sample Expense Types" to add common expense types with correct rates
              </li>
              <li>• Or manually add expense types using the form above</li>
              <li>• Rates should be entered as percentages (e.g., 9 for 9%)</li>
              <li>
                • The system converts percentages to basis points for storage (9% = 900 basis
                points)
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
