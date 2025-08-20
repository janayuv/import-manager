import React from 'react'
import { Navigate, Outlet, Route, BrowserRouter as Router, Routes } from 'react-router-dom'

import { AppLayout } from '@/components/layout/AppLayout'
import { ThemeProvider } from '@/components/layout/theme-provider'
// Corrected import name
import { Toaster } from '@/components/ui/sonner'
import { ErrorBoundary, AsyncErrorBoundary } from '@/components/error-boundary'
import { initializePerformanceMonitoring } from '@/lib/performance'
import { LoginPage } from '@/pages/LoginPage'
import { AccountDetailsPage, AccountPasswordPage, AccountUpdatePage } from '@/pages/account'
import BOEPage from '@/pages/boe'
import BOEEntrypage from '@/pages/boe-entry'
import BoeSummaryPage from '@/pages/boe-summary'
import DashboardPage from '@/pages/dashboard'
import ReportsPage from '@/pages/reports'
import ExpensesPage from '@/pages/expenses'
import ExpenseReportsPage from '@/pages/expense-reports'
import ExpenseDataManagerPage from '@/pages/expense-data-manager'
import FrozenShipmentsPage from '@/pages/frozen-shipments'
import InvoicePage from '@/pages/invoice'

import ItemMasterPage from '@/pages/item'
import ShipmentPage from '@/pages/shipment'
import SupplierPage from '@/pages/supplier'
import SettingsPage from '@/pages/settings'
import { SettingsProvider } from '@/lib/settings-context'
import { UserProvider } from '@/lib/user-context'

const ProtectedRoute = () => {
  const isAuthenticated = localStorage.getItem('isAuthenticated')
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
}

function App() {
  // Initialize performance monitoring
  React.useEffect(() => {
    initializePerformanceMonitoring()
  }, [])

  return (
    <AsyncErrorBoundary componentName="App">
      <ThemeProvider
        defaultTheme={{ mode: 'light', color: 'zinc' }}
        storageKey="import-manager-theme"
      >
        <SettingsProvider>
          <UserProvider>
            <ErrorBoundary componentName="App" showDetails={process.env.NODE_ENV === 'development'}>
              <Router>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route element={<ProtectedRoute />}>
                    <Route element={<AppLayout />}>
                      <Route path="/" element={<DashboardPage />} />
                      <Route path="/supplier" element={<SupplierPage />} />
                      <Route path="/shipment" element={<ShipmentPage />} />
                      <Route path="/invoice" element={<InvoicePage />} />

                      <Route path="/item-master" element={<ItemMasterPage />} />
                      <Route path="/boe" element={<BOEPage />} />
                      <Route path="/boe-entry" element={<BOEEntrypage />} />
                      <Route path="/boe-summary" element={<BoeSummaryPage />} />
                      <Route path="/expenses" element={<ExpensesPage />} />
                      <Route path="/expense-reports" element={<ExpenseReportsPage />} />
                      <Route path="/expense-data-manager" element={<ExpenseDataManagerPage />} />
                      <Route path="/frozen-shipments" element={<FrozenShipmentsPage />} />
                      <Route path="/report" element={<ReportsPage />} />
                      <Route path="/frozen-shipments" element={<FrozenShipmentsPage />} />
                      <Route path="/account" element={<AccountDetailsPage />} />
                      <Route path="/account/update" element={<AccountUpdatePage />} />
                      <Route path="/account/password" element={<AccountPasswordPage />} />
                      <Route path="/settings" element={<SettingsPage />} />
                    </Route>
                  </Route>
                </Routes>
              </Router>
            </ErrorBoundary>
            <Toaster position="top-right" richColors />
          </UserProvider>
        </SettingsProvider>
      </ThemeProvider>
    </AsyncErrorBoundary>
  )
}

export default App
