// src/components/layout/index.tsx
// This component orchestrates the layout, managing the state for the sidebar.
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './sidebar';
import { Navbar } from './navbar';

const Layout = () => {
  const [isSidebarOpen, setSidebarOpen] = useState(true);

  const toggleSidebar = () => {
    setSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar isOpen={isSidebarOpen} />
      <div className="flex flex-col flex-1">
        <Navbar onSidebarToggle={toggleSidebar} />
        <main className="flex-1 p-4 overflow-y-auto">
          <Outlet /> {/* This is where the content of your pages will be rendered */}
        </main>
      </div>
    </div>
  );
};

export default Layout;