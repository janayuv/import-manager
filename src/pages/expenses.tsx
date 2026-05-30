import { safeInvoke as invoke } from '@/lib/ipc-safe';

import { useCallback, useEffect, useState } from 'react';

import { useUnifiedNotifications } from '@/hooks/useUnifiedNotifications';

import { ModuleErrorBoundary } from '@/components/error-boundary';
import { ErrorContexts, useErrorHandler } from '@/components/error-boundary';
import ExpenseForm from '@/components/expenses/expense-form';
import ExpenseImport from '@/components/expenses/expense-import';
import ExpenseList from '@/components/expenses/expense-list';
import { ExpenseMultilineForm } from '@/components/expenses/expense-multiline-form';
import ExpenseReports from '@/components/expenses/expense-reports';
import ShipmentSelector from '@/components/expenses/shipment-selector';
import { AppBar, PageHeader } from '@/components/shared/im';
import { formatText } from '@/lib/settings';
import { useSettings } from '@/lib/use-settings';
import type {
  ExpenseType,
  ExpenseWithInvoice,
  ServiceProvider,
} from '@/types/expense';
import type { Shipment } from '@/types/shipment';

const ExpensesPage = () => {
  const { settings } = useSettings();
  const notifications = useUnifiedNotifications();
  const { handleAsyncError } = useErrorHandler({
    fallbackMessage: 'Failed to load expenses data',
  });

  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(
    null
  );
  const [expenseToEdit, setExpenseToEdit] = useState<ExpenseWithInvoice | null>(
    null
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [serviceProviders, setServiceProviders] = useState<ServiceProvider[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(true);
  const [showMultilineForm, setShowMultilineForm] = useState(false);
  const [activeTab, setActiveTab] = useState('manage');

  const handleFormSubmit = useCallback(() => {
    setExpenseToEdit(null);
    setRefreshKey(prevKey => prevKey + 1);
    // Keep success handled within form to avoid duplicates
  }, []);

  const handleEdit = (expense: ExpenseWithInvoice) => {
    setExpenseToEdit(expense);
  };

  const handleDelete = () => {
    setRefreshKey(prevKey => prevKey + 1);
  };

  const handleCancelEdit = () => {
    setExpenseToEdit(null);
  };

  const handleShipmentChange = (shipment: Shipment | null) => {
    setSelectedShipment(shipment);
    setExpenseToEdit(null);
    setShowMultilineForm(false);
  };

  const handleMultilineSuccess = () => {
    setShowMultilineForm(false);
    setRefreshKey(prevKey => prevKey + 1);
  };

  const handleMultilineCancel = () => {
    setShowMultilineForm(false);
  };

  // Load real data from backend
  useEffect(() => {
    const loadData = async () => {
      const result = await handleAsyncError(async () => {
        const [shipmentsData, expenseTypesData, serviceProvidersData] =
          await Promise.all([
            invoke<Shipment[]>('get_shipments'),
            invoke<ExpenseType[]>('get_expense_types'),
            invoke<ServiceProvider[]>('get_service_providers'),
          ]);

        setShipments(shipmentsData);
        setExpenseTypes(expenseTypesData);
        setServiceProviders(serviceProvidersData);
        return { shipmentsData, expenseTypesData, serviceProvidersData };
      }, ErrorContexts.dataFetch('ExpensesPage'));

      if (result) {
        setIsLoading(false);
        // Data loaded silently - no notification needed for initial load
      }
    };

    loadData();
  }, [handleAsyncError, notifications]);

  const handleRefresh = useCallback(async () => {
    notifications.loading('Refreshing expense data...');
    try {
      const [shipmentsData, expenseTypesData, serviceProvidersData] =
        await Promise.all([
          invoke<Shipment[]>('get_shipments'),
          invoke<ExpenseType[]>('get_expense_types'),
          invoke<ServiceProvider[]>('get_service_providers'),
        ]);

      setShipments(shipmentsData);
      setExpenseTypes(expenseTypesData);
      setServiceProviders(serviceProvidersData);
      setRefreshKey(prevKey => prevKey + 1);
      notifications.success(
        'Refresh Complete',
        'Expense data refreshed successfully'
      );
    } catch (error) {
      console.error('Failed to refresh expense data:', error);
      notifications.expense.error('refresh data', String(error));
    }
  }, [notifications]);

  const handleImportSuccess = () => {
    setRefreshKey(prevKey => prevKey + 1);
  };

  return (
    <ModuleErrorBoundary
      moduleName="Expenses"
      showDetails={process.env.NODE_ENV === 'development'}
    >
      <div className="im-page">
        <AppBar crumbs={['Import Manager', 'Expenses']} />
        <PageHeader
          title="Manage Expenses"
          subtitle="Track and manage expenses for your shipments"
          actions={
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                className="im-btn im-btn--sm im-btn--primary"
                onClick={handleRefresh}
              >
                Refresh Data
              </button>
              {selectedShipment && (
                <div className="text-right">
                  <span
                    className="im-badge is-neutral"
                    style={{ fontSize: 13 }}
                  >
                    Shipment:{' '}
                    {formatText(
                      selectedShipment.invoiceNumber,
                      settings.textFormat
                    )}
                  </span>
                  <p
                    style={{
                      color: 'var(--color-im-muted)',
                      marginTop: 4,
                      fontSize: 12,
                    }}
                  >
                    BL/AWB:{' '}
                    {formatText(
                      selectedShipment.blAwbNumber,
                      settings.textFormat
                    )}
                  </p>
                </div>
              )}
            </div>
          }
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
          }}
        >
          {isLoading ? (
            <div className="py-12 text-center">
              <div className="mx-auto max-w-md">
                <div className="mb-4 text-6xl">⏳</div>
                <h3 className="mb-2 text-xl font-semibold">Loading...</h3>
                <p style={{ color: 'var(--color-im-muted)' }}>
                  Please wait while we load the expense data.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="im-tabs">
                <button
                  type="button"
                  className={`im-tab${activeTab === 'manage' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('manage')}
                >
                  Manage Expenses
                </button>
                <button
                  type="button"
                  className={`im-tab${activeTab === 'import' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('import')}
                >
                  Import Expenses
                </button>
              </div>

              <div
                className="im-dashboard-body"
                style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
              >
                {activeTab === 'manage' && (
                  <>
                    <div style={{ marginBottom: 8 }}>
                      <label
                        className="im-field-label"
                        style={{ marginBottom: 8, display: 'block' }}
                      >
                        Select Shipment
                      </label>
                      <ShipmentSelector
                        selectedShipment={selectedShipment}
                        setSelectedShipment={handleShipmentChange}
                      />
                    </div>

                    <hr
                      style={{
                        border: 'none',
                        borderTop: '1px solid var(--color-im-rule)',
                        margin: '12px 0',
                      }}
                    />

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
                                  {formatText(
                                    selectedShipment.invoiceNumber,
                                    settings.textFormat
                                  )}
                                </h2>
                                <div className="flex items-center gap-2">
                                  {expenseToEdit && (
                                    <span className="im-badge is-neutral">
                                      Editing Expense
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    className="im-btn im-btn--primary im-btn--sm"
                                    onClick={() => setShowMultilineForm(true)}
                                  >
                                    Add Multiple Expenses
                                  </button>
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
                                <div className="im-section">
                                  <div
                                    className="im-section__body"
                                    style={{
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: 12,
                                    }}
                                  >
                                    {selectedShipment && (
                                      <div className="flex items-center justify-between">
                                        <span
                                          className="im-badge is-neutral"
                                          style={{ fontSize: 11 }}
                                        >
                                          {formatText(
                                            selectedShipment.invoiceNumber,
                                            settings.textFormat
                                          )}
                                        </span>
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
                          </div>
                        )}

                        <hr
                          style={{
                            border: 'none',
                            borderTop: '1px solid var(--color-im-rule)',
                            margin: '12px 0',
                          }}
                        />

                        <div>
                          <h2 className="mb-4 text-2xl font-semibold">
                            Reports for Invoice:{' '}
                            {formatText(
                              selectedShipment.invoiceNumber,
                              settings.textFormat
                            )}
                          </h2>
                          <ExpenseReports shipmentId={selectedShipment.id} />
                        </div>
                      </>
                    )}

                    {!selectedShipment && (
                      <div className="py-12 text-center">
                        <div className="mx-auto max-w-md">
                          <div className="mb-4 text-6xl">📦</div>
                          <h3 className="mb-2 text-xl font-semibold">
                            No Shipment Selected
                          </h3>
                          <p
                            style={{
                              color: 'var(--color-im-muted)',
                              marginBottom: 16,
                            }}
                          >
                            Please select a shipment from the dropdown above to
                            start managing expenses.
                          </p>
                          <p
                            style={{
                              color: 'var(--color-im-muted)',
                              fontSize: 13,
                            }}
                          >
                            You can add, edit, and delete expenses for the
                            selected shipment.
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {activeTab === 'import' && (
                  <ExpenseImport
                    shipments={shipments}
                    expenseTypes={expenseTypes}
                    serviceProviders={serviceProviders}
                    onImportSuccess={handleImportSuccess}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </ModuleErrorBoundary>
  );
};

export default ExpensesPage;
