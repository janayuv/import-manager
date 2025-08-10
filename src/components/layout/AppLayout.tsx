import { Outlet } from 'react-router-dom'

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { useIsMobile } from '@/hooks/use-mobile'

import { AppSidebar } from './app-sidebar'
import { SiteHeader } from './site-header'

export function AppLayout() {
  const isMobile = useIsMobile()

  // Set defaultOpen to false on mobile to have it closed initially
  const defaultOpen = !isMobile

  return (
    // SidebarProvider manages the open/closed state
    <SidebarProvider defaultOpen={defaultOpen}>
      {/* AppSidebar is your main navigation component */}
      <AppSidebar />

      {/* SidebarInset pushes your main content to the right */}
      <SidebarInset>
        <SiteHeader />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
