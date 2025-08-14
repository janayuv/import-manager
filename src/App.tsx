import { Navigate, Outlet, Route, BrowserRouter as Router, Routes } from 'react-router-dom'

import { AppLayout } from '@/components/layout/AppLayout'
import { ThemeProvider } from '@/components/layout/theme-provider'
// Corrected import name
import { Toaster } from '@/components/ui/sonner'
import { LoginPage } from '@/pages/LoginPage'
import { AccountDetailsPage, AccountPasswordPage, AccountUpdatePage } from '@/pages/account'
import BOEPage from '@/pages/boe'
import BOEEntrypage from '@/pages/boe-entry'
import BoeSummaryPage from '@/pages/boe-summary'
import DashboardPage from '@/pages/dashboard'
import ReportsPage from '@/pages/reports'
import ExpensesPage from '@/pages/expenses'
import FrozenShipmentsPage from '@/pages/frozen-shipments'
import InvoicePage from '@/pages/invoice'
import ItemMasterPage from '@/pages/item'
import ShipmentPage from '@/pages/shipment'
import SupplierPage from '@/pages/supplier'
import SettingsPage from '@/pages/settings'
import { SettingsProvider } from '@/lib/settings-context'

const ProtectedRoute = () => {
  const isAuthenticated = localStorage.getItem('isAuthenticated')
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
}

function App() {
  return (
    <ThemeProvider
      defaultTheme={{ mode: 'light', color: 'zinc' }}
      storageKey="import-manager-theme"
    >
      <SettingsProvider>
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
        <Toaster position="top-right" richColors />
      </SettingsProvider>
    </ThemeProvider>
  )
}

export default App
