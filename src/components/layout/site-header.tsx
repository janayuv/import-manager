import { Monitor, Moon, SidebarIcon, Sun } from 'lucide-react'

import { useTheme } from '@/components/layout/theme-context'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { useSidebar } from '@/components/ui/use-sidebar'

export function SiteHeader() {
  const { toggleSidebar } = useSidebar()
  const { theme, setTheme, toggleMode } = useTheme()

  const getThemeIcon = () => {
    switch (theme.mode) {
      case 'light':
        return <Sun className="h-4 w-4" />
      case 'dark':
        return <Moon className="h-4 w-4" />
      case 'system':
        return <Monitor className="h-4 w-4" />
      default:
        return <Sun className="h-4 w-4" />
    }
  }

  const getThemeLabel = () => {
    switch (theme.mode) {
      case 'light':
        return 'Light'
      case 'dark':
        return 'Dark'
      case 'system':
        return 'System'
      default:
        return 'Light'
    }
  }

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 flex w-full items-center border-b backdrop-blur">
      <div className="flex h-14 w-full items-center gap-2 px-4">
        <Button
          className="h-8 w-8"
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
        >
          <SidebarIcon className="size-5" />
          <span className="sr-only">Toggle Sidebar</span>
        </Button>
        <Separator
          orientation="vertical"
          className="mr-2 h-6"
        />

        {/* App Title */}
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight">Import Manager</h1>
          <Separator
            orientation="vertical"
            className="h-4"
          />
          <Breadcrumb className="hidden sm:flex" />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Theme Toggle */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
              >
                {getThemeIcon()}
                <span className="sr-only">Toggle theme</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setTheme({ ...theme, mode: 'light' })}>
                <Sun className="mr-2 h-4 w-4" />
                <span>Light</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme({ ...theme, mode: 'dark' })}>
                <Moon className="mr-2 h-4 w-4" />
                <span>Dark</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme({ ...theme, mode: 'system' })}>
                <Monitor className="mr-2 h-4 w-4" />
                <span>System</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Quick Theme Toggle for mobile */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 sm:hidden"
            onClick={toggleMode}
            title={`Current: ${getThemeLabel()}`}
          >
            {getThemeIcon()}
            <span className="sr-only">Toggle theme</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
