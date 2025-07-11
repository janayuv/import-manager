// src/App.tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/layouts/AppLayout";
import { ThemeProvider } from "./components/layouts/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import SupplierPage from "./pages/SupplierPage";
import Home from "./pages/Home";

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            {/* Dashboard / landing */}
            <Route index element={<Home />} />

            {/* Supplier management */}
            <Route path="suppliers" element={<SupplierPage />} />

            {/* Add more pages here */}
            {/* <Route path="another-page" element={<AnotherPage />} /> */}
          </Route>
        </Routes>

        <Toaster
          position="top-right"
          richColors
          toastOptions={{ duration: 3000 }}
        />
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
