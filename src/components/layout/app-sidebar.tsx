import { Package2 } from 'lucide-react';

import * as React from 'react';
import { useLocation } from 'react-router-dom';
import { safeInvoke as invoke } from '@/lib/ipc-safe';

import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useCurrentUserId, useUser } from '@/lib/user-context';

import { navItems, type AppNavItem } from './nav-data';
import { NavMain } from './nav-main';
import { NavUser } from './nav-user';

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user, hasPermission } = useUser();
  const userId = useCurrentUserId();
  const location = useLocation();
  const [recycleBinCount, setRecycleBinCount] = React.useState<number | null>(
    null
  );

  const fetchRecycleCount = React.useCallback(async () => {
    try {
      const n = await invoke<number>('get_recycle_bin_deleted_count', {
        userId,
      });
      setRecycleBinCount(typeof n === 'number' ? n : 0);
    } catch {
      setRecycleBinCount(0);
    }
  }, [userId]);

  React.useEffect(() => {
    void fetchRecycleCount();
  }, [location.pathname, fetchRecycleCount]);

  const visibleNavItems = React.useMemo(() => {
    const filterChildren = (items: AppNavItem['items']) => {
      if (!items) return undefined;
      const allowed = items.filter(child =>
        child.requiredPermission
          ? hasPermission(child.requiredPermission)
          : true
      );
      return allowed.length > 0 ? allowed : undefined;
    };
    return (
      (navItems as AppNavItem[])
        .filter(it =>
          it.requiredPermission ? hasPermission(it.requiredPermission) : true
        )
        .map(it => ({ ...it, items: filterChildren(it.items) }))
        // Drop a top-level item if all of its sub-items were filtered out.
        .filter(it => {
          if (!it.requiredPermission) return true;
          const original = (navItems as AppNavItem[]).find(
            n => n.url === it.url
          );
          if (!original?.items || original.items.length === 0) return true;
          return Boolean(it.items && it.items.length > 0);
        })
    );
  }, [hasPermission]);

  React.useEffect(() => {
    const onBinChange = () => {
      void fetchRecycleCount();
    };
    window.addEventListener('recycle-bin-changed', onBinChange);
    return () => window.removeEventListener('recycle-bin-changed', onBinChange);
  }, [fetchRecycleCount]);

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
      };

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
                  <span className="text-muted-foreground truncate text-xs">
                    by JANA
                  </span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* NavMain now uses your app's navigation items */}
        <NavMain
          items={visibleNavItems}
          badges={
            recycleBinCount != null
              ? { '/recycle-bin': recycleBinCount }
              : undefined
          }
        />
      </SidebarContent>

      <SidebarFooter>
        <Separator className="my-2" />
        <NavUser user={userData} />
      </SidebarFooter>
    </Sidebar>
  );
}
