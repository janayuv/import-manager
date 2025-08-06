// src/components/layout/Sidebar.tsx
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Users, Ship, FileText, Package,
  Landmark, CircleDollarSign, BarChart3,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import { MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from '@/components/layout/theme-context';

interface SidebarProps {
  open: boolean;
  onToggle: () => void;
}

const navItems = [
  { path: '/supplier', label: 'Supplier', icon: Users },
  { path: '/shipment', label: 'Shipment', icon: Ship },
  { path: '/invoice',  label: 'Invoice',  icon: FileText },
  { path: '/item-master', label: 'Item Master', icon: Package },
  { path: '/boe',      label: 'BOE',      icon: Landmark },
  { path: '/boe-entry',      label: 'BOE-Entry',      icon: Landmark },
  { path: '/expenses', label: 'Expenses', icon: CircleDollarSign },
  { path: '/report',   label: 'Report',   icon: BarChart3 },
];

export const Sidebar = ({ open, onToggle }: SidebarProps) => {
  const { theme, setTheme } = useTheme();

  // persist open state
  useEffect(() => {
    localStorage.setItem('sidebarOpen', JSON.stringify(open));
  }, [open]);

  return (
    <motion.aside
      initial={false}
      animate={{ width: open ? 200 : 64 }}
      transition={{ duration: 0.25 }}
      className="border-r h-screen bg-background sticky top-0 flex flex-col"
      aria-label="Primary"
    >
      {/* Toggle */}
      <button
        onClick={onToggle}
        aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
        className="self-end m-4 p-2 rounded-full hover:bg-muted transition"
      >
        {open
          ? <ChevronLeft size={20} className="transition-transform" />
          : <ChevronRight size={20} className="transition-transform" />}
      </button>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-2">
        {navItems.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              cn(
                'group flex items-center p-2 rounded-lg transition-colors relative',
                isActive && 'bg-primary text-primary-foreground',
                !isActive && 'hover:bg-muted',
                !open && 'justify-center'
              )
            }
          >
            {/* Active indicator */}
            <div
              className={cn(
                'absolute left-0 top-0 h-full w-1 rounded-r',
                'bg-transparent group-[.active]:bg-primary'
              )}
            />

            {/* Tooltip wrapper when collapsed */}
            {!open ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Icon size={18} aria-hidden />
                </TooltipTrigger>
                <TooltipContent side="right">
                  {label}
                </TooltipContent>
              </Tooltip>
            ) : (
              <>
                <Icon size={18} aria-hidden />
                <span className="ml-3 font-sm">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Utilities: theme toggle & profile */}
      <div className="px-2 pb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        >
          <SunIcon className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <MoonIcon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>

        {/* Placeholder for user/avatar */}
        <NavLink
          to="/profile"
          className={cn(
            'flex items-center mt-4 p-2 rounded-lg hover:bg-muted transition',
            !open && 'justify-center'
          )}
        >
          <img
            src="/avatar.jpg"
            alt="Your profile"
            className="h-6 w-6 rounded-full"
          />
          {open && <span className="ml-3 font-light">Profile</span>}
        </NavLink>
      </div>
    </motion.aside>
  );
};
