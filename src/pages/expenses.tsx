import { invoke } from '@tauri-apps/api/core'

import { useCallback, useEffect, useState } from 'react'

import { ModuleErrorBoundary } from '@/components/error-boundary'
import { ErrorContexts, useErrorHandler } from '@/components/error-boundary'
import { ExpenseDebug } from '@/components/expenses/expense-debug'
import ExpenseForm from '@/components/expenses/expense-form'
import ExpenseImport from '@/components/expenses/expense-import'
import ExpenseList from '@/components/expenses/expense-list'
import { ExpenseMultilineForm } from '@/components/expenses/expense-multiline-form'
import ExpenseReports from '@/components/expenses/expense-reports'
import ShipmentSelector from '@/components/expenses/shipment-selector'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatText } from '@/lib/settings'
import { useSettings } from '@/lib/use-settings'
import type { ExpenseType, ExpenseWithInvoice, ServiceProvider } from '@/types/expense'
import type { Shipment } from '@/types/shipment'

const ExpensesPage = () => {
  const { settings } = useSettings()
  const { handleAsyncError } = useErrorHandler({
    fallbackMessage: 'Failed to load expenses data',
  })

  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null)
  const [expenseToEdit, setExpenseToEdit] = useState<ExpenseWithInvoice | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([])
  const [serviceProviders, setServiceProviders] = useState<ServiceProvider[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showMultilineForm, setShowMultilineForm] = useState(false)

  const handleFormSubmit = useCallback(() => {
    setExpenseToEdit(null)
    setRefreshKey((prevKey) => prevKey + 1)
    // Keep success handled within form to avoid duplicates
  }, [])

  const handleEdit = (expense: ExpenseWithInvoice) => {
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
    setShowMultilineForm(false)
  }

  const handleMultilineSuccess = () => {
    setShowMultilineForm(false)
    setRefreshKey((prevKey) => prevKey + 1)
  }

  const handleMultilineCancel = () => {
    setShowMultilineForm(false)
  }

  // Load real data from backend
  useEffect(() => {
    const loadData = async () => {
      const result = await handleAsyncError(async () => {
        const [shipmentsData, expenseTypesData, serviceProvidersData] = await Promise.all([
          invoke<Shipment[]>('get_shipments'),
          invoke<ExpenseType[]>('get_expense_types'),
          invoke<ServiceProvider[]>('get_service_providers'),
        ])

        setShipments(shipmentsData)
        setExpenseTypes(expenseTypesData)
        setServiceProviders(serviceProvidersData)
        return { shipmentsData, expenseTypesData, serviceProvidersData }
      }, ErrorContexts.dataFetch('ExpensesPage'))

      if (result) {
        setIsLoading(false)
      }
    }

    loadData()
  }, [handleAsyncError])

  const handleImportSuccess = () => {
    setRefreshKey((prevKey) => prevKey + 1)
  }

  return (
    <ModuleErrorBoundary moduleName="Expenses" showDetails={process.env.NODE_ENV === 'development'}>
      <div className="container mx-auto py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Manage Expenses</h1>
            <p className="text-muted-foreground mt-1">
              Track and manage expenses for your shipments
            </p>
          </div>
          {selectedShipment && (
            <div className="text-right">
              <Badge variant="outline" className="text-sm">
                Shipment: {formatText(selectedShipment.invoiceNumber, settings.textFormat)}
              </Badge>
              <p className="text-muted-foreground mt-1 text-xs">
                BL/AWB: {formatText(selectedShipment.blAwbNumber, settings.textFormat)}
              </p>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="py-12 text-center">
            <div className="mx-auto max-w-md">
              <div className="mb-4 text-6xl">⏳</div>
              <h3 className="mb-2 text-xl font-semibold">Loading...</h3>
              <p className="text-muted-foreground">Please wait while we load the expense data.</p>
            </div>
          </div>
        ) : (
          <Tabs defaultValue="manage" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="manage">Manage Expenses</TabsTrigger>
              <TabsTrigger value="import">Import Expenses</TabsTrigger>
              <TabsTrigger value="debug">Debug & Setup</TabsTrigger>
            </TabsList>

            <TabsContent value="manage" className="space-y-6">
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
                  {showMultilineForm ? (
                    <ExpenseMultilineForm
                      shipmentId={selectedShipment.id}
                      onSuccess={handleMultilineSuccess}
                      onCancel={handleMultilineCancel}
                    />
                  ) : (
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                      <div className="lg:col-span-2">
                        <div className="mb-4 flex items-center justify-between">
                          <h2 className="text-2xl font-semibold">
                            Expenses for Invoice:{' '}
                            {formatText(selectedShipment.invoiceNumber, settings.textFormat)}
                          </h2>
                          <div className="flex items-center gap-2">
                            {expenseToEdit && <Badge variant="secondary">Editing Expense</Badge>}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowMultilineForm(true)}
                            >
                              Add Multiple Expenses
                            </Button>
                          </div>
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
                                  {formatText(selectedShipment.invoiceNumber, settings.textFormat)}
                                </Badge>
                              </div>
                            )}
                            <h2 className="mb-4 text-xl font-semibold">
                              {expenseToEdit ? 'Edit' : 'Add'} Expense
                            </h2>
                            <ExpenseForm
                              expenseToEdit={expenseToEdit}
                              onFormSubmit={handleFormSubmit}
                              onCancelEdit={handleCancelEdit}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <Separator className="my-6" />

                  <div>
                    <h2 className="mb-4 text-2xl font-semibold">
                      Reports for Invoice:{' '}
                      {formatText(selectedShipment.invoiceNumber, settings.textFormat)}
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
            </TabsContent>

            <TabsContent value="import" className="space-y-6">
              <ExpenseImport
                shipments={shipments}
                expenseTypes={expenseTypes}
                serviceProviders={serviceProviders}
                onImportSuccess={handleImportSuccess}
              />
            </TabsContent>

            <TabsContent value="debug" className="space-y-6">
              <ExpenseDebug />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </ModuleErrorBoundary>
  )
}

export default ExpensesPage
