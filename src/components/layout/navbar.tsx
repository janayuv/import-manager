// src/components/layout/navbar.tsx
// The top navigation bar, adapted from your example.
import { Button } from '@/components/ui/button';
import { MoonIcon, SunIcon, PanelLeftOpen } from 'lucide-react';
import { useTheme } from '@/components/layout/theme-context';

interface NavbarProps {
  onSidebarToggle: () => void;
}

export const Navbar = ({ onSidebarToggle }: NavbarProps) => {
  const { theme, setTheme } = useTheme();

  return (
    <header className="h-16 w-full border-b bg-background px-4 flex items-center justify-between shrink-0">
      {/* Sidebar toggle + Title */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onSidebarToggle}>
          <PanelLeftOpen className="w-5 h-5" />
        </Button>
        <h1 className="text-sm font-bold">Import Manager</h1>
      </div>

      {/* Dark mode toggle */}
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        >
          <SunIcon className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <MoonIcon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </div>
    </header>
  );
};