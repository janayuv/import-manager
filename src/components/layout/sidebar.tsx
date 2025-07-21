// src/components/layout/sidebar.tsx
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
    Users,
    Ship,
    FileText,
    Package,
    Landmark,
    CircleDollarSign,
    BarChart3,
} from 'lucide-react';

// Updated props interface
interface SidebarProps {
  open: boolean;              // Changed from isOpen to open
  onToggle: () => void;       // Added onToggle prop
}

const navItems = [
  { path: '/supplier', label: 'Supplier', icon: <Users size={18} /> },
  { path: '/shipment', label: 'Shipment', icon: <Ship size={18} /> },
  { path: '/invoice', label: 'Invoice', icon: <FileText size={18} /> },
  { path: '/item-master', label: 'Item Master', icon: <Package size={18} /> },
  { path: '/boe', label: 'BOE', icon: <Landmark size={18} /> },
  { path: '/expenses', label: 'Expenses', icon: <CircleDollarSign size={18} /> },
  { path: '/report', label: 'Report', icon: <BarChart3 size={18} /> },
];

export const Sidebar = ({ open, onToggle }: SidebarProps) => {
  return (
    <motion.aside
      initial={false}
      animate={{ width: open ? 256 : 80 }}
      transition={{ duration: 0.3 }}
      className="border-r h-screen bg-background sticky top-0 flex flex-col p-4"
    >
      <div className="flex items-center mb-4">
        {/* Add toggle button for mobile/tablet */}
        <button 
          onClick={onToggle}
          className="md:hidden ml-auto p-2 rounded-lg hover:bg-muted"
        >
          {open ? (
            <span className="i-lucide-panel-left-open text-xl" />
          ) : (
            <span className="i-lucide-panel-left-close text-xl" />
          )}
        </button>
      </div>
      <nav className="flex-1 space-y-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                'flex items-center p-3 rounded-lg hover:bg-muted transition-colors',
                isActive && 'bg-primary text-primary-foreground',
                !open && 'justify-center'
              )
            }
          >
            <span className="shrink-0">{item.icon}</span>
            {open && <span className="ml-4 font-medium">{item.label}</span>}
          </NavLink>
        ))}
      </nav>
    </motion.aside>
  );
};