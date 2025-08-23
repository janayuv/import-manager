import { Monitor, Moon, Palette, SidebarIcon, Sun } from 'lucide-react'

import { useTheme } from '@/components/layout/theme-context'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { useSidebar } from '@/components/ui/use-sidebar'

export function SiteHeader() {
  const { toggleSidebar } = useSidebar()
  const { theme, setTheme, toggleMode } = useTheme()

  const colorOptions: { key: typeof theme.color; label: string; swatchClass: string }[] = [
    { key: 'zinc', label: 'Zinc', swatchClass: 'bg-zinc-500' },
    { key: 'slate', label: 'Slate', swatchClass: 'bg-slate-500' },
    { key: 'blue', label: 'Blue', swatchClass: 'bg-blue-500' },
    { key: 'cyan', label: 'Cyan', swatchClass: 'bg-cyan-500' },
    { key: 'teal', label: 'Teal', swatchClass: 'bg-teal-500' },
    { key: 'green', label: 'Green', swatchClass: 'bg-green-500' },
    { key: 'orange', label: 'Orange', swatchClass: 'bg-orange-500' },
    { key: 'red', label: 'Red', swatchClass: 'bg-red-500' },
    { key: 'purple', label: 'Purple', swatchClass: 'bg-purple-500' },
    { key: 'violet', label: 'Violet', swatchClass: 'bg-violet-500' },
    { key: 'indigo', label: 'Indigo', swatchClass: 'bg-indigo-500' },
    { key: 'sky', label: 'Sky', swatchClass: 'bg-sky-500' },
    { key: 'pink', label: 'Pink', swatchClass: 'bg-pink-500' },
    { key: 'rose', label: 'Rose', swatchClass: 'bg-rose-500' },
    { key: 'fuchsia', label: 'Fuchsia', swatchClass: 'bg-fuchsia-500' },
  ]

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

          {/* Color Palette */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title={`Theme color: ${theme.color}`}
              >
                <Palette className="h-4 w-4" />
                <span className="sr-only">Change theme color</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-52 p-2"
            >
              <div className="grid grid-cols-5 gap-2">
                {colorOptions.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setTheme({ ...theme, color: c.key })}
                    className={`border-foreground/20 hover:border-foreground/60 ring-ring/50 focus-visible:ring-ring/50 relative flex h-7 w-7 items-center justify-center rounded-full border transition focus-visible:ring-2 focus-visible:outline-none ${c.swatchClass}`}
                    title={c.label}
                  >
                    {theme.color === c.key ? <span className="bg-background/80 block h-2 w-2 rounded-full" /> : null}
                  </button>
                ))}
              </div>
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
