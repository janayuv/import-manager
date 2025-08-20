import { Package2 } from 'lucide-react'

import * as React from 'react'

import { Separator } from '@/components/ui/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

import { navItems } from './nav-data'
import { NavMain } from './nav-main'
import { NavUser } from './nav-user'
import { useUser } from '@/lib/user-context'

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useUser()

  // Fallback user data if no user is logged in
  const userData = user
    ? {
        name: user.name,
        email: user.email,
        avatar: user.avatar || '/avatars/placeholder.jpg',
      }
    : {
        name: 'Guest User',
        email: 'guest@importmanager.com',
        avatar: '/avatars/placeholder.jpg',
      }

  return (
    <Sidebar className="h-full" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="/">
                <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Package2 className="size-5" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Import Manager</span>
                  <span className="text-muted-foreground truncate text-xs">by JANA</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* NavMain now uses your app's navigation items */}
        <NavMain items={navItems} />
      </SidebarContent>

      <SidebarFooter>
        <Separator className="my-2" />
        <NavUser user={userData} />
      </SidebarFooter>
    </Sidebar>
  )
}
