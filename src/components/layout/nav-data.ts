import {
  BarChart3,
  Bot,
  CircleDollarSign,
  Database,
  FileText,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Package,
  ScrollText,
  Settings,
  Shield,
  Ship,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react';

import type { Permission } from '@/lib/permissions';

export type AppNavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  items?: { title: string; url: string; requiredPermission?: Permission }[];
  /**
   * When set, the item (and its sub-items unless they override it) is shown
   * only to users whose effective role grants this permission.
   */
  requiredPermission?: Permission;
};

export const navItems: AppNavItem[] = [
  {
    title: 'Dashboard',
    url: '/',
    icon: LayoutDashboard,
  },
  {
    title: 'Supplier',
    url: '/supplier',
    icon: Users,
  },
  {
    title: 'Shipment',
    url: '/shipment',
    icon: Ship,
  },
  {
    title: 'Invoice',
    url: '/invoice',
    icon: FileText,
    items: [
      { title: 'Invoices', url: '/invoice' },
      { title: 'Invoice Wizard', url: '/invoice-wizard' },
    ],
  },
  {
    title: 'Item Master',
    url: '/item-master',
    icon: Package,
  },
  {
    title: 'BOE',
    url: '/boe',
    icon: Landmark,
    items: [
      { title: 'View All BOE', url: '/boe' },
      { title: 'BOE Entry', url: '/boe-entry' },
      { title: 'BOE Summary', url: '/boe-summary' },
    ],
  },
  {
    title: 'Expenses',
    url: '/expenses',
    icon: CircleDollarSign,
    items: [
      { title: 'Manage Expenses', url: '/expenses' },
      { title: 'Expense Reports', url: '/expense-reports' },
      { title: 'Data Manager', url: '/expense-data-manager' },
    ],
  },
  {
    title: 'Report',
    url: '/report',
    icon: BarChart3,
  },
  {
    title: 'Database Management',
    url: '/database-management',
    icon: Database,
  },
  {
    title: 'Administration',
    url: '/admin/activity-log',
    icon: Shield,
    requiredPermission: 'admin.activity_log',
    items: [
      {
        title: 'Activity log',
        url: '/admin/activity-log',
        requiredPermission: 'admin.activity_log',
      },
      {
        title: 'User activity',
        url: '/admin/user-activity',
        requiredPermission: 'admin.user_activity',
      },
      {
        title: 'System health',
        url: '/admin/system-health',
        requiredPermission: 'admin.system_health',
      },
      {
        title: 'System tools',
        url: '/admin/system-tools',
        requiredPermission: 'admin.system_tools',
      },
    ],
  },
  {
    title: 'Security',
    url: '/admin/security-center',
    icon: KeyRound,
    requiredPermission: 'security.session_read',
    items: [
      {
        title: 'Security center',
        url: '/admin/security-center',
        requiredPermission: 'security.session_read',
      },
      {
        title: 'Roles & permissions',
        url: '/admin/roles-permissions',
        requiredPermission: 'role.read',
      },
    ],
  },
  {
    title: 'Automation & operations',
    url: '/admin/automation-center',
    icon: Bot,
    requiredPermission: 'automation.view',
    items: [
      {
        title: 'Automation center',
        url: '/admin/automation-center',
        requiredPermission: 'automation.view',
      },
      {
        title: 'Rule console',
        url: '/admin/automation-rules',
        requiredPermission: 'automation.view',
      },
      {
        title: 'Operations center',
        url: '/admin/operations-center',
        requiredPermission: 'automation.ops_center',
      },
      {
        title: 'System agent',
        url: '/admin/system-agent',
        requiredPermission: 'automation.system_agent',
      },
    ],
  },
  {
    title: 'Recycle Bin',
    url: '/recycle-bin',
    icon: Trash2,
  },
  {
    title: 'Logs',
    url: '/logs',
    icon: ScrollText,
  },
  {
    title: 'Settings',
    url: '/settings',
    icon: Settings,
    items: [],
  },
];
