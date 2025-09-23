import { createContext, useContext, useEffect, useState } from 'react';

export type ThemeColor =
  | 'zinc'
  | 'slate'
  | 'gray'
  | 'neutral'
  | 'stone'
  | 'red'
  | 'orange'
  | 'amber'
  | 'yellow'
  | 'lime'
  | 'green'
  | 'emerald'
  | 'teal'
  | 'cyan'
  | 'sky'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'purple'
  | 'fuchsia'
  | 'pink'
  | 'rose';

export type Theme = {
  mode: 'light' | 'dark' | 'system';
  color: ThemeColor;
  customAccentColor?: string; // Custom accent color in hex format
};

interface ThemeProviderState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleMode: () => void;
  setColor: (color: ThemeColor) => void;
  setCustomAccentColor: (color: string | null) => void;
  isDark: boolean;
  isLight: boolean;
  isSystem: boolean;
}

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(
  undefined
);

export function useTheme() {
  const context = useContext(ThemeProviderContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// Hook for getting the effective theme mode (resolved system preference)
export function useEffectiveTheme() {
  const { theme } = useTheme();
  const [effectiveMode, setEffectiveMode] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const getEffectiveMode = () => {
      if (theme.mode === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
      }
      return theme.mode;
    };

    setEffectiveMode(getEffectiveMode());

    if (theme.mode === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => setEffectiveMode(getEffectiveMode());

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme.mode]);

  return effectiveMode;
}

// Hook for theme-aware color utilities
export function useThemeColors() {
  const { theme } = useTheme();
  const effectiveMode = useEffectiveTheme();

  return {
    primary: `hsl(var(--${theme.color}-${effectiveMode === 'dark' ? '400' : '600'}))`,
    secondary: `hsl(var(--${theme.color}-${effectiveMode === 'dark' ? '300' : '700'}))`,
    accent: `hsl(var(--${theme.color}-${effectiveMode === 'dark' ? '200' : '800'}))`,
    muted: `hsl(var(--${theme.color}-${effectiveMode === 'dark' ? '800' : '100'}))`,
    border: `hsl(var(--${theme.color}-${effectiveMode === 'dark' ? '700' : '200'}))`,
    background: `hsl(var(--${theme.color}-${effectiveMode === 'dark' ? '950' : '50'}))`,
    foreground: `hsl(var(--${theme.color}-${effectiveMode === 'dark' ? '50' : '950'}))`,
  };
}

// Utility for theme-aware CSS variables
export function getThemeCSSVariables(theme: Theme, mode: 'light' | 'dark') {
  const color = theme.color;
  const isDark = mode === 'dark';

  return {
    '--background': `hsl(var(--${color}-${isDark ? '950' : '50'}))`,
    '--foreground': `hsl(var(--${color}-${isDark ? '50' : '950'}))`,
    '--card': `hsl(var(--${color}-${isDark ? '900' : '100'}))`,
    '--card-foreground': `hsl(var(--${color}-${isDark ? '50' : '900'}))`,
    '--popover': `hsl(var(--${color}-${isDark ? '900' : '100'}))`,
    '--popover-foreground': `hsl(var(--${color}-${isDark ? '50' : '900'}))`,
    '--primary': `hsl(var(--${color}-${isDark ? '400' : '600'}))`,
    '--primary-foreground': `hsl(var(--${color}-${isDark ? '950' : '50'}))`,
    '--secondary': `hsl(var(--${color}-${isDark ? '800' : '100'}))`,
    '--secondary-foreground': `hsl(var(--${color}-${isDark ? '50' : '900'}))`,
    '--muted': `hsl(var(--${color}-${isDark ? '800' : '100'}))`,
    '--muted-foreground': `hsl(var(--${color}-${isDark ? '400' : '500'}))`,
    '--accent': `hsl(var(--${color}-${isDark ? '800' : '100'}))`,
    '--accent-foreground': `hsl(var(--${color}-${isDark ? '50' : '900'}))`,
    '--destructive': `hsl(var(--red-${isDark ? '400' : '600'}))`,
    '--destructive-foreground': `hsl(var(--${color}-${isDark ? '950' : '50'}))`,
    '--border': `hsl(var(--${color}-${isDark ? '800' : '200'}))`,
    '--input': `hsl(var(--${color}-${isDark ? '800' : '200'}))`,
    '--ring': `hsl(var(--${color}-${isDark ? '400' : '600'}))`,
    '--radius': '0.5rem',
  };
}

export { ThemeProviderContext };
