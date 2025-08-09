import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ThemeProvider } from "@/components/layout/theme-provider";
import { AppLayout } from "@/components/layout/AppLayout";
import SupplierPage from '@/pages/supplier';
import ShipmentPage from '@/pages/shipment';
import ItemMasterPage from '@/pages/item';
import InvoicePage from '@/pages/invoice';
import BOEPage from '@/pages/boe';
import BOEEntrypage from '@/pages/boe-entry';
import BoeSummaryPage from '@/pages/boe-summary';
import { LoginPage } from '@/pages/LoginPage'; // Corrected import name
import { Toaster } from '@/components/ui/sonner';
import DashboardPage from '@/pages/dashboard';

// A simple placeholder for pages you haven't created yet
const Placeholder = ({ title }: { title: string }) => (
    <div className="flex items-center justify-center h-full">
        <h1 className="text-4xl font-bold">{title}</h1>
    </div>
);

const ProtectedRoute = () => {
  const isAuthenticated = localStorage.getItem('isAuthenticated');
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

function App() {
  return (
    <ThemeProvider defaultTheme={{ mode: "light", color: "zinc" }} storageKey="import-manager-theme">
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
              <Route path="/expenses" element={<Placeholder title="Expenses" />} />
              <Route path="/report" element={<Placeholder title="Report" />} />
            </Route>
          </Route>
        </Routes>
      </Router>
      <Toaster position="top-right" richColors />
    </ThemeProvider>
  )
}

export default App;
