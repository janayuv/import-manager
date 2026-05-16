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
      {shouldShowSidebar && (
        <AppSidebar collapsed={collapsed} onCollapsedChange={setCollapsed} />
      )}
      <div className="flex flex-1 flex-col overflow-hidden">
        <SiteHeader onToggleSidebar={() => setCollapsed(c => !c)} />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </main>
        <BugTrackerRoot />
      </div>
    </div>
  );
}
