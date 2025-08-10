import { useCallback, useState } from 'react'

import ExpenseForm from '@/components/expenses/expense-form'
import ExpenseList from '@/components/expenses/expense-list'
import ExpenseReports from '@/components/expenses/expense-reports'
import ShipmentSelector from '@/components/expenses/shipment-selector'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import type { Expense } from '@/types/expense'
import type { Shipment } from '@/types/shipment'

const ExpensesPage = () => {
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null)
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const handleFormSubmit = useCallback(() => {
    setExpenseToEdit(null)
    setRefreshKey((prevKey) => prevKey + 1)
    // Keep success handled within form to avoid duplicates
  }, [])

  const handleEdit = (expense: Expense) => {
    setExpenseToEdit(expense)
  }

  const handleDelete = () => {
    setRefreshKey((prevKey) => prevKey + 1)
  }

  const handleCancelEdit = () => {
    setExpenseToEdit(null)
  }

  const handleShipmentChange = (shipment: Shipment | null) => {
    setSelectedShipment(shipment)
    setExpenseToEdit(null)
  }

  return (
    <div className="container mx-auto py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Manage Expenses</h1>
          <p className="text-muted-foreground mt-1">Track and manage expenses for your shipments</p>
        </div>
        {selectedShipment && (
          <div className="text-right">
            <Badge variant="outline" className="text-sm">
              Shipment: {selectedShipment.invoiceNumber}
            </Badge>
            <p className="text-muted-foreground mt-1 text-xs">
              BL/AWB: {selectedShipment.blAwbNumber}
            </p>
          </div>
        )}
      </div>

      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium">Select Shipment</label>
        <ShipmentSelector
          selectedShipment={selectedShipment}
          setSelectedShipment={handleShipmentChange}
        />
      </div>

      <Separator className="my-6" />

      {selectedShipment && (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-2xl font-semibold">
                  Expenses for Invoice: {selectedShipment.invoiceNumber}
                </h2>
                {expenseToEdit && <Badge variant="secondary">Editing Expense</Badge>}
              </div>
              <ExpenseList
                shipmentId={selectedShipment.id}
                onEdit={handleEdit}
                onDelete={handleDelete}
                refreshKey={refreshKey}
              />
            </div>
            <div className="lg:col-span-1">
              <div className="sticky top-6">
                <div className="bg-card space-y-3 rounded-lg border p-6">
                  {selectedShipment && (
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs">
                        {selectedShipment.invoiceNumber}
                      </Badge>
                    </div>
                  )}
                  <h2 className="mb-4 text-xl font-semibold">
                    {expenseToEdit ? 'Edit' : 'Add'} Expense
                  </h2>
                  <ExpenseForm
                    shipmentId={selectedShipment.id}
                    expenseToEdit={expenseToEdit}
                    onFormSubmit={handleFormSubmit}
                    onCancelEdit={handleCancelEdit}
                  />
                </div>
              </div>
            </div>
          </div>

          <Separator className="my-6" />

          <div>
            <h2 className="mb-4 text-2xl font-semibold">
              Reports for Invoice: {selectedShipment.invoiceNumber}
            </h2>
            <ExpenseReports shipmentId={selectedShipment.id} />
          </div>
        </>
      )}

      {!selectedShipment && (
        <div className="py-12 text-center">
          <div className="mx-auto max-w-md">
            <div className="mb-4 text-6xl">📦</div>
            <h3 className="mb-2 text-xl font-semibold">No Shipment Selected</h3>
            <p className="text-muted-foreground mb-4">
              Please select a shipment from the dropdown above to start managing expenses.
            </p>
            <p className="text-muted-foreground text-sm">
              You can add, edit, and delete expenses for the selected shipment.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default ExpensesPage
