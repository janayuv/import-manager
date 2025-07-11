import { Button } from '@/components/ui/button'
import { MoonIcon, SunIcon, PanelLeftIcon } from 'lucide-react'
import { useTheme } from 'next-themes'

interface Props {
  onSidebarToggle: () => void
}

export const Navbar = ({ onSidebarToggle }: Props) => {
  const { theme, setTheme } = useTheme()

  return (
    <header className="relative h-16 w-full border-b bg-background px-4 flex items-center">
      {/* Sidebar toggle + Title */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onSidebarToggle}>
          <PanelLeftIcon className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-bold text-[#ff359a]">Import Manager</h1>
      </div>

      {/* Dark mode toggle - fixed to top-right */}
      <div className="absolute top-4 right-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        >
          {theme === 'light' ? (
            <MoonIcon className="w-5 h-5" />
          ) : (
            <SunIcon className="w-5 h-5" />
          )}
        </Button>
      </div>
    </header>
  )
}
