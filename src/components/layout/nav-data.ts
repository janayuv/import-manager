import {
  BarChart3,
  CircleDollarSign,
  FileText,
  Landmark,
  LayoutDashboard,
  Package,
  Settings,
  Ship,
  Users,
} from 'lucide-react'

export const navItems = [
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
    title: 'Settings',
    url: '/settings',
    icon: Settings,
  },
]
