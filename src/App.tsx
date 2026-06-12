import React, { lazy, Suspense, useEffect, useState } from 'react';

import { safeInvoke as invoke } from '@/lib/ipc-safe';
import { Loader2 } from 'lucide-react';
import {
  Navigate,
  Outlet,
  Route,
  BrowserRouter as Router,
  Routes,
} from 'react-router-dom';

import { AsyncErrorBoundary, ErrorBoundary } from '@/components/error-boundary';
import { RequirePermission } from '@/components/auth/RequirePermission';
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
import {
  setAuthenticated,
  userFromDesktopSession,
  type DesktopSessionInfo,
} from '@/lib/auth';
import { isTauriEnvironment } from '@/lib/tauri-bridge';
import { captureErrorEvent } from '@/lib/error-memory';
import { LoginPage } from '@/pages/LoginPage';
import { SetupPage } from '@/pages/SetupPage';
import {
  AccountDetailsPage,
  AccountPasswordPage,
  AccountUpdatePage,
} from '@/pages/account';

const BOEPage = lazy(() => import('@/pages/boe'));
const BOEEntrypage = lazy(() => import('@/pages/boe-entry'));
const BoeSummaryPage = lazy(() => import('@/pages/boe-summary'));
const SavedBoePage = lazy(() => import('@/pages/saved-boe'));
const ExpenseDataManagerPage = lazy(
  () => import('@/pages/expense-data-manager')
);
const ExpenseReportsPage = lazy(() => import('@/pages/expense-reports'));
const ExpensesPage = lazy(() => import('@/pages/expenses'));
const FrozenShipmentsPage = lazy(() => import('@/pages/frozen-shipments'));
const InvoiceWizardPage = lazy(() => import('@/pages/invoice-wizard'));
const ItemMasterPage = lazy(() => import('@/pages/item'));
const ReportsPage = lazy(() => import('@/pages/reports'));
const SettingsPage = lazy(() => import('@/pages/settings'));
const SupplierPage = lazy(() => import('@/pages/supplier'));
const RecycleBin = lazy(() => import('@/pages/RecycleBin'));
const LogsPage = lazy(() => import('@/pages/Logs'));
const AdminActivityLogPage = lazy(() => import('@/pages/admin/activity-log'));
const AdminUserActivityPage = lazy(() => import('@/pages/admin/user-activity'));
const OperationsCenterPage = lazy(
  () => import('@/pages/admin/operations-center')
);

const DashboardPage = lazy(() => import('@/pages/dashboard'));
const ShipmentPage = lazy(() => import('@/pages/shipment'));
const InvoicePage = lazy(() => import('@/pages/invoice'));
const DatabaseManagement = lazy(() => import('@/pages/database-management'));
const AutomationRulesAdminPage = lazy(
  () => import('@/pages/admin/automation-rules')
);
const AdminSystemHealthPage = lazy(() => import('@/pages/admin/system-health'));
const AdminSystemToolsPage = lazy(() => import('@/pages/admin/system-tools'));
const AdminErrorCenterPage = lazy(() => import('@/pages/admin/error-center'));
const AdminAutomationCenterPage = lazy(
  () => import('@/pages/admin/automation-center')
);
const AdminSystemAgentPage = lazy(() => import('@/pages/admin/system-agent'));
const SecurityCenterPage = lazy(() => import('@/pages/admin/security-center'));
const RolesPermissionsPage = lazy(
  () => import('@/pages/admin/roles-permissions')
);
const NotificationsPage = lazy(() => import('@/pages/notifications'));

function RouteLoadingSpinner() {
  return (
    <div
      className="flex h-full min-h-[40vh] w-full items-center justify-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="text-muted-foreground h-10 w-10 animate-spin" />
    </div>
  );
}

const ProtectedRoute = () => {
  const [gate, setGate] = useState<'loading' | 'ok' | 'out'>('loading');

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!isTauriEnvironment) {
        const ok = localStorage.getItem('isAuthenticated') === 'true';
        if (!cancelled) {
          setGate(ok ? 'ok' : 'out');
        }
        return;
      }

      try {
        const session = await invoke<DesktopSessionInfo | null>(
          'get_desktop_session'
        );
        if (cancelled) {
          return;
        }
        if (!session) {
          setAuthenticated(false);
          setGate('out');
          return;
        }
        setAuthenticated(true, userFromDesktopSession(session));
        setGate('ok');
      } catch {
        if (!cancelled) {
          setAuthenticated(false);
          setGate('out');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (gate === 'loading') {
    return <RouteLoadingSpinner />;
  }
  if (gate === 'out') {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
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

  React.useEffect(() => {
    const onWindowError = (event: ErrorEvent) => {
      void captureErrorEvent({
        moduleName: 'frontend.runtime',
        pageName: window.location.pathname,
        componentName: 'window.onerror',
        errorCode: 'FE_RUNTIME_ERROR',
        errorCategory: 'ui_runtime',
        errorMessage: event.message || 'Unhandled window error',
        stackTrace: event.error?.stack,
        sourceFile: event.filename || undefined,
        sourceFunction: undefined,
        userAction: 'unhandled_error',
        severity: 'error',
        recoverable: false,
        retryable: false,
      });
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason =
        event.reason instanceof Error
          ? event.reason.message
          : String(event.reason ?? 'Unhandled promise rejection');
      const stack =
        event.reason instanceof Error ? event.reason.stack : undefined;
      void captureErrorEvent({
        moduleName: 'frontend.runtime',
        pageName: window.location.pathname,
        componentName: 'window.unhandledrejection',
        errorCode: 'FE_UNHANDLED_REJECTION',
        errorCategory: 'async_runtime',
        errorMessage: reason,
        stackTrace: stack,
        userAction: 'unhandled_promise_rejection',
        severity: 'error',
        recoverable: false,
        retryable: true,
      });
    };
    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
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
                    <Suspense fallback={<RouteLoadingSpinner />}>
                      <Routes>
                        <Route path="/setup" element={<SetupPage />} />
                        <Route path="/login" element={<LoginPage />} />
                        <Route element={<ProtectedRoute />}>
                          <Route element={<AppLayout />}>
                            <Route path="/" element={<DashboardPage />} />
                            <Route
                              path="/supplier/new"
                              element={<SupplierPage />}
                            />
                            <Route
                              path="/supplier/:supplierId/view"
                              element={<SupplierPage />}
                            />
                            <Route
                              path="/supplier/:supplierId/edit"
                              element={<SupplierPage />}
                            />
                            <Route
                              path="/supplier"
                              element={<SupplierPage />}
                            />
                            <Route
                              path="/shipment/:shipmentId/view"
                              element={<ShipmentPage />}
                            />
                            <Route
                              path="/shipment/:shipmentId/edit"
                              element={<ShipmentPage />}
                            />
                            <Route
                              path="/shipment"
                              element={<ShipmentPage />}
                            />
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
                            <Route
                              path="/boe-entry"
                              element={<BOEEntrypage />}
                            />
                            <Route
                              path="/boe-summary/:savedBoeId"
                              element={<BoeSummaryPage />}
                            />
                            <Route
                              path="/boe-summary"
                              element={<BoeSummaryPage />}
                            />
                            <Route
                              path="/saved-boe"
                              element={<SavedBoePage />}
                            />
                            <Route
                              path="/saved-boe/:savedBoeId/:mode"
                              element={<SavedBoePage />}
                            />
                            <Route
                              path="/expenses"
                              element={<ExpensesPage />}
                            />
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
                              path="/notifications"
                              element={<NotificationsPage />}
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
                            <Route
                              path="/settings"
                              element={<SettingsPage />}
                            />
                            <Route
                              path="/database-management"
                              element={<DatabaseManagement />}
                            />
                            <Route
                              element={
                                <RequirePermission permission="admin.activity_log" />
                              }
                            >
                              <Route
                                path="/admin/activity-log"
                                element={<AdminActivityLogPage />}
                              />
                            </Route>
                            <Route
                              element={
                                <RequirePermission permission="admin.user_activity" />
                              }
                            >
                              <Route
                                path="/admin/user-activity"
                                element={<AdminUserActivityPage />}
                              />
                            </Route>
                            <Route
                              element={
                                <RequirePermission permission="admin.system_health" />
                              }
                            >
                              <Route
                                path="/admin/system-health"
                                element={<AdminSystemHealthPage />}
                              />
                            </Route>
                            <Route
                              element={
                                <RequirePermission permission="admin.system_tools" />
                              }
                            >
                              <Route
                                path="/admin/system-tools"
                                element={<AdminSystemToolsPage />}
                              />
                              <Route
                                path="/admin/error-center"
                                element={<AdminErrorCenterPage />}
                              />
                            </Route>
                            <Route
                              element={
                                <RequirePermission permission="automation.view" />
                              }
                            >
                              <Route
                                path="/admin/automation-center"
                                element={<AdminAutomationCenterPage />}
                              />
                              <Route
                                path="/admin/automation-rules"
                                element={<AutomationRulesAdminPage />}
                              />
                            </Route>
                            <Route
                              element={
                                <RequirePermission permission="automation.system_agent" />
                              }
                            >
                              <Route
                                path="/admin/system-agent"
                                element={<AdminSystemAgentPage />}
                              />
                            </Route>
                            <Route
                              element={
                                <RequirePermission permission="automation.ops_center" />
                              }
                            >
                              <Route
                                path="/admin/operations-center"
                                element={<OperationsCenterPage />}
                              />
                            </Route>
                            <Route
                              element={
                                <RequirePermission permission="security.session_read" />
                              }
                            >
                              <Route
                                path="/admin/security-center"
                                element={<SecurityCenterPage />}
                              />
                            </Route>
                            <Route
                              element={
                                <RequirePermission permission="role.read" />
                              }
                            >
                              <Route
                                path="/admin/roles-permissions"
                                element={<RolesPermissionsPage />}
                              />
                            </Route>
                            <Route
                              path="/recycle-bin"
                              element={<RecycleBin />}
                            />
                            <Route path="/logs" element={<LogsPage />} />
                          </Route>
                        </Route>
                      </Routes>
                    </Suspense>
                  </Router>
                </ErrorBoundary>
                <Toaster />
              </ResponsiveProvider>
            </NotificationProvider>
          </UserProvider>
        </SettingsProvider>
      </AsyncErrorBoundary>
    </ThemeProvider>
  );
}

export default App;
