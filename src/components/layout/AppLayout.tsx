import * as React from 'react';
import { Outlet } from 'react-router-dom';

import { BugTrackerRoot } from '@/components/bug-tracker/BugTrackerRoot';
import { useResponsiveContext } from '@/providers/ResponsiveProvider';

import { AppSidebar } from './app-sidebar';
import { SiteHeader } from './site-header';

export function AppLayout() {
  const { shouldShowSidebar } = useResponsiveContext();
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      <a
        href="#main-content"
        className="focus:bg-background focus:ring-ring sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:px-3 focus:py-2 focus:text-sm focus:outline-none focus:ring-2"
      >
        Skip to main content
      </a>
      {shouldShowSidebar && (
        <AppSidebar collapsed={collapsed} onCollapsedChange={setCollapsed} />
      )}
      <div className="flex flex-1 flex-col overflow-hidden">
        <SiteHeader onToggleSidebar={() => setCollapsed(c => !c)} />
        <main
          id="main-content"
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <Outlet />
        </main>
        <BugTrackerRoot />
      </div>
    </div>
  );
}
