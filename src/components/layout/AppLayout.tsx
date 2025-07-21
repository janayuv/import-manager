import { Outlet } from 'react-router-dom'
import { Navbar } from '@/components/layout/navbar'
import { Sidebar } from '@/components/layout/sidebar'
import { useState } from 'react'

export const AppLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="relative h-screen w-full min-w-[100vw] border-b bg-background px-4 flex items-center justify-between">
      {/* Sidebar */}
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />

      {/* Main content */}
      <div className="flex flex-col flex-1 h-screen">
        <Navbar onSidebarToggle={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 overflow-auto px-6 py-4">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
