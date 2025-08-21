import { ChevronRight, Home } from 'lucide-react'

import { Link, useLocation } from 'react-router-dom'

import { cn } from '@/lib/utils'

interface BreadcrumbItem {
  label: string
  href?: string
  icon?: React.ComponentType<{ className?: string }>
}

interface BreadcrumbProps {
  items?: BreadcrumbItem[]
  className?: string
  showHome?: boolean
}

export function Breadcrumb({ items = [], className, showHome = true }: BreadcrumbProps) {
  const location = useLocation()

  // Auto-generate breadcrumbs from current path if no items provided
  const breadcrumbItems = items.length > 0 ? items : generateBreadcrumbsFromPath(location.pathname)

  const allItems = showHome
    ? [{ label: 'Home', href: '/', icon: Home }, ...breadcrumbItems]
    : breadcrumbItems

  return (
    <nav className={cn('text-muted-foreground flex items-center space-x-1 text-sm', className)}>
      {allItems.map((item, index) => {
        const isLast = index === allItems.length - 1
        const isLink = item.href && !isLast

        return (
          <div key={index} className="flex items-center">
            {index > 0 && <ChevronRight className="text-muted-foreground/50 mx-2 h-4 w-4" />}

            {isLink ? (
              <Link
                to={item.href || '/'}
                className="hover:text-foreground flex items-center gap-1 transition-colors duration-200"
              >
                {item.icon && <item.icon className="h-4 w-4" />}
                <span>{item.label}</span>
              </Link>
            ) : (
              <span
                className={cn('flex items-center gap-1', isLast && 'text-foreground font-medium')}
              >
                {item.icon && <item.icon className="h-4 w-4" />}
                <span>{item.label}</span>
              </span>
            )}
          </div>
        )
      })}
    </nav>
  )
}

// Helper function to generate breadcrumbs from pathname
function generateBreadcrumbsFromPath(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split('/').filter(Boolean)

  return segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/')
    const label = segment
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')

    return {
      label,
      href: index === segments.length - 1 ? undefined : href,
    }
  })
}

// Hook for getting breadcrumb items from current route
export function useBreadcrumbs(): BreadcrumbItem[] {
  const location = useLocation()
  return generateBreadcrumbsFromPath(location.pathname)
}
