// src/components/layout/app-sidebar.tsx
// Industrial Console sidebar — Import Manager
// Drop-in replacement. Self-contained (does not depend on @/components/ui/sidebar).
// Reads navItems from ./nav-data.ts unchanged.

import * as React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronRight, MoreHorizontal } from 'lucide-react';

import { safeInvoke as invoke } from '@/lib/ipc-safe';
import { useCurrentUserId, useUser } from '@/lib/user-context';

import { navItems, type AppNavItem } from './nav-data';

import './app-sidebar.css';

// Grouping — purely visual. Keeps the source order of nav-data.ts.
const GROUPS: { label: string; urls: string[] }[] = [
  { label: '', urls: ['/'] },
  {
    label: 'OPERATIONS',
    urls: [
      '/supplier',
      '/shipment',
      '/invoice',
      '/item-master',
      '/boe',
      '/saved-boe',
      '/expenses',
    ],
  },
  { label: 'REPORTING', urls: ['/report', '/database-management'] },
  {
    label: 'ADMINISTRATION',
    urls: [
      '/admin/activity-log',
      '/admin/security-center',
      '/admin/automation-center',
    ],
  },
  { label: 'SYSTEM', urls: ['/recycle-bin', '/logs', '/settings'] },
];

export interface AppSidebarProps {
  /** Controlled collapsed state. If omitted, the sidebar manages its own. */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function AppSidebar({
  collapsed: collapsedProp,
  onCollapsedChange,
}: AppSidebarProps) {
  const { user, hasPermission } = useUser();
  const userId = useCurrentUserId();
  const location = useLocation();

  // collapsed state — controlled OR internal
  const [internalCollapsed, setInternalCollapsed] = React.useState(false);
  const collapsed = collapsedProp ?? internalCollapsed;
  const setCollapsed = (v: boolean) => {
    setInternalCollapsed(v);
    onCollapsedChange?.(v);
  };

  // Recycle bin badge
  const [recycleCount, setRecycleCount] = React.useState<number | null>(null);
  const fetchRecycleCount = React.useCallback(async () => {
    try {
      const n = await invoke<number>('get_recycle_bin_deleted_count', {
        userId,
      });
      setRecycleCount(typeof n === 'number' ? n : 0);
    } catch {
      setRecycleCount(0);
    }
  }, [userId]);

  React.useEffect(() => {
    void fetchRecycleCount();
  }, [location.pathname, fetchRecycleCount]);
  React.useEffect(() => {
    const onBinChange = () => {
      void fetchRecycleCount();
    };
    window.addEventListener('recycle-bin-changed', onBinChange);
    return () => window.removeEventListener('recycle-bin-changed', onBinChange);
  }, [fetchRecycleCount]);

  // Permission-filtered nav items (same logic as original app-sidebar.tsx)
  const visibleNavItems = React.useMemo<AppNavItem[]>(() => {
    const filterChildren = (items: AppNavItem['items']) => {
      if (!items) return undefined;
      const allowed = items.filter(child =>
        child.requiredPermission
          ? hasPermission(child.requiredPermission)
          : true
      );
      return allowed.length > 0 ? allowed : undefined;
    };
    return (navItems as AppNavItem[])
      .filter(it =>
        it.requiredPermission ? hasPermission(it.requiredPermission) : true
      )
      .map(it => ({ ...it, items: filterChildren(it.items) }))
      .filter(it => {
        if (!it.requiredPermission) return true;
        const original = (navItems as AppNavItem[]).find(n => n.url === it.url);
        if (!original?.items || original.items.length === 0) return true;
        return Boolean(it.items && it.items.length > 0);
      });
  }, [hasPermission]);

  // Group nav items by GROUPS config
  const groupedNav = React.useMemo(() => {
    const byUrl = new Map(visibleNavItems.map(it => [it.url, it]));
    return GROUPS.map(g => ({
      label: g.label,
      items: g.urls.map(u => byUrl.get(u)).filter(Boolean) as AppNavItem[],
    })).filter(g => g.items.length > 0);
  }, [visibleNavItems]);

  // Submenu open/close state — open the group containing the active route
  const initiallyOpen = React.useMemo(() => {
    const match = visibleNavItems.find(
      it => it.items && it.items.some(s => location.pathname.startsWith(s.url))
    );
    return match?.title ?? null;
  }, [visibleNavItems, location.pathname]);
  const [openSubmenu, setOpenSubmenu] = React.useState<string | null>(
    initiallyOpen
  );
  // Sync submenu open state with collapse changes:
  // collapsed → wipe state so a hidden submenu can't bleed through on re-expand;
  // expanded → restore whatever the active route requires.
  React.useEffect(() => {
    setOpenSubmenu(collapsed ? null : initiallyOpen);
  }, [initiallyOpen, collapsed]);

  // User display data
  const userData = user ?? {
    name: 'Guest User',
    email: 'guest@importmanager.com',
    avatar: '',
  };
  const initials = React.useMemo(() => {
    const parts = userData.name.trim().split(/\s+/);
    return (
      ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'GU'
    );
  }, [userData.name]);

  return (
    <aside
      className="im-sidebar"
      data-collapsed={collapsed ? 'true' : 'false'}
      aria-label="Primary navigation"
    >
      {/* Header */}
      <header className="im-sb-header">
        <div className="im-sb-logo" aria-hidden="true">
          IM
        </div>
        {!collapsed && (
          <div className="im-sb-title">
            <div className="im-sb-title-main">IMPORT MANAGER</div>
            <div className="im-sb-title-sub">by JANA</div>
          </div>
        )}
      </header>

      {/* Status strip */}
      <div className="im-sb-status">
        <span className="im-sb-status-dot" />
        {!collapsed && (
          <>
            <span>DB · ONLINE</span>
            <span className="im-sb-status-meta">SYNC</span>
          </>
        )}
      </div>

      {/* Nav */}
      <nav className="im-sb-nav">
        {groupedNav.map((group, gi) => (
          <div
            key={group.label || `g-${gi}`}
            className="im-sb-group"
            data-first={gi === 0 ? 'true' : 'false'}
          >
            {!collapsed && group.label && (
              <div className="im-sb-group-label">// {group.label}</div>
            )}
            {group.items.map(item => (
              <NavRow
                key={item.title}
                item={item}
                collapsed={collapsed}
                openSubmenu={openSubmenu}
                setOpenSubmenu={setOpenSubmenu}
                recycleCount={recycleCount}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <footer className="im-sb-footer">
        <div className="im-sb-user">
          <div className="im-sb-avatar" aria-hidden="true">
            {initials}
          </div>
          {!collapsed && (
            <>
              <div className="im-sb-user-text">
                <div className="im-sb-user-name">{userData.name}</div>
                <div className="im-sb-user-email">{userData.email}</div>
              </div>
              <button
                type="button"
                className="im-sb-user-more"
                aria-label="Account menu"
              >
                <MoreHorizontal size={14} />
              </button>
            </>
          )}
        </div>
        <button
          type="button"
          className="im-sb-collapse-btn"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronRight
            size={12}
            style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}
          />
          {!collapsed && <span>COLLAPSE</span>}
        </button>
      </footer>
    </aside>
  );
}

// NavRow — single top-level item with optional submenu
interface NavRowProps {
  item: AppNavItem;
  collapsed: boolean;
  openSubmenu: string | null;
  setOpenSubmenu: (s: string | null) => void;
  recycleCount: number | null;
}

function NavRow({
  item,
  collapsed,
  openSubmenu,
  setOpenSubmenu,
  recycleCount,
}: NavRowProps) {
  const Icon = item.icon;
  const location = useLocation();
  const hasSub = !!item.items && item.items.length > 0;
  const isOpen = openSubmenu === item.title;

  const pathActive = (path: string) =>
    path === '/'
      ? location.pathname === '/'
      : location.pathname === path || location.pathname.startsWith(`${path}/`);
  const groupActive = hasSub && item.items!.some(s => pathActive(s.url));
  const isActive = pathActive(item.url) || groupActive;

  const badge =
    item.url === '/recycle-bin' && recycleCount != null && recycleCount > 0
      ? recycleCount
      : undefined;

  const handleClick = (e: React.MouseEvent) => {
    // In collapsed mode every item must be reachable via its URL — never swallow
    // the click. The submenu render is gated on !collapsed anyway, so toggling
    // openSubmenu here would have no visible effect and would only poison state.
    if (hasSub && !collapsed) {
      e.preventDefault();
      setOpenSubmenu(isOpen ? null : item.title);
    }
  };

  return (
    <div className="im-sb-row">
      <NavLink
        to={item.url}
        onClick={handleClick}
        title={collapsed ? item.title : undefined}
        className={({ isActive: linkActive }) =>
          'im-sb-link' + (isActive || linkActive ? ' is-active' : '')
        }
      >
        <Icon size={16} className="im-sb-icon" />
        {!collapsed && (
          <>
            <span className="im-sb-label">{item.title}</span>
            {badge != null && (
              <span className="im-sb-badge">
                {String(badge).padStart(2, '0')}
              </span>
            )}
            {hasSub && (
              <ChevronRight
                size={12}
                className="im-sb-chevron"
                data-open={isOpen ? 'true' : 'false'}
              />
            )}
          </>
        )}
      </NavLink>

      {!collapsed && hasSub && isOpen && (
        <div className="im-sb-submenu">
          {item.items!.map(s => (
            <NavLink
              key={s.url}
              to={s.url}
              className={({ isActive }) =>
                'im-sb-sublink' + (isActive ? ' is-active' : '')
              }
            >
              <span className="im-sb-subdot" />
              <span>{s.title}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}
