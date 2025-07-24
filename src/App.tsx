// src/App.tsx (UPDATED)
// This file now reflects your requested structure and imports.
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from "@/components/layout/theme-provider";
import { AppLayout } from "@/components/layout/AppLayout";
import SupplierPage from '@/pages/supplier';
import ShipmentPage from '@/pages/shipment';
import ItemMasterPage from '@/pages/item';
import { Toaster } from '@/components/ui/sonner';

const Placeholder = ({ title }: { title: string }) => (
    <div className="flex items-center justify-center h-full">
        <h1 className="text-4xl font-bold">{title}</h1>
    </div>
);

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <Router>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<ShipmentPage />} />
            <Route path="/supplier" element={<SupplierPage />} />
            <Route path="/shipment" element={<ShipmentPage />} />
            <Route path="/invoice" element={<Placeholder title="Invoice" />} />
            <Route path="/item-master" element={<ItemMasterPage />} />
            <Route path="/boe" element={<Placeholder title="BOE" />} />
            <Route path="/expenses" element={<Placeholder title="Expenses" />} />
            <Route path="/report" element={<Placeholder title="Report" />} />
          </Route>
        </Routes>
      </Router>
      <Toaster />
    </ThemeProvider>
  )
}

export default App;