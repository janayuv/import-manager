import { Moon, SidebarIcon, Sun } from 'lucide-react'

import { useTheme } from '@/components/layout/theme-context'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useSidebar } from '@/components/ui/use-sidebar'

export function SiteHeader() {
  const { toggleSidebar } = useSidebar()
  const { theme, setTheme } = useTheme()

  const toggleThemeMode = () => {
    const newMode = theme.mode === 'light' ? 'dark' : 'light'
    setTheme({ ...theme, mode: newMode })
  }

  return (
    <header className="bg-background sticky top-0 z-40 flex w-full items-center border-b">
      <div className="flex h-14 w-full items-center gap-2 px-4">
        <Button className="h-8 w-8" variant="ghost" size="icon" onClick={toggleSidebar}>
          <SidebarIcon className="size-5" />
          <span className="sr-only">Toggle Sidebar</span>
        </Button>
        <Separator orientation="vertical" className="mr-2 h-6" />

        {/* MODIFIED: Changed text size for a cleaner look */}
        <h1 className="text-lg font-semibold tracking-tight">Import Manager</h1>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggleThemeMode}>
            <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
            <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
            <span className="sr-only">Toggle theme</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
