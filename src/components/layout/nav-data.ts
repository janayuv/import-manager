import {
  BarChart3,
  Bot,
  CircleDollarSign,
  Database,
  FileText,
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

export type AppNavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  items?: { title: string; url: string }[];
  /** When true, link is shown only to users with an admin role. */
  adminOnly?: boolean;
  /** Automation console: admin, automation manager, or viewer. */
  automationConsole?: boolean;
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
    adminOnly: true,
    items: [
      { title: 'Activity log', url: '/admin/activity-log' },
      { title: 'User activity', url: '/admin/user-activity' },
      { title: 'System health', url: '/admin/system-health' },
      { title: 'System tools', url: '/admin/system-tools' },
    ],
  },
  {
    title: 'Automation & operations',
    url: '/admin/automation-center',
    icon: Bot,
    automationConsole: true,
    items: [
      { title: 'Automation center', url: '/admin/automation-center' },
      { title: 'Rule console', url: '/admin/automation-rules' },
      { title: 'Operations center', url: '/admin/operations-center' },
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
