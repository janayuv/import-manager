// src/components/layout/index.tsx

import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';

export const Layout = () => {
  // This state should already exist
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    return JSON.parse(localStorage.getItem('sidebarOpen') || 'true');
  });

  // ---- ADD THIS FUNCTION ----
  const handleToggleSidebar = () => {
    setIsSidebarOpen((prev: boolean) => !prev);
  };

  return (
    <TooltipProvider>
      <div className="flex min-h-screen">
        {/* ---- UPDATE THIS LINE ---- */}
        <Sidebar open={isSidebarOpen} onToggle={handleToggleSidebar} />

        <main className="flex-1 p-4">
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  );
};