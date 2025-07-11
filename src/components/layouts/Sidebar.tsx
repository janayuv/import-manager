import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Home, Users, FileText, Package, FileArchive } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'

interface Props {
  open: boolean
  onToggle: () => void
}

const navItems = [
  { path: '/', label: 'Dashboard', icon: <Home size={18} /> },
  { path: '/suppliers', label: 'Suppliers', icon: <Users size={18} /> },
  { path: '/invoices', label: 'Invoices', icon: <FileText size={18} /> },
  { path: '/items', label: 'Items', icon: <Package size={18} /> },
  { path: '/boe', label: 'BOE', icon: <FileArchive size={18} /> },
]

export const Sidebar = ({ open, onToggle }: Props) => {
  return (
    <motion.aside
      initial={false}
      animate={{ width: open ? 240 : 64 }}
      transition={{ duration: 0.2 }}
      className="border-r h-screen bg-background sticky top-0 flex flex-col"
    >
      <div className="p-4 flex justify-end">
        <Button variant="ghost" size="icon" onClick={onToggle}>
          {open ? '<' : '>'}
        </Button>
      </div>
      <nav className="flex-1 space-y-1 px-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                'flex items-center px-3 py-2 rounded-md hover:bg-muted transition-all',
                isActive && 'bg-primary text-primary-foreground'
              )
            }
          >
            <span className="mr-2">{item.icon}</span>
            {open && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>
    </motion.aside>
  )
}
