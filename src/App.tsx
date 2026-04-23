import React from 'react';

import {
  Navigate,
  Outlet,
  Route,
  BrowserRouter as Router,
  Routes,
} from 'react-router-dom';

import { AsyncErrorBoundary, ErrorBoundary } from '@/components/error-boundary';
import { AppLayout } from '@/components/layout/AppLayout';
import { ThemeProvider } from '@/components/layout/theme-provider';
// Corrected import name
import { Toaster } from '@/components/ui/sonner';
import { validateBuildMetadata } from '@/lib/build-metadata';
import { initializePerformanceMonitoring } from '@/lib/performance';
import { logStartupContextOnce } from '@/lib/startup-log';
import { runVersionConsistencyCheck } from '@/lib/version-check';
import { SettingsProvider } from '@/lib/settings-context';
import { UserProvider } from '@/lib/user-context';
import { ResponsiveProvider } from '@/providers/ResponsiveProvider';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { LoginPage } from '@/pages/LoginPage';
import {
  AccountDetailsPage,
  AccountPasswordPage,
  AccountUpdatePage,
} from '@/pages/account';
import BOEPage from '@/pages/boe';
import BOEEntrypage from '@/pages/boe-entry';
import BoeSummaryPage from '@/pages/boe-summary';
import DashboardPage from '@/pages/dashboard';
import ExpenseDataManagerPage from '@/pages/expense-data-manager';
import ExpenseReportsPage from '@/pages/expense-reports';
import ExpensesPage from '@/pages/expenses';
import FrozenShipmentsPage from '@/pages/frozen-shipments';
import InvoicePage from '@/pages/invoice';
import InvoiceWizardPage from '@/pages/invoice-wizard';
import ItemMasterPage from '@/pages/item';
import ReportsPage from '@/pages/reports';
import SettingsPage from '@/pages/settings';
import ShipmentPage from '@/pages/shipment';
import SupplierPage from '@/pages/supplier';
import DatabaseManagement from '@/pages/database-management';
import RecycleBin from '@/pages/RecycleBin';
import LogsPage from '@/pages/Logs';

const ProtectedRoute = () => {
  const isAuthenticated = localStorage.getItem('isAuthenticated');
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

function App() {
  // Initialize performance monitoring
  React.useEffect(() => {
    initializePerformanceMonitoring();
  }, []);

  React.useEffect(() => {
    validateBuildMetadata();
    void runVersionConsistencyCheck();
    logStartupContextOnce();
  }, []);

  return (
    <ThemeProvider
      defaultTheme={{ mode: 'light', color: 'zinc' }}
      storageKey="import-manager-theme"
    >
      <AsyncErrorBoundary componentName="App">
        <SettingsProvider>
          <UserProvider>
            <NotificationProvider>
              <ResponsiveProvider>
                <ErrorBoundary
                  componentName="App"
                  showDetails={process.env.NODE_ENV === 'development'}
                >
                  <Router>
                    <Routes>
                      <Route path="/login" element={<LoginPage />} />
                      <Route element={<ProtectedRoute />}>
                        <Route element={<AppLayout />}>
                          <Route path="/" element={<DashboardPage />} />
                          <Route
                            path="/supplier/:supplierId/view"
                            element={<SupplierPage />}
                          />
                          <Route
                            path="/supplier/:supplierId/edit"
                            element={<SupplierPage />}
                          />
                          <Route path="/supplier" element={<SupplierPage />} />
                          <Route
                            path="/shipment/:shipmentId/view"
                            element={<ShipmentPage />}
                          />
                          <Route
                            path="/shipment/:shipmentId/edit"
                            element={<ShipmentPage />}
                          />
                          <Route path="/shipment" element={<ShipmentPage />} />
                          <Route
                            path="/invoice/:invoiceId/view"
                            element={<InvoicePage />}
                          />
                          <Route
                            path="/invoice/:invoiceId/edit"
                            element={<InvoicePage />}
                          />
                          <Route path="/invoice" element={<InvoicePage />} />
                          <Route
                            path="/invoice-wizard"
                            element={<InvoiceWizardPage />}
                          />

                          <Route
                            path="/item-master/new"
                            element={<ItemMasterPage />}
                          />
                          <Route
                            path="/item-master/:itemId/view"
                            element={<ItemMasterPage />}
                          />
                          <Route
                            path="/item-master/:itemId/edit"
                            element={<ItemMasterPage />}
                          />
                          <Route
                            path="/item-master"
                            element={<ItemMasterPage />}
                          />
                          <Route path="/boe/new" element={<BOEPage />} />
                          <Route
                            path="/boe/:boeId/view"
                            element={<BOEPage />}
                          />
                          <Route
                            path="/boe/:boeId/edit"
                            element={<BOEPage />}
                          />
                          <Route path="/boe" element={<BOEPage />} />
                          <Route
                            path="/boe-entry/new"
                            element={<BOEEntrypage />}
                          />
                          <Route
                            path="/boe-entry/:savedBoeId/view"
                            element={<BOEEntrypage />}
                          />
                          <Route
                            path="/boe-entry/:savedBoeId/edit"
                            element={<BOEEntrypage />}
                          />
                          <Route path="/boe-entry" element={<BOEEntrypage />} />
                          <Route
                            path="/boe-summary/:savedBoeId"
                            element={<BoeSummaryPage />}
                          />
                          <Route
                            path="/boe-summary"
                            element={<BoeSummaryPage />}
                          />
                          <Route path="/expenses" element={<ExpensesPage />} />
                          <Route
                            path="/expense-reports"
                            element={<ExpenseReportsPage />}
                          />
                          <Route
                            path="/expense-data-manager"
                            element={<ExpenseDataManagerPage />}
                          />
                          <Route
                            path="/frozen-shipments"
                            element={<FrozenShipmentsPage />}
                          />
                          <Route path="/report" element={<ReportsPage />} />
                          <Route
                            path="/frozen-shipments"
                            element={<FrozenShipmentsPage />}
                          />
                          <Route
                            path="/account"
                            element={<AccountDetailsPage />}
                          />
                          <Route
                            path="/account/update"
                            element={<AccountUpdatePage />}
                          />
                          <Route
                            path="/account/password"
                            element={<AccountPasswordPage />}
                          />
                          <Route path="/settings" element={<SettingsPage />} />
                          <Route
                            path="/database-management"
                            element={<DatabaseManagement />}
                          />
                          <Route path="/recycle-bin" element={<RecycleBin />} />
                          <Route path="/logs" element={<LogsPage />} />
                        </Route>
                      </Route>
                    </Routes>
                  </Router>
                </ErrorBoundary>
                <Toaster position="top-right" richColors />
              </ResponsiveProvider>
            </NotificationProvider>
          </UserProvider>
        </SettingsProvider>
      </AsyncErrorBoundary>
    </ThemeProvider>
  );
}

export default App;
